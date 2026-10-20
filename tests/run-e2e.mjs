// Roda os testes de navegador em sequência. browser/cards/motion usam um servidor temporário com dados limpos
// (sem as suas apresentações); edit e skill já sobem o próprio servidor. Uso: node tests/run-e2e.mjs [edit skill browser cards motion]
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const NL=String.fromCharCode(10),CR=String.fromCharCode(13);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wanted=process.argv.slice(2),all=['edit','skill','collections','sandbox','api','tabs','runner','browser','cards','motion','a11y'],suites=wanted.length?wanted:all;
const work=await mkdtemp(path.join(tmpdir(),'cm-e2e-')),port=4193;
let server=null,failed=[];
try{
 if(suites.some(s=>['browser','cards','motion','a11y'].includes(s))){
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
  await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`servidor saiu (${c})`)));});
 }
 for(const name of suites){
  console.log(`\n▶ ${name}`);
  const res=spawnSync(process.execPath,[path.join('tests',`${name}.mjs`)],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,PREVIEW_URL:`http://127.0.0.1:${port}`}});
  process.stdout.write(res.stdout||'');process.stderr.write(res.stderr||'');
  if(res.status!==0){
   failed.push(name);
   if(process.env.GITHUB_ACTIONS){ // aparece como anotação na página da execução (os logs completos exigem login)
    const text=[res.error?.message,res.stdout,res.stderr].filter(Boolean).join(NL).trim();
    const tail=text.split(NL).slice(-18).join(NL).slice(-1800);
    console.log(`::error title=${name} (${process.platform})::${tail.replaceAll('%','%25').replaceAll(CR,'').replaceAll(NL,'%0A')}`);
   }
  }
 }
}finally{server?.kill();await rm(work,{recursive:true,force:true});}
console.log(failed.length?`\nFALHOU: ${failed.join(', ')}`:`\nTodos os testes passaram (${suites.join(', ')})`);
process.exit(failed.length?1:0);
