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

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.resolve(process.env.PRESENTATIONS_DIR||path.join(root,'presentations'));
const configFile=path.resolve(process.env.CONTEXT_MAPS_CONFIG||path.join(root,'.context-maps.json'));
const port=Number(process.env.PORT||4173);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
const IMAGE_EXT=new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg']);
const SLUG=/^[a-z0-9][a-z0-9-]{0,60}$/;
const MAX_JSON=5*1024*1024, MAX_IMAGE=15*1024*1024;

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
 'Estrutura inválida':'Invalid structure','Não encontrado':'Not found','Erro interno':'Internal error'
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
async function writeJson(file,data){const tmp=`${file}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(data,null,2)+'\n');await rename(tmp,file);}
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

async function serveStatic(res,pathname){
 let rel=decodeURIComponent(pathname);if(rel.endsWith('/'))rel+='index.html';
 let file,base;
 if(rel.startsWith('/presentations/')){
  const tail=rel.slice('/presentations/'.length),idPart=tail.split('/')[0],r=resolveId(idPart);
  if(r&&r.lib&&!r.lib.main){base=path.join(r.lib.dir,r.slug);file=path.join(base,...tail.split('/').slice(1));}  // imagens de pastas extras
  else{base=dataDir;file=path.join(dataDir,tail);}
 }else{base=root;file=path.join(root,rel);}
 const resolved=path.resolve(file);
 const relative=path.relative(base,resolved);
 const blocked=relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(p=>p.startsWith('.'))||(base===root&&/^(node_modules|presentations|tests|server\.mjs)/.test(relative));
 if(blocked)return fail(res,404,'Não encontrado');
 try{
  const info=await stat(resolved);if(!info.isFile())throw new Error('not file');
  send(res,200,await readFile(resolved),MIME[path.extname(resolved).toLowerCase()]||'application/octet-stream');
 }catch{fail(res,404,'Não encontrado');}
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
