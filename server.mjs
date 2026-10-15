// Servidor local sem dependências: serve o app e guarda as apresentações em arquivos JSON versionáveis.
import {createServer} from 'node:http';
import {readFile,writeFile,rename,readdir,stat,mkdir,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tree as seed} from './model.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.resolve(process.env.PRESENTATIONS_DIR||path.join(root,'presentations'));
const port=Number(process.env.PORT||4173);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
const IMAGE_EXT=new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg']);
const ID=/^[a-z0-9][a-z0-9-]{0,60}$/;
const MAX_JSON=5*1024*1024, MAX_IMAGE=15*1024*1024;

const slug=text=>text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'apresentacao';
const fileOf=id=>path.join(dataDir,`${id}.json`);
const send=(res,status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
const fail=(res,status,message)=>send(res,status,{error:message});
async function readBody(req,limit){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>limit)throw Object.assign(new Error('Corpo grande demais'),{status:413});chunks.push(c);}return Buffer.concat(chunks);}
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
 if(node.subtitle!==undefined&&(typeof node.subtitle!=='string'||node.subtitle.length>2000))return false;
 return node.children.every(c=>validNode(c,depth+1,ids));
}
async function writeJson(file,data){const tmp=`${file}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(data,null,2)+'\n');await rename(tmp,file);}
async function ensureSeed(){
 await mkdir(dataDir,{recursive:true});
 if((await readdir(dataDir)).some(f=>f.endsWith('.json')))return;
 await writeJson(fileOf('cidades-para-pessoas'),{id:'cidades-para-pessoas',tree:seed});
}
async function listDocs(){
 const out=[];
 for(const f of await readdir(dataDir)){
  if(!f.endsWith('.json'))continue;
  try{const doc=JSON.parse(await readFile(path.join(dataDir,f),'utf8'));const s=await stat(path.join(dataDir,f));out.push({id:doc.id,title:doc.tree.title,updatedAt:s.mtimeMs});}catch{}
 }
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}

async function api(req,res,url){
 const parts=url.pathname.split('/').filter(Boolean).slice(1); // depois de "api"
 if(parts[0]!=='presentations')return fail(res,404,'Rota inexistente');
 const id=parts[1];
 if(id!==undefined&&!ID.test(id))return fail(res,400,'Identificador inválido');
 if(!id){
  if(req.method==='GET')return send(res,200,await listDocs());
  if(req.method==='POST'){
   const body=JSON.parse((await readBody(req,MAX_JSON)).toString()||'{}');
   const title=String(body.title||'').trim()||'Nova apresentação';
   if(body.id!==undefined&&(!ID.test(String(body.id))||existsSync(fileOf(String(body.id)))))return fail(res,409,'Identificador inválido ou já existente');
   let base=body.id!==undefined?String(body.id):slug(title),next=base,n=2;while(existsSync(fileOf(next)))next=`${base}-${n++}`;
   const doc={id:next,tree:{id:'root',title,children:[]}};await writeJson(fileOf(next),doc);return send(res,201,doc);
  }
  return fail(res,405,'Método não permitido');
 }
 const file=fileOf(id);
 if(parts[2]==='assets'){
  if(req.method!=='POST')return fail(res,405,'Método não permitido');
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  const raw=path.basename(url.searchParams.get('name')||'imagem.png'),ext=path.extname(raw).toLowerCase();
  if(!IMAGE_EXT.has(ext))return fail(res,415,'Formato de imagem não suportado');
  const dir=path.join(dataDir,id,'assets');await mkdir(dir,{recursive:true});
  const base=slug(path.basename(raw,ext)),name=`${base}-${Date.now().toString(36)}${ext}`;
  await writeFile(path.join(dir,name),await readBody(req,MAX_IMAGE));
  return send(res,201,{src:`presentations/${id}/assets/${name}`});
 }
 if(req.method==='GET'){if(!existsSync(file))return fail(res,404,'Apresentação inexistente');return send(res,200,await readFile(file,'utf8'));}
 if(req.method==='PUT'){
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  const doc=JSON.parse((await readBody(req,MAX_JSON)).toString());
  if(!doc||!validNode(doc.tree))return fail(res,400,'Estrutura inválida');
  await writeJson(file,{id,tree:doc.tree});return send(res,200,{ok:true});
 }
 if(req.method==='DELETE'){
  if(!existsSync(file))return fail(res,404,'Apresentação inexistente');
  await rm(file);await rm(path.join(dataDir,id),{recursive:true,force:true});return send(res,200,{ok:true});
 }
 return fail(res,405,'Método não permitido');
}

async function serveStatic(res,pathname){
 let rel=decodeURIComponent(pathname);if(rel.endsWith('/'))rel+='index.html';
 let file;
 if(rel.startsWith('/presentations/'))file=path.join(dataDir,rel.slice('/presentations/'.length));
 else file=path.join(root,rel);
 const base=rel.startsWith('/presentations/')?dataDir:root;
 const resolved=path.resolve(file);
 const relative=path.relative(base,resolved);
 const blocked=relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(p=>p.startsWith('.'))||(base===root&&/^(node_modules|presentations|tests|server\.mjs)/.test(relative));
 if(blocked)return fail(res,404,'Não encontrado');
 try{
  const info=await stat(resolved);if(!info.isFile())throw new Error('not file');
  send(res,200,await readFile(resolved),MIME[path.extname(resolved).toLowerCase()]||'application/octet-stream');
 }catch{fail(res,404,'Não encontrado');}
}

await ensureSeed();
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,405,'Método não permitido');
  await serveStatic(res,url.pathname);
 }catch(error){fail(res,error.status||500,error.status?error.message:'Erro interno');}
}).listen(port,'127.0.0.1',()=>console.log(`Context Maps em http://127.0.0.1:${port} — apresentações em ${dataDir}`));
