// Sessões do Claude Code gravadas nesta máquina (~/.claude/projects/<projeto>/<sessão>.jsonl): listar e ler compactadas.
// Só leitura; a pasta pode ser trocada com CLAUDE_PROJECTS_DIR.
import {createReadStream} from 'node:fs';
import {open,readdir,stat} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import path from 'node:path';
import {createSessionReader} from './session-core.js';

const SAFE=/^[\w.~ -]+$/; // nomes de pasta/arquivo aceitos (sem separadores)
const HEAD=192*1024,TAIL=96*1024;
const lines=buf=>buf.toString('utf8').split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
/** título, pasta de trabalho e primeira mensagem, lendo só o começo e o fim do arquivo */
async function peek(file,size){
 const fh=await open(file,'r');
 try{
  const head=Buffer.alloc(Math.min(HEAD,size));await fh.read(head,0,head.length,0);
  const reader=createSessionReader();let cwd='';
  for(const o of lines(head)){reader.push(o);cwd||=o.cwd||'';}
  const first=reader.finish();let title=first.title;
  if(size>HEAD){const tail=Buffer.alloc(Math.min(TAIL,size-HEAD));await fh.read(tail,0,tail.length,size-tail.length);for(const o of lines(tail))if(o.type==='custom-title'&&o.customTitle)title=o.customTitle;}
  return {title,cwd,first:(first.items.find(i=>i.k==='user'&&i.text)?.text||'').slice(0,160),started:first.started};
 }finally{await fh.close();}
}
export function createSessions({dir=process.env.CLAUDE_PROJECTS_DIR||path.join(homedir(),'.claude','projects')}={}){
 const fileOf=(project,id)=>{
  if(!SAFE.test(project)||!SAFE.test(id))return null;
  const file=path.resolve(dir,project,`${id}.jsonl`);
  return path.relative(path.resolve(dir),file).startsWith('..')?null:file;
 };
 return {
  dir,
  /** [{project, id, cwd, title, first, started, modified, size}], mais recentes primeiro */
  async list(){
   const out=[];let projects=[];
   try{projects=(await readdir(dir,{withFileTypes:true})).filter(d=>d.isDirectory());}catch{return out;}
   for(const p of projects){
    let files=[];try{files=(await readdir(path.join(dir,p.name))).filter(f=>f.endsWith('.jsonl'));}catch{continue;}
    for(const f of files){
     const file=path.join(dir,p.name,f);
     try{const info=await stat(file);if(!info.size)continue;out.push({project:p.name,id:f.slice(0,-6),size:info.size,modified:info.mtime.toISOString(),...await peek(file,info.size)});}catch{}
    }
   }
   return out.sort((a,b)=>b.modified.localeCompare(a.modified));
  },
  /** transcrição compacta de uma sessão (null se não existe) */
  async read(project,id){
   const file=fileOf(project,id);if(!file)return null;
   try{await stat(file);}catch{return null;}
   const reader=createSessionReader();
   for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})){if(!line.trim())continue;try{reader.push(JSON.parse(line));}catch{}}
   return reader.finish();
  }
 };
}
