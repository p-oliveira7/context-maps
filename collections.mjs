// Coleções de requests no formato do Bruno: uma pasta com bruno.json, pastas, arquivos .bru e environments/*.bru.
// Uma coleção pode ter uma pasta de referência (por exemplo a pasta que o Bruno edita): .links/<id>.json guarda o caminho e o que já foi lido.
// Segredos de ambiente ficam em <pasta de coleções>/.secrets/<id>.json (fora do Git e fora de exportações).
import {readFile,writeFile,readdir,mkdir,rm,rename,stat,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseBru,stringifyBru,parseBlocks,stringifyBlocks,toModel,fromModel,parseEnv,stringifyEnv,METHODS} from './bru.mjs';
import {writeZip,readZip} from './zip.mjs';
import {normalizeMocks,emptyMocks,MAX_FILE} from './mocks.js';

const ALLOWED_EXT=new Set(['.bru','.json','.md']);
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const slugOf=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);

export function createCollections({dir,writeJson}){
 const secretsFile=id=>path.join(dir,'.secrets',`${id}.json`);
 const collDir=id=>{if(!/^[a-z0-9][a-z0-9-]{0,60}$/.test(String(id)))throw fail(400,'Identificador inválido');return path.join(dir,id);};
 // caminho relativo dentro de uma coleção: sem "..", sem absoluto, sem segmentos ocultos
 function inside(id,rel=''){
  const root=collDir(id),parts=String(rel||'').split('/').filter(Boolean);
  if(parts.some(p=>p==='..'||p.startsWith('.')||p.includes('\\')||/[:*?"<>|]/.test(p)))throw fail(400,'Caminho inválido');
  return {root,file:path.join(root,...parts),parts};
 }
 const readText=file=>readFile(file,'utf8');
 const uniqueName=(parent,base,ext='')=>{let n=base||'item',i=2;while(existsSync(path.join(parent,n+ext)))n=`${base}-${i++}`;return n+ext;};
 const metaOf=async file=>{try{return toModel(parseBlocks(await readText(file)));}catch{return {};}};

 /* configurações do Context Maps para a coleção, em bruno.json → "contextMaps" (o Bruno ignora a chave) */
 async function readSettings(id){
  try{const cfg=JSON.parse(await readText(path.join(collDir(id),'bruno.json'))).contextMaps||{};return {verifyTls:cfg.verifyTls!==false};}catch{return {verifyTls:true};}
 }
 async function writeSettings(id,data){
  const file=path.join(collDir(id),'bruno.json');if(!existsSync(file))throw fail(404,'Coleção inexistente');
  const cfg=JSON.parse(await readText(file)),next={...(cfg.contextMaps||{})};
  if(typeof data?.verifyTls==='boolean'){if(data.verifyTls)delete next.verifyTls;else next.verifyTls=false;}
  if(Object.keys(next).length)cfg.contextMaps=next;else delete cfg.contextMaps;
  await writeJson(file,cfg);return readSettings(id);
 }
 async function readName(id){try{return JSON.parse(await readText(path.join(collDir(id),'bruno.json'))).name||id;}catch{return id;}}
 async function list(){
  await mkdir(dir,{recursive:true});
  const out=[];
  for(const e of await readdir(dir,{withFileTypes:true})){
   if(!e.isDirectory()||e.name.startsWith('.')||!existsSync(path.join(dir,e.name,'bruno.json')))continue;
   out.push({id:e.name,name:await readName(e.name),requests:await countRequests(path.join(dir,e.name)),...((await readLink(e.name))?{linked:true}:{})});
  }
  return out.sort((a,b)=>a.name.localeCompare(b.name));
 }
 async function countRequests(folder){
  let n=0;
  for(const e of await readdir(folder,{withFileTypes:true})){
   if(e.name.startsWith('.')||e.name==='environments')continue;
   if(e.isDirectory())n+=await countRequests(path.join(folder,e.name));
   else if(e.name.endsWith('.bru')&&e.name!=='collection.bru'&&e.name!=='folder.bru')n++;
  }
  return n;
 }
 const bySeq=(a,b)=>(a.seq??1e9)-(b.seq??1e9)||a.name.localeCompare(b.name);
 async function tree(id,rel=''){
  const {root,file,parts}=inside(id,rel),items=[];
  for(const e of await readdir(file,{withFileTypes:true})){
   if(e.name.startsWith('.'))continue;
   const itemPath=[...parts,e.name].join('/');
   if(e.isDirectory()){
    if(e.name==='environments'&&!rel)continue;
    const meta=await metaOf(path.join(file,e.name,'folder.bru'));
    items.push({type:'folder',name:meta.name||e.name,path:itemPath,seq:meta.seq,children:await tree(id,itemPath)});
   }else if(e.name.endsWith('.bru')&&e.name!=='collection.bru'&&e.name!=='folder.bru'){
    const m=await metaOf(path.join(file,e.name));
    items.push({type:'request',name:m.name||e.name.slice(0,-4),path:itemPath,method:m.method||'get',url:m.url||'',seq:m.seq});
   }
  }
  void root;
  return items.sort(bySeq);
 }
 async function defaults(id){ // cabeçalhos e variáveis de collection.bru, aplicados a todas as requests
  const file=path.join(collDir(id),'collection.bru');
  if(!existsSync(file))return {headers:[],vars:[]};
  const m=await metaOf(file);return {headers:m.headers||[],vars:m.varsPre||[]};
 }
 async function environments(id){
  const folder=path.join(collDir(id),'environments');
  if(!existsSync(folder))return [];
  return (await readdir(folder)).filter(f=>f.endsWith('.bru')).map(f=>f.slice(0,-4)).sort();
 }
 const secretsOf=async id=>{try{return JSON.parse(await readText(secretsFile(id)));}catch{return {};}};
 async function readEnv(id,name){
  const file=path.join(collDir(id),'environments',`${slugFile(name)}.bru`);
  if(!existsSync(file))throw fail(404,'Ambiente inexistente');
  const env=parseEnv(await readText(file)),values=(await secretsOf(id))[name]||{};
  return {name,vars:[...env.vars,...env.secrets.map(n=>({name:n,value:values[n]??'',enabled:true,secret:true}))]};
 }
 const slugFile=name=>String(name||'').replace(/[\\/:*?"<>|]/g,'').replace(/^\.+/,'').trim().slice(0,60)||'env';
 async function writeEnv(id,name,vars){
  const folder=path.join(collDir(id),'environments');await mkdir(folder,{recursive:true});
  const clean=(Array.isArray(vars)?vars:[]).filter(v=>v&&typeof v.name==='string'&&v.name.trim()).slice(0,200).map(v=>({name:v.name.trim(),value:String(v.value??''),enabled:v.enabled!==false,secret:!!v.secret}));
  await writeFile(path.join(folder,`${slugFile(name)}.bru`),stringifyEnv({vars:clean,secrets:clean.filter(v=>v.secret).map(v=>v.name)}));
  const all=await secretsOf(id);all[name]=Object.fromEntries(clean.filter(v=>v.secret).map(v=>[v.name,v.value]));
  await mkdir(path.dirname(secretsFile(id)),{recursive:true});await writeJson(secretsFile(id),all);
 }
 async function createCollection(name){
  const title=String(name||'').trim().slice(0,100);if(!title)throw fail(400,'Informe um nome');
  await mkdir(dir,{recursive:true});
  const id=uniqueName(dir,slugOf(title)||'colecao');
  await mkdir(path.join(dir,id));
  await writeJson(path.join(dir,id,'bruno.json'),{version:'1',name:title,type:'collection',ignore:['node_modules','.git']});
  return {id,name:title};
 }
 // parâmetros de query e de caminho (/:id) que a URL já traz, como o Bruno grava (params:query / params:path)
 function paramsOfUrl(url){
  const at=url.indexOf('?'),base=at<0?url:url.slice(0,at),qs=at<0?'':url.slice(at+1),out={};
  const query=qs.split('&').filter(Boolean).map(pair=>{const i=pair.indexOf('=');return {name:i<0?pair:pair.slice(0,i),value:i<0?'':pair.slice(i+1),enabled:true};}).filter(e=>e.name);
  const pathParams=[...base.matchAll(/\/:([A-Za-z_]\w*)/g)].map(m=>({name:m[1],value:'',enabled:true}));
  if(query.length)out.query=query;if(pathParams.length)out.pathParams=pathParams;
  return out;
 }
 async function createItem(id,{type,parent='',name,method,url}){
  const title=String(name||'').trim().slice(0,100);if(!title)throw fail(400,'Informe um nome');
  const {file:folder,parts}=inside(id,parent);
  if(!existsSync(folder))throw fail(404,'Pasta inexistente');
  const siblings=await tree(id,parent),seq=Math.max(0,...siblings.map(s=>s.seq||0))+1;
  if(type==='folder'){
   const dirName=uniqueName(folder,slugOf(title)||'pasta');await mkdir(path.join(folder,dirName));
   await writeFile(path.join(folder,dirName,'folder.bru'),stringifyBlocks(fromModel({name:title,type:'folder',seq})));
   return {type,path:[...parts,dirName].join('/')};
  }
  if(type!=='request')throw fail(400,'Tipo inválido');
  const verb=METHODS.includes(String(method||'').toLowerCase())?String(method).toLowerCase():'get';
  const fileName=uniqueName(folder,slugOf(title)||'request','.bru');
  await writeFile(path.join(folder,fileName),stringifyBru({name:title,type:'http',seq,method:verb,url:String(url||''),...paramsOfUrl(String(url||'')),bodyMode:'none',authMode:'none'}));
  return {type,path:[...parts,fileName].join('/')};
 }
 const requestFile=(id,rel)=>{const {file}=inside(id,rel);if(!file.endsWith('.bru'))throw fail(400,'Caminho inválido');return file;};
 async function readRequest(id,rel){const file=requestFile(id,rel);if(!existsSync(file))throw fail(404,'Request inexistente');return {path:rel,...parseBru(await readText(file))};}
 async function writeRequest(id,rel,model){
  const file=requestFile(id,rel);if(!existsSync(file))throw fail(404,'Request inexistente');
  if(!model||typeof model!=='object'||typeof model.name!=='string'||!METHODS.includes(model.method))throw fail(400,'Estrutura inválida');
  const {path:_p,...clean}=model;
  await writeFile(file,stringifyBru(clean));
 }
 async function renameItem(id,rel,name){
  const title=String(name||'').trim().slice(0,100);if(!title)throw fail(400,'Informe um nome');
  const {file}=inside(id,rel);if(!existsSync(file))throw fail(404,'Item inexistente');
  const info=await stat(file),target=info.isDirectory()?path.join(file,'folder.bru'):file;
  const model=existsSync(target)?parseBru(await readText(target)):{type:'folder',seq:undefined};
  model.name=title;await writeFile(target,info.isDirectory()?stringifyBlocks(fromModel(model)):stringifyBru(model));
 }
 async function removeItem(id,rel){
  const {file,parts}=inside(id,rel);if(!parts.length)throw fail(400,'Caminho inválido');
  if(!existsSync(file))throw fail(404,'Item inexistente');
  await rm(file,{recursive:true,force:true});
  await dropMocks(id,parts.join('/'));
 }
 // Copia ou move um item (request ou pasta) para outra pasta, desta coleção ou de outra. Os mocks do item vão junto.
 const RESERVED=new Set(['bruno.json','collection.bru','folder.bru','mocks.json']);
 async function copyTree(from,to){
  if((await stat(from)).isDirectory()){
   await mkdir(to);
   for(const e of await readdir(from,{withFileTypes:true})){
    if(e.name.startsWith('.'))continue;
    if(e.isDirectory()||ALLOWED_EXT.has(path.extname(e.name).toLowerCase()))await copyTree(path.join(from,e.name),path.join(to,e.name));
   }
  }else await copyFile(from,to);
 }
 async function transfer(id,{path:rel,to,mode,name}={}){
  if(mode!=='copy'&&mode!=='move')throw fail(400,'Estrutura inválida');
  const src=inside(id,String(rel||''));
  if(!src.parts.length||RESERVED.has(src.parts.at(-1))||(src.parts.length===1&&src.parts[0]==='environments'))throw fail(400,'Caminho inválido');
  if(!existsSync(src.file))throw fail(404,'Item inexistente');
  const isDir=(await stat(src.file)).isDirectory();
  if(!isDir&&!src.file.endsWith('.bru'))throw fail(400,'Caminho inválido');
  const destId=to?.collection?String(to.collection):id,dest=inside(destId,String(to?.parent||''));
  if(!existsSync(path.join(dest.root,'bruno.json'))||!existsSync(dest.file)||!(await stat(dest.file)).isDirectory())throw fail(404,'Pasta inexistente');
  const srcRel=src.parts.join('/'),destRel=dest.parts.join('/');
  if(isDir&&destId===id&&(destRel===srcRel||destRel.startsWith(`${srcRel}/`)))throw fail(400,'A pasta não pode ir para dentro dela mesma');
  if(mode==='move'&&destId===id&&src.parts.slice(0,-1).join('/')===destRel)return {collection:id,path:srcRel};
  const seq=Math.max(0,...(await tree(destId,destRel)).map(s=>s.seq||0))+1;
  const last=src.parts.at(-1),fileName=isDir?uniqueName(dest.file,last):uniqueName(dest.file,last.slice(0,-4),'.bru'),target=path.join(dest.file,fileName);
  if(mode==='move'){
   try{await rename(src.file,target);}catch{await copyTree(src.file,target);await rm(src.file,{recursive:true,force:true});}
  }else await copyTree(src.file,target);
  const meta=isDir?path.join(target,'folder.bru'):target,title=String(name||'').trim().slice(0,100);
  const model=existsSync(meta)?parseBru(await readText(meta)):{name:last,type:'folder'};
  model.seq=seq;if(title)model.name=title;
  await writeFile(meta,isDir?stringifyBlocks(fromModel(model)):stringifyBru(model));
  const newRel=[...dest.parts,fileName].join('/');
  await carryMocks(id,srcRel,destId,newRel,mode==='move');
  return {collection:destId,path:newRel};
 }
 async function carryMocks(id,rel,destId,newRel,move){
  const from=await readMocks(id),keys=Object.keys(from.requests).filter(k=>k===rel||k.startsWith(`${rel}/`));
  if(!keys.length)return;
  const into=destId===id?from:await readMocks(destId);
  for(const k of keys){into.requests[newRel+k.slice(rel.length)]=JSON.parse(JSON.stringify(from.requests[k]));if(move)delete from.requests[k];}
  if(move&&destId!==id)await writeMocks(id,from);
  await writeMocks(destId,into);
 }
 // mocks.json: cenários de resposta simulada por request (fica na coleção, junto do Git; os .bru não mudam)
 const mocksFile=id=>path.join(collDir(id),'mocks.json');
 async function readMocks(id){
  if(!existsSync(path.join(collDir(id),'bruno.json')))throw fail(404,'Coleção inexistente');
  const file=mocksFile(id);if(!existsSync(file))return emptyMocks();
  try{return normalizeMocks(JSON.parse(await readText(file)));}catch{return emptyMocks();}
 }
 async function writeMocks(id,data){
  if(!existsSync(path.join(collDir(id),'bruno.json')))throw fail(404,'Coleção inexistente');
  const clean=normalizeMocks(data);
  if(JSON.stringify(clean).length>MAX_FILE)throw Object.assign(new Error('Corpo grande demais'),{status:413});
  if(!Object.keys(clean.requests).length)await rm(mocksFile(id),{force:true});else await writeJson(mocksFile(id),clean);
  return clean;
 }
 async function dropMocks(id,rel){ // a request (ou pasta) foi apagada: os mocks dela também
  const mocks=await readMocks(id),keys=Object.keys(mocks.requests).filter(k=>k===rel||k.startsWith(`${rel}/`));
  if(!keys.length)return;
  for(const k of keys)delete mocks.requests[k];
  await writeMocks(id,mocks);
 }
 async function reorder(id,parent,order){
  const {file:folder,parts}=inside(id,parent);
  const wanted=(Array.isArray(order)?order:[]).map(String);
  for(const [i,rel] of wanted.entries()){
   const {file,parts:p}=inside(id,rel);if(p.slice(0,-1).join('/')!==parts.join('/')||!existsSync(file))throw fail(400,'Caminho inválido');
   const info=await stat(file),target=info.isDirectory()?path.join(file,'folder.bru'):file;
   const model=existsSync(target)?parseBru(await readText(target)):{name:p.at(-1),type:'folder'};
   model.seq=i+1;await writeFile(target,info.isDirectory()?stringifyBlocks(fromModel(model)):stringifyBru(model));
  }
  void folder;
 }
 async function removeEnv(id,name){
  const file=path.join(collDir(id),'environments',`${slugFile(name)}.bru`);if(!existsSync(file))throw fail(404,'Ambiente inexistente');
  await rm(file);const all=await secretsOf(id);delete all[name];await writeJson(secretsFile(id),all);
 }
 async function removeCollection(id){
  const root=collDir(id);if(!existsSync(path.join(root,'bruno.json')))throw fail(404,'Coleção inexistente');
  await rm(root,{recursive:true,force:true});await rm(secretsFile(id),{force:true});await rm(linkFile(id),{force:true});revs.delete(id);due.delete(id);
 }
 /* ---------- pasta de referência (coleção vinculada) ----------
    A coleção continua sendo uma cópia em <coleções>/<id>: é ela que o app lê e grava, e é ela que vale se a pasta de origem sumir.
    Sincronizar traz da origem só o que mudou lá desde a última leitura (arquivo novo, alterado ou apagado); o que mudou só na cópia fica. */
 const linkFile=id=>path.join(dir,'.links',`${id}.json`);
 const readLink=async id=>{try{const l=JSON.parse(await readText(linkFile(id)));return typeof l?.source==='string'?{files:{},...l}:null;}catch{return null;}};
 const revs=new Map(),due=new Map(); // revs: muda quando uma sincronização alterou a cópia (a tela usa para saber se precisa recarregar)
 const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
 const within=(child,parent)=>{const rel=path.relative(parent,child);return !rel||(!rel.startsWith('..')&&!path.isAbsolute(rel));};
 const sourceOk=async source=>{try{return (await stat(source)).isDirectory()&&existsSync(path.join(source,'bruno.json'));}catch{return false;}};
 async function cleanSource(value){
  const text=String(value||'').trim().replace(/^"(.*)"$/,'$1');
  if(!text||!path.isAbsolute(text))throw fail(400,'Informe o caminho completo da pasta');
  const source=path.resolve(text);
  if(!(await sourceOk(source)))throw fail(400,'Pasta sem bruno.json');
  if(within(source,path.resolve(dir)))throw fail(400,'Escolha uma pasta fora das coleções do app');
  return source;
 }
 async function scanSource(root){
  const out=[];
  const walk=async(abs,rel)=>{
   for(const e of await readdir(abs,{withFileTypes:true})){
    if(e.name.startsWith('.')||e.name==='node_modules'||out.length>=3000)continue;
    const next=path.join(abs,e.name),r=rel?`${rel}/${e.name}`:e.name;
    if(e.isDirectory())await walk(next,r);
    else if(e.isFile()&&ALLOWED_EXT.has(path.extname(e.name).toLowerCase())){const info=await stat(next);if(info.size<=2*1024*1024)out.push({rel:r,abs:next,size:info.size,mtime:Math.round(info.mtimeMs)});}
   }
  };
  await walk(root,'');return out;
 }
 const linkState=(id,link,available,extra={})=>({linked:true,source:link.source,available,syncedAt:link.syncedAt||null,rev:revs.get(id)||0,...extra});
 async function linkInfo(id){const link=await readLink(id);return link?linkState(id,link,await sourceOk(link.source)):null;}
 async function sync(id){
  const root=collDir(id),link=await readLink(id);
  if(!link||!existsSync(path.join(root,'bruno.json')))return null;
  if(!(await sourceOk(link.source)))return linkState(id,link,false,{changed:0,removed:0});
  const seen=new Set(),files={};let changed=0,removed=0;
  for(const f of await scanSource(link.source)){
   seen.add(f.rel);const old=link.files[f.rel];
   if(old&&old.size===f.size&&old.mtime===f.mtime){files[f.rel]=old;continue;}
   const data=await readFile(f.abs),hash=createHash('sha1').update(data).digest('hex');
   files[f.rel]={size:f.size,mtime:f.mtime,hash};
   if(old?.hash===hash)continue;
   const target=path.join(root,...f.rel.split('/'));await mkdir(path.dirname(target),{recursive:true});
   if(f.rel==='bruno.json'){ // as configurações do Context Maps para a coleção ficam na cópia
    let cfg,mine;try{cfg=JSON.parse(data.toString('utf8'));}catch{continue;}
    try{mine=JSON.parse(await readText(target)).contextMaps;}catch{}
    if(mine)cfg.contextMaps=mine;
    await writeJson(target,cfg);
   }else await writeFile(target,data);
   changed++;
  }
  for(const rel of Object.keys(link.files)){ // o que a origem tinha na última leitura e não tem mais
   if(seen.has(rel)||rel==='bruno.json')continue;
   const target=path.join(root,...rel.split('/'));if(!existsSync(target))continue;
   await rm(target,{force:true});removed++;
   if(rel.endsWith('.bru'))await dropMocks(id,rel).catch(()=>{});
   for(let d=path.dirname(target);d!==root&&within(d,root)&&!(await readdir(d)).length;d=path.dirname(d))await rm(d,{recursive:true,force:true}); // pastas que ficaram vazias
  }
  const next={source:link.source,syncedAt:new Date().toISOString(),files};
  await mkdir(path.dirname(linkFile(id)),{recursive:true});await writeJson(linkFile(id),next);
  if(changed||removed)revs.set(id,(revs.get(id)||0)+1);
  return linkState(id,next,true,{changed,removed});
 }
 // leituras de uma coleção vinculada passam por aqui: no máximo uma sincronização a cada 1,5 s, e nunca duas ao mesmo tempo
 function syncIfDue(id){
  const last=due.get(id);
  if(last&&(last.pending||Date.now()-last.at<1500))return last.promise;
  const entry={at:Date.now(),pending:true};
  entry.promise=sync(id).catch(()=>null).finally(()=>{entry.pending=false;entry.at=Date.now();});
  due.set(id,entry);return entry.promise;
 }
 async function setLink(id,value){
  if(!existsSync(path.join(collDir(id),'bruno.json')))throw fail(404,'Coleção inexistente');
  const source=await cleanSource(value);
  await mkdir(path.dirname(linkFile(id)),{recursive:true});await writeJson(linkFile(id),{source,syncedAt:null,files:{}});
  return sync(id);
 }
 async function removeLink(id){collDir(id);await rm(linkFile(id),{force:true});revs.delete(id);due.delete(id);}
 // abre uma pasta do Bruno mantendo o vínculo: cria a cópia (ou reusa a coleção que já aponta para a pasta) e sincroniza
 async function openFolder(value){
  const source=await cleanSource(value);
  for(const c of await list()){const link=await readLink(c.id);if(link&&samePath(link.source,source))return {id:c.id,name:await readName(c.id),reused:true,...await sync(c.id)};}
  let config={};try{config=JSON.parse(await readText(path.join(source,'bruno.json')));}catch{throw fail(400,'Arquivo de importação inválido');}
  const title=String(config.name||path.basename(source)).trim().slice(0,100)||'Coleção';
  await mkdir(dir,{recursive:true});
  const id=uniqueName(dir,slugOf(title)||'colecao');await mkdir(path.join(dir,id));
  await writeJson(path.join(dir,id,'bruno.json'),{...config,name:title});
  return {id,name:title,...await setLink(id,source)};
 }
 // pacote ZIP da coleção (sem segredos): <id>/bruno.json, <id>/**/*.bru ...
 async function exportZip(id){
  const root=collDir(id);if(!existsSync(path.join(root,'bruno.json')))throw fail(404,'Coleção inexistente');
  const entries=[];
  const walk=async(abs,rel)=>{
   for(const e of await readdir(abs,{withFileTypes:true})){
    if(e.name.startsWith('.'))continue;
    const next=path.join(abs,e.name),r=rel?`${rel}/${e.name}`:e.name;
    if(e.isDirectory())await walk(next,r);
    else if(ALLOWED_EXT.has(path.extname(e.name).toLowerCase()))entries.push({name:`${id}/${r}`,data:await readFile(next)});
   }
  };
  await walk(root,'');
  return writeZip(entries);
 }
 async function importZip(buffer){
  let entries;try{entries=readZip(buffer,{maxEntries:3000});}catch{throw fail(400,'Arquivo de importação inválido');}
  return importEntries(entries);
 }
 // entries: [{name:'<pasta>/bruno.json', data}], vindas de um ZIP ou de uma pasta enviada pelo navegador
 async function importEntries(entries){
  const marker=entries.filter(e=>e.name==='bruno.json'||e.name.endsWith('/bruno.json')).sort((a,b)=>a.name.length-b.name.length)[0];
  if(!marker)throw fail(400,'Pacote sem bruno.json');
  const prefix=marker.name.slice(0,-'bruno.json'.length);
  let config={};try{config=JSON.parse(marker.data.toString('utf8'));}catch{throw fail(400,'Arquivo de importação inválido');}
  const existing=new Set((await list()).map(c=>c.name.toLowerCase()));
  let title=String(config.name||'Coleção importada').trim().slice(0,100)||'Coleção importada',n=2;const base=title;
  while(existing.has(title.toLowerCase()))title=`${base} (${n++})`;
  await mkdir(dir,{recursive:true});
  const id=uniqueName(dir,slugOf(title)||'colecao'),root=path.join(dir,id);
  await mkdir(root);
  let files=0;
  for(const e of entries){
   if(!e.name.startsWith(prefix))continue;
   const rel=e.name.slice(prefix.length),parts=rel.split('/');
   if(!rel||parts.some(p=>p.startsWith('.')||p==='..')||!ALLOWED_EXT.has(path.extname(rel).toLowerCase()))continue;
   if(rel==='bruno.json')continue;
   const target=path.join(root,...parts);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,e.data);files++;
  }
  await writeJson(path.join(root,'bruno.json'),{...config,name:title});
  return {id,name:title,files};
 }
 // Pasta enviada pelo navegador ({path,content}[]). Com bruno.json vira uma coleção. Sem ele é uma pasta de requests: entra na
 // coleção/pasta indicada em `into` ({collection,parent}) ou, sem `into`, vira uma coleção nova com o nome da pasta.
 async function importFolder(files,into){
  if(!Array.isArray(files)||!files.length||files.length>3000)throw fail(400,'Arquivo de importação inválido');
  const entries=[];
  for(const f of files){
   const name=String(f?.path||'').replace(/\\/g,'/').replace(/^\/+/,'');
   if(typeof f?.content!=='string'||name.split('/').some(p=>!p||p==='..'))continue;
   entries.push({name,data:Buffer.from(f.content,'utf8')});
  }
  if(entries.some(e=>e.name==='bruno.json'||e.name.endsWith('/bruno.json')))return importEntries(entries);
  const firsts=new Set(entries.map(e=>e.name.split('/')[0])),single=firsts.size===1&&entries.every(e=>e.name.includes('/'));
  const rootName=single?[...firsts][0]:'';
  const items=entries.map(e=>({rel:single?e.name.slice(rootName.length+1):e.name,data:e.data}))
   .filter(e=>!e.rel.split('/').some(p=>p.startsWith('.'))&&ALLOWED_EXT.has(path.extname(e.rel).toLowerCase()));
  if(!items.some(e=>e.rel.endsWith('.bru')))throw fail(400,'Pasta sem arquivos .bru');
  let id,created=null,base,folderPath='',seq=0;
  if(into?.collection){
   const target=inside(into.collection,into.parent||'');
   if(!existsSync(path.join(target.root,'bruno.json'))||!existsSync(target.file))throw fail(404,'Pasta inexistente');
   id=into.collection;seq=Math.max(0,...(await tree(id,into.parent||'')).map(s=>s.seq||0))+1;
   const dirName=uniqueName(target.file,slugOf(rootName)||'pasta');
   base=path.join(target.file,dirName);await mkdir(base);folderPath=[...target.parts,dirName].join('/');
  }else{created=await createCollection(rootName||'Pasta importada');id=created.id;base=collDir(id);}
  let count=0;
  for(const {rel,data} of items){
   if(rel==='bruno.json'||(!created&&rel.startsWith('environments/')))continue;
   const target=path.join(base,...rel.split('/'));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,data);count++;
  }
  if(!created){
   const meta=path.join(base,'folder.bru'),model=existsSync(meta)?parseBru(await readText(meta)):{name:rootName||path.basename(base),type:'folder'};
   model.seq=seq;await writeFile(meta,stringifyBlocks(fromModel(model)));
  }
  return {id,name:created?.name||await readName(id),files:count,...(folderPath?{folder:folderPath}:{})};
 }
 return {readSettings,writeSettings,readMocks,writeMocks,list,tree,defaults,environments,readEnv,writeEnv,createCollection,createItem,readRequest,writeRequest,renameItem,removeItem,transfer,openFolder,setLink,removeLink,linkInfo,sync,syncIfDue,reorder,removeEnv,removeCollection,exportZip,importZip,importFolder,readName,collDir,secretsOf};
}
