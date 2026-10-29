// Servidor local sem dependências: serve o app e guarda as apresentações em arquivos JSON versionáveis.
// A biblioteca principal fica em ./presentations; outras pastas da máquina podem ser registradas (config em .context-maps.json).
import {createServer} from 'node:http';
import {readFile,writeFile,rename,readdir,stat,mkdir,rm,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tree as seed} from './model.js';
import {buildHtml} from './export.mjs';
import {writeZip,readZip} from './zip.mjs';
import {createCollections} from './collections.mjs';
import {sendRequest} from './send.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.resolve(process.env.PRESENTATIONS_DIR||path.join(root,'presentations'));
const configFile=path.resolve(process.env.CONTEXT_MAPS_CONFIG||path.join(root,'.context-maps.json'));
const port=Number(process.env.PORT||4173);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
const IMAGE_EXT=new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg']);
const SLUG=/^[a-z0-9][a-z0-9-]{0,60}$/;
const MAX_JSON=5*1024*1024, MAX_IMAGE=15*1024*1024, MAX_IMPORT=150*1024*1024;

const slug=text=>text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'apresentacao';
const send=(res,status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
// Mensagens de erro: o texto em português é a chave; com o cabeçalho x-lang (ou Accept-Language) em inglês, vai traduzido.
const EN={
 'Corpo grande demais':'Request body too large','Informe o caminho completo da pasta':'Enter the full folder path',
 'Escolha uma pasta, não a raiz do disco':'Choose a folder, not the drive root','Sem permissão para gravar nessa pasta':'No permission to write to that folder',
 'Acesso negado':'Access denied','Método não permitido':'Method not allowed','Pasta não registrada':'Folder not registered',
 'Seletor de pasta indisponível neste sistema; digite o caminho':'Folder picker unavailable on this system; type the path',
 'Rota inexistente':'Route not found','Identificador inválido ou já existente':'Invalid or already existing identifier',
 'Identificador inválido':'Invalid identifier','Apresentação inexistente':'Presentation not found',
 'Formato de imagem não suportado':'Unsupported image format','Informe um nome para a cópia':'Enter a name for the copy',
 'Estrutura inválida':'Invalid structure','Formato de exportação inválido':'Invalid export format','Arquivo de importação inválido':'Invalid import file','Informe um nome':'Enter a name','Método inválido':'Invalid method','URL inválida':'Invalid URL','Só http e https são aceitos':'Only http and https are accepted','Caminho inválido':'Invalid path','Pasta inexistente':'Folder not found','Tipo inválido':'Invalid type','Request inexistente':'Request not found','Item inexistente':'Item not found','Coleção inexistente':'Collection not found','Ambiente inexistente':'Environment not found','Pacote sem bruno.json':'Package has no bruno.json','Pasta sem arquivos .bru':'Folder has no .bru files','Pacote sem apresentação (.json)':'Package has no presentation (.json)','Não encontrado':'Not found','Erro interno':'Internal error'
};
const wantsEnglish=req=>{const l=String(req?.headers?.['x-lang']||req?.headers?.['accept-language']||'').toLowerCase();return !(l.startsWith('pt'));};
const fail=(res,status,message)=>send(res,status,{error:res.req&&wantsEnglish(res.req)&&EN[message]?EN[message]:message});
async function readBody(req,limit){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>limit)throw Object.assign(new Error('Corpo grande demais'),{status:413});chunks.push(c);}return Buffer.concat(chunks);}

/* ---------- Bibliotecas (pastas com apresentações) ---------- */
// id das apresentações da biblioteca principal: "meu-mapa"; das demais: "<chave>~meu-mapa" (a chave identifica a pasta).
const MAIN={key:'main',dir:dataDir,label:'Biblioteca do app',main:true};
let extraDirs=[];
const keyOf=dir=>createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0,6);
const libraries=()=>[MAIN,...extraDirs.map(dir=>({key:keyOf(dir),dir,label:path.basename(dir)||dir,main:false}))];
async function loadConfig(){
 try{const raw=JSON.parse(await readFile(configFile,'utf8'));extraDirs=(raw.folders||[]).filter(d=>typeof d==='string'&&path.isAbsolute(d)).map(d=>path.resolve(d)).filter(d=>d!==dataDir);}catch{extraDirs=[];}
}
async function saveConfig(){await writeJson(configFile,{folders:extraDirs});} // gravação atômica
async function ensureLibrary(rawDir){ // valida, cria se preciso e registra uma pasta
 const dir=path.resolve(String(rawDir||''));
 if(!rawDir||!path.isAbsolute(String(rawDir)))throw Object.assign(new Error('Informe o caminho completo da pasta'),{status:400});
 if(path.parse(dir).root===dir)throw Object.assign(new Error('Escolha uma pasta, não a raiz do disco'),{status:400});
 if(dir===dataDir)return MAIN;
 await mkdir(dir,{recursive:true});
 const probe=path.join(dir,`.cm-write-test-${process.pid}`);
 try{await writeFile(probe,'');await rm(probe);}catch{throw Object.assign(new Error('Sem permissão para gravar nessa pasta'),{status:400});}
 if(!extraDirs.includes(dir)){extraDirs.push(dir);await saveConfig();}
 return libraries().find(l=>l.dir===dir);
}
function resolveId(id){
 if(typeof id!=='string')return null;
 if(!id.includes('~'))return SLUG.test(id)?{id,lib:MAIN,slug:id}:null;
 const m=id.match(/^([0-9a-f]{6})~([a-z0-9][a-z0-9-]{0,60})$/);if(!m)return null;
 const lib=libraries().find(l=>l.key===m[1]);return lib?{id,lib,slug:m[2]}:null;
}
const fileOf=r=>path.join(r.lib.dir,`${r.slug}.json`);
const assetsDirOf=r=>path.join(r.lib.dir,r.slug,'assets');
const idFor=(lib,slugName)=>lib.main?slugName:`${lib.key}~${slugName}`;

/* ---------- Formato dos documentos ---------- */
function validNode(node,depth=0,ids=new Set()){
 if(!node||typeof node!=='object'||depth>40)return false;
 if(typeof node.id!=='string'||!node.id||ids.has(node.id)||typeof node.title!=='string'||!Array.isArray(node.children))return false;
 ids.add(node.id);
 const okImage=i=>i&&typeof i==='object'&&typeof i.src==='string'&&typeof i.alt==='string';
 if(node.image!==undefined&&!okImage(node.image))return false;
 if(node.links!==undefined){
  const okLink=l=>{if(!l||typeof l.url!=='string'||(l.label!==undefined&&typeof l.label!=='string'))return false;try{return ['http:','https:'].includes(new URL(l.url).protocol);}catch{return false;}};
  if(!(Array.isArray(node.links)&&node.links.length<=50&&node.links.every(okLink)))return false;
 }
 if(node.images!==undefined&&!(Array.isArray(node.images)&&node.images.length<=50&&node.images.every(okImage)))return false;
 if(node.color!==undefined&&typeof node.color!=='string')return false;
 if((node.x!==undefined&&!Number.isFinite(node.x))||(node.y!==undefined&&!Number.isFinite(node.y)))return false;
 if(node.linksColor!==undefined&&typeof node.linksColor!=='string')return false;
 if(node.apis!==undefined){
  const okApi=a=>a&&typeof a==='object'&&typeof a.collection==='string'&&/^[a-z0-9][a-z0-9-]{0,60}$/.test(a.collection)&&(a.path===undefined||(typeof a.path==='string'&&a.path.length<=300&&!a.path.split('/').some(p=>p==='..')))&&(a.name===undefined||(typeof a.name==='string'&&a.name.length<=120))&&(a.snapshot===undefined||(a.snapshot&&typeof a.snapshot==='object'&&Array.isArray(a.snapshot.requests)&&a.snapshot.requests.length<=10));
  if(!(Array.isArray(node.apis)&&node.apis.length<=20&&node.apis.every(okApi)))return false;
 }
 if(node.related!==undefined&&!(Array.isArray(node.related)&&node.related.length<=50&&node.related.every(r=>typeof r==='string'&&r.length>0&&r.length<=80)))return false;
 if(node.subtitle!==undefined&&(typeof node.subtitle!=='string'||node.subtitle.length>2000))return false;
 return node.children.every(c=>validNode(c,depth+1,ids));
}
// Formato atual: {id, title, roots:[{...árvore com x,y opcionais}]}. O antigo ({id, tree}) continua sendo lido.
const rootsOf=doc=>Array.isArray(doc.roots)&&doc.roots.length?doc.roots:[doc.tree];
const titleOf=doc=>(typeof doc.title==='string'&&doc.title.trim())||rootsOf(doc)[0].title;
function validDoc(doc){
 if(!doc||typeof doc!=='object')return false;
 const list=doc.roots!==undefined?doc.roots:(doc.tree?[doc.tree]:null);
 if(!Array.isArray(list)||!list.length||list.length>100)return false;
 if(doc.title!==undefined&&(typeof doc.title!=='string'||doc.title.length>200))return false;
 const ids=new Set();
 return list.every(r=>validNode(r,0,ids));
}
// Em pastas extras os caminhos das imagens são gravados relativos ao arquivo ("meu-mapa/assets/x.png"), para a pasta ser portátil;
// a API sempre os entrega no formato "presentations/<id>/assets/x.png".
function mapSrc(doc,fn){
 const walk=n=>{for(const m of [...(n.images||[]),...(n.image?[n.image]:[])])if(typeof m.src==='string')m.src=fn(m.src);n.children.forEach(walk);};
 rootsOf(doc).forEach(walk);return doc;
}
const toApi=(doc,r)=>{if(r.lib.main)return doc;const from=`${r.slug}/assets/`,to=`presentations/${r.id}/assets/`;return mapSrc(doc,s=>s.startsWith(from)?to+s.slice(from.length):s);};
const toStored=(doc,r)=>{if(r.lib.main)return doc;const from=`presentations/${r.id}/assets/`,to=`${r.slug}/assets/`;return mapSrc(doc,s=>s.startsWith(from)?to+s.slice(from.length):s);};
let tmpSeq=0;
async function writeJson(file,data){ // grava num temporário e renomeia; no Windows o rename pode falhar um instante se alguém estiver lendo o arquivo
 const tmp=`${file}.${process.pid}.${++tmpSeq}.tmp`;await writeFile(tmp,JSON.stringify(data,null,2)+'\n');
 for(let attempt=0;;attempt++){
  try{await rename(tmp,file);return;}
  catch(error){if(attempt>=20||!['EPERM','EBUSY','EACCES'].includes(error.code)){await rm(tmp,{force:true});throw error;}await new Promise(r=>setTimeout(r,25));}
 }
}
// Coleções de requests (formato Bruno): pasta COLLECTIONS_DIR, por padrão ao lado da pasta de apresentações.
const collectionsDir=process.env.COLLECTIONS_DIR?path.resolve(process.env.COLLECTIONS_DIR):path.join(path.dirname(dataDir),'collections');
const collections=createCollections({dir:collectionsDir,writeJson});
const jsonBody=async req=>JSON.parse((await readBody(req,MAX_JSON)).toString()||'{}');
async function collectionsApi(req,res,url,parts){
 const [id,sub,name]=parts,method=req.method,q=k=>url.searchParams.get(k)||'';
 if(!id){
  if(method==='GET')return send(res,200,await collections.list());
  if(method==='POST')return send(res,201,await collections.createCollection((await jsonBody(req)).name));
  return fail(res,405,'Método não permitido');
 }
 if(id==='import'){
  if(method!=='POST')return fail(res,405,'Método não permitido');
  return send(res,201,await collections.importZip(await readBody(req,MAX_IMPORT)));
 }
 if(id==='import-folder'){
  if(method!=='POST')return fail(res,405,'Método não permitido');
  const body=JSON.parse((await readBody(req,MAX_IMPORT)).toString()||'{}');
  return send(res,201,await collections.importFolder(body.files,body.into));
 }
 if(!sub){
  if(method==='GET'){const root=collections.collDir(id);if(!existsSync(path.join(root,'bruno.json')))return fail(res,404,'Coleção inexistente');return send(res,200,{id,name:await collections.readName(id),tree:await collections.tree(id),environments:await collections.environments(id),defaults:await collections.defaults(id),mocks:await collections.readMocks(id),settings:await collections.readSettings(id)});}
  if(method==='DELETE'){await collections.removeCollection(id);return send(res,200,{ok:true});}
  return fail(res,405,'Método não permitido');
 }
 if(sub==='items'){
  if(method==='POST')return send(res,201,await collections.createItem(id,await jsonBody(req)));
  if(method==='PATCH'){const b=await jsonBody(req);await collections.renameItem(id,String(b.path||''),b.name);return send(res,200,{ok:true});}
  if(method==='DELETE'){await collections.removeItem(id,q('path'));return send(res,200,{ok:true});}
  return fail(res,405,'Método não permitido');
 }
 if(sub==='request'){
  if(method==='GET')return send(res,200,await collections.readRequest(id,q('path')));
  if(method==='PUT'){await collections.writeRequest(id,q('path'),await jsonBody(req));return send(res,200,{ok:true});}
  return fail(res,405,'Método não permitido');
 }
 if(sub==='reorder'){
  if(method!=='POST')return fail(res,405,'Método não permitido');
  const b=await jsonBody(req);await collections.reorder(id,String(b.parent||''),b.order);return send(res,200,{ok:true});
 }
 if(sub==='settings'){
  if(method==='GET')return send(res,200,await collections.readSettings(id));
  if(method==='PUT')return send(res,200,await collections.writeSettings(id,await jsonBody(req)));
  return fail(res,405,'Método não permitido');
 }
 if(sub==='mocks'){
  if(method==='GET')return send(res,200,await collections.readMocks(id));
  if(method==='PUT')return send(res,200,await collections.writeMocks(id,await jsonBody(req)));
  return fail(res,405,'Método não permitido');
 }
 if(sub==='environments'){
  if(!name){if(method==='GET')return send(res,200,await collections.environments(id));return fail(res,405,'Método não permitido');}
  if(method==='GET')return send(res,200,await collections.readEnv(id,decodeURIComponent(name)));
  if(method==='PUT'){const b=await jsonBody(req);await collections.writeEnv(id,decodeURIComponent(name),b.vars);return send(res,200,{ok:true});}
  if(method==='DELETE'){await collections.removeEnv(id,decodeURIComponent(name));return send(res,200,{ok:true});}
  return fail(res,405,'Método não permitido');
 }
 if(sub==='export'){
  if(method!=='GET')return fail(res,405,'Método não permitido');
  const body=await collections.exportZip(id);
  res.writeHead(200,{'content-type':'application/zip','cache-control':'no-store','content-disposition':`attachment; filename="${id}.zip"`});return res.end(body);
 }
 return fail(res,404,'Rota inexistente');
}
async function ensureSeed(){
 await mkdir(dataDir,{recursive:true});
 if((await readdir(dataDir)).some(f=>f.endsWith('.json')))return;
 await writeJson(path.join(dataDir,'cidades-para-pessoas.json'),{id:'cidades-para-pessoas',title:seed.title,roots:[seed]});
}
async function listDocs(){
 const out=[];
 for(const lib of libraries()){
  let files=[];try{files=await readdir(lib.dir);}catch{continue;} // pasta que sumiu: simplesmente não lista
  for(const f of files){
   if(!f.endsWith('.json'))continue;
   try{
    const doc=JSON.parse(await readFile(path.join(lib.dir,f),'utf8'));const s=await stat(path.join(lib.dir,f));
    out.push({id:lib.main?doc.id:`${lib.key}~${f.slice(0,-5)}`,title:titleOf(doc),updatedAt:s.mtimeMs,...(lib.main?{}:{folder:lib.dir,folderLabel:lib.label,folderKey:lib.key})});
   }catch{}
  }
 }
 return out.sort((a,b)=>(a.folder?1:0)-(b.folder?1:0)||String(a.folder||'').localeCompare(String(b.folder||''))||a.id.localeCompare(b.id));
}
// Nomes de apresentação não se repetem: um nome já usado ganha " (2)", " (3)"…
async function uniqueTitle(title,excludeId){
 const taken=new Set((await listDocs()).filter(d=>d.id!==excludeId).map(d=>String(d.title).trim().toLowerCase()));
 let candidate=title,n=2;while(taken.has(candidate.trim().toLowerCase()))candidate=`${title} (${n++})`;
 return candidate;
}
const freeSlug=(lib,base)=>{let next=base,n=2;while(existsSync(path.join(lib.dir,`${next}.json`)))next=`${base}-${n++}`;return next;};

/* ---------- Seletor nativo de pasta (o servidor é local) ---------- */
function pickFolder(){
 return new Promise(resolve=>{
  let cmd,args;
  if(process.platform==='win32'){
   cmd='powershell.exe';
   const script="[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -AssemblyName System.Windows.Forms;$f=New-Object System.Windows.Forms.Form;$f.TopMost=$true;$f.ShowInTaskbar=$false;$f.StartPosition='CenterScreen';$f.Opacity=0;$f.Show();$d=New-Object System.Windows.Forms.FolderBrowserDialog;$d.Description='Escolha a pasta';$d.ShowNewFolderButton=$true;if($d.ShowDialog($f) -eq 'OK'){[Console]::Out.Write($d.SelectedPath)};$f.Close()";
   args=['-NoProfile','-Sta','-Command',script];
  }else if(process.platform==='darwin'){cmd='osascript';args=['-e','POSIX path of (choose folder with prompt "Escolha a pasta")'];}
  else{cmd='zenity';args=['--file-selection','--directory','--title=Escolha a pasta'];}
  let out='';const child=spawn(cmd,args,{windowsHide:false});
  child.stdout.on('data',c=>{out+=c;});
  child.on('error',()=>resolve({unsupported:true}));
  child.on('close',()=>resolve({path:out.trim().replace(/[\\/]+$/,'')||null}));
 });
}

/* ---------- API ---------- */
const LOCAL_HOST=/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
async function api(req,res,url){
 if(!LOCAL_HOST.test(req.headers.host||''))return fail(res,403,'Acesso negado');
 if(req.method!=='GET'&&req.method!=='HEAD'&&req.headers['x-context-maps']!=='1')return fail(res,403,'Acesso negado'); // bloqueia requisições de outras páginas
 const parts=url.pathname.split('/').filter(Boolean).slice(1); // depois de "api"
 if(parts[0]==='libraries'){
  if(!parts[1]){
   if(req.method==='GET')return send(res,200,libraries().map(l=>({...l,exists:existsSync(l.dir)})));
   if(req.method==='POST'){const body=JSON.parse((await readBody(req,MAX_JSON)).toString()||'{}');return send(res,201,await ensureLibrary(body.dir));}
   return fail(res,405,'Método não permitido');
  }
  if(req.method==='DELETE'){ // só tira a pasta da lista; nenhum arquivo é apagado
   const before=extraDirs.length;extraDirs=extraDirs.filter(d=>keyOf(d)!==parts[1]);
   if(extraDirs.length===before)return fail(res,404,'Pasta não registrada');
   await saveConfig();return send(res,200,{ok:true});
  }
  return fail(res,405,'Método não permitido');
 }
 if(parts[0]==='pick-folder'){
  if(req.method!=='POST')return fail(res,405,'Método não permitido');
  const picked=await pickFolder();
  if(picked.unsupported)return fail(res,501,'Seletor de pasta indisponível neste sistema; digite o caminho');
  return send(res,200,{path:picked.path});
 }
 if(parts[0]==='import'){
  if(req.method!=='POST')return fail(res,405,'Método não permitido');
  return importDoc(req,res);
 }
 if(parts[0]==='send'){ // cliente de API: o servidor faz a chamada (sem CORS); só http/https
  if(req.method!=='POST')return fail(res,405,'Método não permitido');
  const out=await sendRequest(await jsonBody(req));
  return out.error?fail(res,out.status,out.error):send(res,200,out.result);
 }
 if(parts[0]==='collections')return collectionsApi(req,res,url,parts.slice(1));
 if(parts[0]!=='presentations')return fail(res,404,'Rota inexistente');
 const id=parts[1];
 if(!id){
  if(req.method==='GET')return send(res,200,await listDocs());
  if(req.method==='POST'){
   const body=JSON.parse((await readBody(req,MAX_JSON)).toString()||'{}');
   const lib=body.dir?await ensureLibrary(body.dir):MAIN;
   const title=await uniqueTitle(String(body.title||'').trim()||'Nova apresentação');
   if(body.id!==undefined&&(!SLUG.test(String(body.id))||existsSync(path.join(lib.dir,`${body.id}.json`))))return fail(res,409,'Identificador inválido ou já existente');
   await mkdir(lib.dir,{recursive:true});
   const name=freeSlug(lib,body.id!==undefined?String(body.id):slug(title));
   const doc={id:idFor(lib,name),title,roots:[{id:'root',title,children:[]}]};
   await writeJson(path.join(lib.dir,`${name}.json`),{...doc,id:lib.main?doc.id:name});return send(res,201,doc);
  }
  return fail(res,405,'Método não permitido');
 }
 const r=resolveId(id);
 if(!r)return fail(res,400,'Identificador inválido');
 const file=fileOf(r);
 if(parts[2]==='assets'){
  if(req.method!=='POST')return fail(res,405,'Método não permitido');
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  const raw=path.basename(url.searchParams.get('name')||'imagem.png'),ext=path.extname(raw).toLowerCase();
  if(!IMAGE_EXT.has(ext))return fail(res,415,'Formato de imagem não suportado');
  const dir=assetsDirOf(r);await mkdir(dir,{recursive:true});
  const base=slug(path.basename(raw,ext)),name=`${base}-${Date.now().toString(36)}${ext}`;
  await writeFile(path.join(dir,name),await readBody(req,MAX_IMAGE));
  return send(res,201,{src:`presentations/${id}/assets/${name}`});
 }
 if(parts[2]==='copy'){ // "Salvar como": copia a apresentação (e as imagens) para a biblioteca principal ou outra pasta da máquina
  if(req.method!=='POST')return fail(res,405,'Método não permitido');
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  const body=JSON.parse((await readBody(req,MAX_JSON)).toString()||'{}');
  const requested=String(body.title||'').trim();
  if(!requested)return fail(res,400,'Informe um nome para a cópia');
  const lib=body.dir?await ensureLibrary(body.dir):MAIN;
  const title=await uniqueTitle(requested);
  const name=freeSlug(lib,slug(title)),next=resolveId(idFor(lib,name));
  const source=toApi(JSON.parse(await readFile(file,'utf8')),r);
  const from=`presentations/${id}/assets/`,to=`presentations/${next.id}/assets/`;
  const copyRoots=rootsOf(source);
  mapSrc({roots:copyRoots},s=>s.startsWith(from)?to+s.slice(from.length):s);
  const assets=assetsDirOf(r);
  if(existsSync(assets))await cp(assets,assetsDirOf(next),{recursive:true});
  await mkdir(lib.dir,{recursive:true});
  const doc={id:next.id,title,roots:copyRoots};
  await writeJson(fileOf(next),{...toStored({id:next.id,title,roots:structuredClone(copyRoots)},next),id:lib.main?next.id:name});
  return send(res,201,doc);
 }
 if(parts[2]==='export'){
  if(req.method!=='GET')return fail(res,405,'Método não permitido');
  return exportDoc(res,r,id,file,url.searchParams.get('format')||'html');
 }
 if(req.method==='GET'){
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  const doc=toApi(JSON.parse(await readFile(file,'utf8')),r);doc.id=id;return send(res,200,doc);
 }
 if(req.method==='PUT'){
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  const doc=JSON.parse((await readBody(req,MAX_JSON)).toString());
  if(!validDoc(doc))return fail(res,400,'Estrutura inválida');
  const list=doc.roots!==undefined?doc.roots:[doc.tree];
  const stored=toStored({id,title:(typeof doc.title==='string'&&doc.title.trim())||list[0].title,roots:list},r);
  await writeJson(file,{...stored,id:r.lib.main?id:r.slug});return send(res,200,{ok:true});
 }
 if(req.method==='DELETE'){
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  await rm(file);await rm(path.join(r.lib.dir,r.slug),{recursive:true,force:true});return send(res,200,{ok:true});
 }
 return fail(res,405,'Método não permitido');
}

// Caminho (já decodificado) -> arquivo servível, ou null se estiver fora das áreas permitidas.
function staticFile(rel){
 let file,base;
 if(rel.startsWith('/presentations/')){
  const tail=rel.slice('/presentations/'.length),idPart=tail.split('/')[0],r=resolveId(idPart);
  if(r&&r.lib&&!r.lib.main){base=path.join(r.lib.dir,r.slug);file=path.join(base,...tail.split('/').slice(1));}  // imagens de pastas extras
  else{base=dataDir;file=path.join(dataDir,tail);}
 }else{base=root;file=path.join(root,rel);}
 const resolved=path.resolve(file);
 const relative=path.relative(base,resolved);
 const blocked=relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(p=>p.startsWith('.'))||(base===root&&/^(node_modules|presentations|tests|server\.mjs)/.test(relative));
 return blocked?null:resolved;
}
async function serveStatic(res,pathname){
 let rel=decodeURIComponent(pathname);if(rel.endsWith('/'))rel+='index.html';
 const resolved=staticFile(rel);
 if(!resolved)return fail(res,404,'Não encontrado');
 try{
  const info=await stat(resolved);if(!info.isFile())throw new Error('not file');
  send(res,200,await readFile(resolved),MIME[path.extname(resolved).toLowerCase()]||'application/octet-stream');
 }catch{fail(res,404,'Não encontrado');}
}
// Exportação: HTML único (imagens embutidas) ou pacote ZIP (o JSON + a pasta de imagens, no formato portátil de pastas extras), como download.
const localMedia=doc=>{const out=[];const walk=n=>{for(const m of n.images||[])if(typeof m.src==='string'&&!/^(https?:|data:)/i.test(m.src))out.push(m);n.children.forEach(walk);};rootsOf(doc).forEach(walk);return out;};
async function exportDoc(res,r,id,file,format){
 if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
 const doc=toApi(JSON.parse(await readFile(file,'utf8')),r);doc.id=id;doc.title=titleOf(doc);doc.roots=rootsOf(doc);delete doc.tree;
 const name=slug(doc.title);
 const readAsset=async src=>{const f=staticFile(src.startsWith('/')?src:`/${src}`);if(!f)throw new Error('fora da área permitida');return readFile(f);};
 let body,type;
 if(format==='html'){body=await buildHtml({doc,appRoot:root,readAsset});type='text/html; charset=utf-8';}
 else if(format==='zip'){
  const entries=[],used=new Set(),copy=structuredClone(doc);
  for(const m of localMedia(copy)){
   const bytes=await readAsset(m.src).catch(()=>null);if(!bytes)continue;
   const ext=path.extname(m.src.split('?')[0]).toLowerCase();let base=slug(path.basename(m.src.split('?')[0],ext))||'imagem',file2=`${base}${ext}`,n=2;
   while(used.has(file2))file2=`${base}-${n++}${ext}`;
   used.add(file2);entries.push({name:`${name}/assets/${file2}`,data:bytes});m.src=`${name}/assets/${file2}`;
  }
  entries.unshift({name:`${name}.json`,data:Buffer.from(JSON.stringify({id:name,title:copy.title,roots:copy.roots},null,2)+'\n')});
  body=writeZip(entries);type='application/zip';
 }else return fail(res,400,'Formato de exportação inválido');
 res.writeHead(200,{'content-type':type,'cache-control':'no-store','content-disposition':`attachment; filename="${name}.${format}"`});res.end(body);
}
// Importação: pacote ZIP (JSON + imagens) ou HTML exportado (JSON e imagens embutidos). Nada é executado: só se lê o JSON e se gravam imagens.
const MIME_EXT={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif','image/svg+xml':'.svg'};
async function importDoc(req,res){
 const body=await readBody(req,MAX_IMPORT);
 let doc,lookup;
 if(body.length>3&&body[0]===0x50&&body[1]===0x4b){
  let entries;try{entries=readZip(body);}catch{return fail(res,400,'Arquivo de importação inválido');}
  const jsons=entries.filter(e=>!e.name.includes('/')&&e.name.endsWith('.json'));
  if(!jsons.length)return fail(res,400,'Pacote sem apresentação (.json)');
  try{doc=JSON.parse(jsons[0].data.toString('utf8'));}catch{return fail(res,400,'Arquivo de importação inválido');}
  const byName=new Map(entries.map(e=>[e.name,e.data])),oldBase=jsons[0].name.slice(0,-5);
  lookup=src=>{
   const clean=src.split('?')[0].replace(/^\/+/,'');
   const bytes=byName.get(clean)||byName.get(`${oldBase}/assets/${path.posix.basename(clean)}`)||[...byName].find(([k])=>k.endsWith(`/assets/${path.posix.basename(clean)}`))?.[1];
   return bytes?{bytes,ext:path.extname(clean).toLowerCase()}:null;
  };
 }else{
  const m=/<script type="application\/json" id="cm-doc">([\s\S]*?)<\/script>/.exec(body.toString('utf8'));
  if(!m)return fail(res,400,'Arquivo de importação inválido');
  try{doc=JSON.parse(m[1]);}catch{return fail(res,400,'Arquivo de importação inválido');}
  lookup=src=>{const d=/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(src);return d&&MIME_EXT[d[1]]?{bytes:Buffer.from(d[2],'base64'),ext:MIME_EXT[d[1]]}:null;};
 }
 if(!validDoc(doc))return fail(res,400,'Estrutura inválida');
 const roots=structuredClone(rootsOf(doc)),title=await uniqueTitle(String((typeof doc.title==='string'&&doc.title.trim())||roots[0].title).trim().slice(0,200)||'Importada');
 const lib=MAIN,name=freeSlug(lib,slug(title)),r=resolveId(idFor(lib,name)),dir=assetsDirOf(r);
 let count=0;
 const walk=async n=>{
  const kept=[];
  for(const m of [...(n.images||[]),...(n.image?[n.image]:[])]){
   if(typeof m.src!=='string')continue;
   if(/^https?:/i.test(m.src)){kept.push(m);continue;}
   const found=lookup(m.src);
   if(!found||!IMAGE_EXT.has(found.ext)||found.bytes.length>MAX_IMAGE)continue; // imagem ausente ou inválida: descartada
   await mkdir(dir,{recursive:true});
   const file=`${slug(path.basename(m.src.split('?')[0],found.ext).slice(0,40))||'imagem'}-${(++count).toString(36)}${found.ext}`;
   await writeFile(path.join(dir,file),found.bytes);m.src=`presentations/${r.id}/assets/${file}`;kept.push(m);
  }
  if(kept.length)n.images=kept;else delete n.images;delete n.image;
  for(const c of n.children)await walk(c);
 };
 for(const root of roots)await walk(root);
 await mkdir(lib.dir,{recursive:true});
 await writeJson(fileOf(r),{id:r.id,title,roots});
 return send(res,201,{id:r.id,title});
}

await loadConfig();
await ensureSeed();
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,405,'Método não permitido');
  await serveStatic(res,url.pathname);
 }catch(error){fail(res,error.status||500,error.status?error.message:'Erro interno');}
}).listen(port,'127.0.0.1',()=>console.log(`Context Maps em http://127.0.0.1:${port} — apresentações em ${dataDir}`));
