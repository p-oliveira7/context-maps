#!/usr/bin/env node
// context-maps skill CLI: builds presentations (mind maps) through the local server API.
// No dependencies. Needs the app server (node server.mjs) — `serve` starts it when needed.
// Messages follow RM_LANG=en|pt (default: system locale; Portuguese for pt-*, otherwise English).
import {readFile,writeFile,mkdtemp,rm as removeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.resolve(here,'../../..');
const BASE=(process.env.RM_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const MAX_TITLE=90, MAX_DEPTH=5;

const LANG=(()=>{
 const forced=(process.env.RM_LANG||'').toLowerCase();
 if(forced.startsWith('pt'))return 'pt';
 if(forced.startsWith('en'))return 'en';
 try{return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('pt')?'pt':'en';}catch{return 'en';}
})();
const MSG={
 unavailable:{pt:(b,srv,cli)=>`Servidor indisponível em ${b}. Inicie com: node ${srv} (ou: node ${cli} serve)`,en:(b,srv,cli)=>`Server unavailable at ${b}. Start it with: node ${srv} (or: node ${cli} serve)`},
 httpError:{pt:(st,route,d)=>`Erro ${st} em ${route}: ${d}`,en:(st,route,d)=>`Error ${st} on ${route}: ${d}`},
 warnNoText:{pt:l=>`linha ${l}: ideia sem título`,en:l=>`line ${l}: idea without a title`},
 warnLong:{pt:(l,n,m)=>`linha ${l}: título com ${n} caracteres (limite sugerido ${m}) — resuma`,en:(l,n,m)=>`line ${l}: title has ${n} characters (suggested limit ${m}) — shorten it`},
 warnIgnored:{pt:l=>`linha ${l}: ignorada (use "- item" com indentação)`,en:l=>`line ${l}: ignored (use "- item" with indentation)`},
 warnNoTitle:{pt:()=>'sem título: use "# Título" na primeira linha',en:()=>'no title: use "# Title" on the first line'},
 lintDepth:{pt:(d,m)=>`profundidade ${d} (sugerido até ${m}) — agrupe níveis`,en:(d,m)=>`depth ${d} (suggested up to ${m}) — group levels`},
 lintWide:{pt:n=>`um nó tem ${n} filhos (sugerido até 8) — agrupe`,en:n=>`a node has ${n} children (suggested up to 8) — group them`},
 lintEmpty:{pt:()=>'mapa sem ramos',en:()=>'map without branches'},
 skipLink:{pt:(t,f)=>`${t}: link inválido (${f}) — use http(s)://`,en:(t,f)=>`${t}: invalid link (${f}) — use http(s)://`},
 skipRemote:{pt:(t,f)=>`${t}: URL remota não baixada (${f}); baixe o arquivo e use caminho local`,en:(t,f)=>`${t}: remote URL not downloaded (${f}); download the file and use a local path`},
 skipImgMissing:{pt:(t,f)=>`${t}: imagem não encontrada (${f})`,en:(t,f)=>`${t}: image not found (${f})`},
 skipFormat:{pt:(t,f)=>`${t}: formato não suportado (${f})`,en:(t,f)=>`${t}: unsupported format (${f})`},
 skipDiagMissing:{pt:(t,f)=>`${t}: diagrama não encontrado (${f})`,en:(t,f)=>`${t}: diagram not found (${f})`},
 skipNoMmdc:{pt:t=>`${t}: mermaid-cli (mmdc) não encontrado — diagrama não renderizado; instale com "npm i -g @mermaid-js/mermaid-cli" ou defina MMDC`,en:t=>`${t}: mermaid-cli (mmdc) not found — diagram not rendered; install with "npm i -g @mermaid-js/mermaid-cli" or set MMDC`},
 skipMmdcFail:{pt:(t,e)=>`${t}: falha ao renderizar diagrama (${e})`,en:(t,e)=>`${t}: failed to render diagram (${e})`},
 diagramAlt:{pt:t=>`Diagrama: ${t}`,en:t=>`Diagram: ${t}`},
 statusDown:{pt:b=>`Servidor indisponível em ${b}`,en:b=>`Server unavailable at ${b}`},
 serveActive:{pt:b=>`Servidor já ativo em ${b}`,en:b=>`Server already running at ${b}`},
 serveStarted:{pt:b=>`Servidor iniciado em ${b}`,en:b=>`Server started at ${b}`},
 serveFail:{pt:()=>'Não foi possível iniciar o servidor',en:()=>'Could not start the server'},
 usageValidate:{pt:()=>'Uso: validate --outline arquivo.md',en:()=>'Usage: validate --outline file.md'},
 usageCreate:{pt:()=>'Uso: create --outline arquivo.md [--id slug] [--title "..."]',en:()=>'Usage: create --outline file.md [--id slug] [--title "..."]'},
 usageUpload:{pt:()=>'Uso: upload <id> <arquivo>',en:()=>'Usage: upload <id> <file>'},
 usageUpdate:{pt:()=>'Uso: update --id slug --outline arquivo.md [--prune] [--dry-run]',en:()=>'Usage: update --id slug --outline file.md [--prune] [--dry-run]'},
 noPresentation:{pt:id=>`Apresentação "${id}" não encontrada. Use create para criá-la.`,en:id=>`Presentation "${id}" not found. Use create to make it.`},
 usageCommands:{pt:()=>'Comandos: version | status | serve | validate --outline f.md | create --outline f.md [--id slug] [--dir pasta] [--replace] | update --id slug --outline f.md [--prune] [--dry-run] | upload <id> <arquivo>',en:()=>'Commands: version | status | serve | validate --outline f.md | create --outline f.md [--id slug] [--dir folder] [--replace] | update --id slug --outline f.md [--prune] [--dry-run] | upload <id> <file>'},
 needTitle:{pt:()=>'Defina um título (# Título no outline ou --title)',en:()=>'Set a title ("# Title" in the outline or --title)'},
 idExists:{pt:id=>`Já existe a apresentação "${id}". Use --replace para sobrescrever ou escolha outro --id.`,en:id=>`Presentation "${id}" already exists. Use --replace to overwrite or choose another --id.`}
};
const t=(key,...args)=>MSG[key][LANG](...args);
const die=(message,code=1)=>{console.error(message);process.exit(code);};
function parseArgs(argv){
 const args={_:[]};
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a.startsWith('--')){const key=a.slice(2);const next=argv[i+1];if(next===undefined||next.startsWith('--'))args[key]=true;else{args[key]=next;i++;}}
  else args._.push(a);
 }
 return args;
}
async function api(route,options){
 let res;
 try{res=await fetch(`${BASE}${route}`,{...options,headers:{'x-context-maps':'1',...(options?.headers||{})}});}catch{die(t('unavailable',BASE,path.join(appRoot,'server.mjs'),path.relative(process.cwd(),path.join(here,'rm.mjs'))),2);}
 const type=res.headers.get('content-type')||'';
 const body=type.includes('json')?await res.json():await res.text();
 if(!res.ok)die(t('httpError',res.status,route,typeof body==='string'?body.slice(0,200):body.error||JSON.stringify(body)));
 return body;
}
const isUp=async()=>{try{const r=await fetch(`${BASE}/api/presentations`);return r.ok&&(r.headers.get('content-type')||'').includes('json');}catch{return false;}};

/* ---------- Outline (markdown com marcadores) → árvore ---------- */
const nodeId=()=>`n-${randomBytes(4).toString('hex')}`;
const RE_MEDIA=/\[(img|mermaid|link|subtitle):([^\]|]+)(?:\|([^\]]*))?\]/g;
const RE_COLOR=/\{color=(#[0-9a-fA-F]{3,8})\}/;
const RE_LINKS=/\{links=(#[0-9a-fA-F]{3,8})\}/;
export function parseOutline(text){
 const warnings=[];
 const lines=text.replace(/^﻿/,'').replace(/\r\n/g,'\n').split('\n');
 let title=null;const rootExtras={};
 const root={id:'root',title:'',children:[],_meta:rootExtras};
 let stack=[{indent:-1,node:root}];const roots=[root];
 const pull=(raw,node,lineNo)=>{
  let s=raw;
  node._media=[...s.matchAll(RE_MEDIA)].map(m=>({kind:m[1]==='img'?'image':m[1]==='link'?'link':m[1]==='subtitle'?'subtitle':'diagram',file:m[2].trim(),alt:(m[3]||'').trim(),raw:m[2]+(m[3]!==undefined?'|'+m[3]:'')}));
  s=s.replace(RE_MEDIA,'');
  const col=s.match(RE_COLOR);if(col){node.color=col[1];s=s.replace(RE_COLOR,'');}
  const lnk=s.match(RE_LINKS);if(lnk){node.linksColor=lnk[1];s=s.replace(RE_LINKS,'');}
  node.title=s.replace(/\s+/g,' ').trim();
  if(!node.title&&!node._media.length)warnings.push(t('warnNoText',lineNo));
  if(node.title.length>MAX_TITLE)warnings.push(t('warnLong',lineNo,node.title.length,MAX_TITLE));
 };
 lines.forEach((line,i)=>{
  if(!line.trim()||line.trim().startsWith('<!--'))return;
  const h=line.match(/^#\s+(.*)$/);
  if(h&&title===null){title=h[1];pull(title,root,i+1);return;}
  if(h){ // outro "# Título": novo card raiz (ponto de partida independente)
   const extra={id:nodeId(),title:'',children:[]};pull(h[1],extra,i+1);roots.push(extra);stack=[{indent:-1,node:extra}];return;
  }
  const b=line.match(/^([ \t]*)[-*]\s+(.*)$/);
  if(!b){warnings.push(t('warnIgnored',i+1));return;}
  const indent=b[1].replace(/\t/g,'  ').length;
  while(stack.length>1&&stack.at(-1).indent>=indent)stack.pop();
  const parent=stack.at(-1).node;
  const node={id:nodeId(),title:'',children:[]};pull(b[2],node,i+1);
  parent.children.push(node);stack.push({indent,node});
 });
 if(!root.title)warnings.push(t('warnNoTitle'));
 return {root,roots,warnings};
}
function stats(root){
 let count=0,depth=0,widest=0;
 const walk=(n,d)=>{count++;depth=Math.max(depth,d);widest=Math.max(widest,n.children.length);n.children.forEach(c=>walk(c,d+1));};
 walk(root,0);return {count,depth,widest};
}
function lintAll(roots){
 const parts=roots.map(lint);
 return {warnings:parts.flatMap(p=>p.warnings),count:parts.reduce((a,p)=>a+p.count,0),depth:Math.max(...parts.map(p=>p.depth)),widest:Math.max(...parts.map(p=>p.widest))};
}
function lint(root){
 const w=[],s=stats(root);
 if(s.depth>MAX_DEPTH)w.push(t('lintDepth',s.depth,MAX_DEPTH));
 if(s.widest>8)w.push(t('lintWide',s.widest));
 if(!root.children.length)w.push(t('lintEmpty'));
 return {warnings:w,...s};
}

/* ---------- Imagens e diagramas ---------- */
const MIME_OK=new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg']);
async function uploadFile(id,file){
 const buf=await readFile(file);
 const res=await api(`/api/presentations/${id}/assets?name=${encodeURIComponent(path.basename(file))}`,{method:'POST',body:buf});
 return res.src;
}
function findMmdc(){
 if(process.env.MMDC)return process.env.MMDC;
 const probe=spawnSync(process.platform==='win32'?'where':'which',['mmdc'],{encoding:'utf8'});
 return probe.status===0?probe.stdout.split(/\r?\n/)[0].trim():null;
}
async function renderMermaid(source){
 const mmdc=findMmdc();if(!mmdc)return null;
 const dir=await mkdtemp(path.join(tmpdir(),'rm-mmd-'));
 const input=path.join(dir,'d.mmd'),output=path.join(dir,'d.svg');
 await writeFile(input,source);
 // MMDC_BROWSER: caminho de um Chrome/Chromium já instalado (evita baixar o do puppeteer).
 const extra=[];
 if(process.env.MMDC_BROWSER){const cfg=path.join(dir,'puppeteer.json');await writeFile(cfg,JSON.stringify({executablePath:process.env.MMDC_BROWSER,args:['--no-sandbox']}));extra.push('-p',cfg);}
 const quote=s=>process.platform==='win32'?`"${s}"`:s;
 const run=spawnSync(quote(mmdc),['-i',quote(input),'-o',quote(output),'-t','dark','-b','transparent',...extra.map(quote)],{encoding:'utf8',shell:process.platform==='win32'});
 if(run.status!==0||!existsSync(output)){await removeFile(dir,{recursive:true,force:true});return {error:(run.stderr||run.stdout||'falha').slice(0,200)};}
 return {file:output,dir};
}
async function attachOwn(id,node,baseDir,report){ // mídia, links e subtítulo do próprio nó (sem descer nos filhos)
 for(const item of node._media||[]){
  if(item.kind==='subtitle'){
   const text=item.raw.trim();
   node.subtitle=node.subtitle?`${node.subtitle} ${text}`:text;
   continue;
  }
  if(item.kind==='link'){
   let ok=false;try{ok=['http:','https:'].includes(new URL(item.file).protocol);}catch{}
   if(!ok)report.skipped.push(t('skipLink',node.title,item.file));
   else{(node.links||=[]).push(item.alt?{url:item.file,label:item.alt}:{url:item.file});report.links=(report.links||0)+1;}
   continue;
  }
  const file=path.resolve(baseDir,item.file);
  if(item.kind==='image'){
   if(/^https?:/i.test(item.file))report.skipped.push(t('skipRemote',node.title,item.file));
   else if(!existsSync(file))report.skipped.push(t('skipImgMissing',node.title,item.file));
   else if(!MIME_OK.has(path.extname(file).toLowerCase()))report.skipped.push(t('skipFormat',node.title,item.file));
   else{(node.images||=[]).push({src:await uploadFile(id,file),alt:item.alt||node.title});report.images++;}
  }else{
   if(!existsSync(file)){report.skipped.push(t('skipDiagMissing',node.title,item.file));continue;}
   const source=await readFile(file,'utf8');
   const out=await renderMermaid(source);
   if(!out)report.skipped.push(t('skipNoMmdc',node.title));
   else if(out.error)report.skipped.push(t('skipMmdcFail',node.title,out.error));
   else{(node.images||=[]).push({src:await uploadFile(id,out.file),alt:item.alt||t('diagramAlt',node.title),kind:'diagram',source});await removeFile(out.dir,{recursive:true,force:true});report.diagrams++;}
  }
 }
 }
async function attach(id,node,baseDir,report){
 await attachOwn(id,node,baseDir,report);
 for(const c of node.children)await attach(id,c,baseDir,report);
}
function clean(node){
 const {_media,_meta,...rest}=node;
 return {...rest,children:node.children.map(clean)};
}

/* ---------- update: mescla um outline novo numa apresentação existente, sem perder o que foi feito à mão ---------- */
const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
async function mergeInto(id,existing,fresh,baseDir,report,opts){
 // existing: nó salvo (ou null); fresh: nó do outline. Devolve o nó resultante.
 if(!existing){
  report.added.push(fresh.title||'(sem título)');
  if(!opts.dry)await attach(id,fresh,baseDir,report);
  return clean(fresh);
 }
 const out={...existing};let changed=false;
 if(fresh.color&&fresh.color!==existing.color){out.color=fresh.color;changed=true;}
 if(fresh.linksColor&&fresh.linksColor!==existing.linksColor){out.linksColor=fresh.linksColor;changed=true;}
 // mídia do outline: só entra o que ainda não existe no nó (imagem pelo alt, diagrama pelo código, link pela URL)
 const have=existing.images||[],haveLinks=existing.links||[],pending=[];
 for(const item of fresh._media||[]){
  if(item.kind==='subtitle'){pending.push({...item,kind:'subtitle-set'});continue;}
  if(item.kind==='link'){if(haveLinks.some(l=>l.url===item.file))continue;pending.push(item);continue;}
  if(item.kind==='image'){if(have.some(m=>m.kind!=='diagram'&&m.alt===(item.alt||fresh.title)))continue;pending.push(item);continue;}
  const file=path.resolve(baseDir,item.file);
  const source=existsSync(file)?await readFile(file,'utf8'):null;
  if(source!==null&&have.some(m=>m.kind==='diagram'&&m.source===source))continue;
  pending.push(item);
 }
 const subtitleItem=pending.find(i=>i.kind==='subtitle-set');
 if(subtitleItem){if(subtitleItem.raw.trim()!==(existing.subtitle||'')){out.subtitle=subtitleItem.raw.trim();changed=true;}}
 const toAttach=pending.filter(i=>i.kind!=='subtitle-set');
 if(toAttach.length){
  changed=true;
  if(!opts.dry){
   const temp={title:fresh.title,_media:toAttach,children:[]};
   await attachOwn(id,temp,baseDir,report);
   if(temp.images)out.images=[...(existing.images||[]),...temp.images];
   if(temp.links)out.links=[...(existing.links||[]),...temp.links];
  }
 }
 if(changed)report.updated.push(fresh.title||existing.title||'(sem título)');
 // filhos: a ordem do outline manda; o que só existe no mapa fica no fim (ou sai com --prune)
 const used=new Set(),children=[];
 for(const kid of fresh.children){
  const match=(existing.children||[]).find(c=>!used.has(c)&&norm(c.title)===norm(kid.title));
  if(match)used.add(match);
  children.push(await mergeInto(id,match||null,kid,baseDir,report,opts));
 }
 for(const c of existing.children||[])if(!used.has(c)){
  if(opts.prune)report.removed.push(c.title||'(sem título)');
  else{children.push(c);report.kept.push(c.title||'(sem título)');}
 }
 out.children=children;
 return out;
}

/* ---------- Comandos ---------- */
const commands={
 async status(){
  if(!await isUp())die(t('statusDown',BASE),2);
  const list=await api('/api/presentations');console.log(JSON.stringify({server:BASE,presentations:list},null,2));
 },
 async serve(){
  if(await isUp()){console.log(t('serveActive',BASE));return;}
  const url=new URL(BASE);
  const child=spawn(process.execPath,[path.join(appRoot,'server.mjs')],{cwd:appRoot,detached:true,stdio:'ignore',env:{...process.env,PORT:url.port||'4173'}});
  child.unref();
  for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));if(await isUp()){console.log(t('serveStarted',BASE));return;}}
  die(t('serveFail'));
 },
 async validate(args){
  const file=args.outline||args._[0];if(!file)die(t('usageValidate'));
  const {root,roots,warnings}=parseOutline(await readFile(file,'utf8'));
  const l=lintAll(roots);
  console.log(JSON.stringify({title:root.title,roots:roots.length,nodes:l.count,depth:l.depth,widest:l.widest,warnings:[...warnings,...l.warnings]},null,2));
  process.exit(warnings.length||l.warnings.length?3:0);
 },
 async create(args){
  const file=args.outline||args._[0];if(!file)die(t('usageCreate'));
  const text=await readFile(file,'utf8');
  const {root,roots,warnings}=parseOutline(text);
  if(!root.title&&!(args.title&&args.title!==true))die(t('needTitle'));
  const docTitle=args.title&&args.title!==true?args.title:root.title;
  const l=lintAll(roots);
  let id=args.id&&args.id!==true?args.id:null,created;
  if(id){
   const list=await api('/api/presentations');
   if(!list.some(p=>p.id===id)){created=await api('/api/presentations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:docTitle,id,dir:args.dir&&args.dir!==true?path.resolve(args.dir):undefined})});id=created.id;}
   else if(!args.replace)die(t('idExists',id));
  }else{
   created=await api('/api/presentations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:docTitle,dir:args.dir&&args.dir!==true?path.resolve(args.dir):undefined})});id=created.id;
  }
  const report={images:0,diagrams:0,skipped:[]};
  for(const r of roots)await attach(id,r,path.dirname(path.resolve(file)),report);
  await api(`/api/presentations/${id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({title:docTitle,roots:roots.map(clean)})});
  console.log(JSON.stringify({id,url:`${BASE}/?p=${id}`,file:`presentations/${id}.json`,roots:roots.length,nodes:l.count,depth:l.depth,images:report.images,diagrams:report.diagrams,links:report.links||0,warnings:[...warnings,...l.warnings],skipped:report.skipped},null,2));
 },
 async update(args){
  const file=args.outline||args._[0],id=args.id&&args.id!==true?args.id:null;
  if(!file||!id)die(t('usageUpdate'));
  const {root,roots,warnings}=parseOutline(await readFile(file,'utf8'));
  const list=await api('/api/presentations');
  if(!list.some(p=>p.id===id))die(t('noPresentation',id));
  const doc=await api(`/api/presentations/${id}`);
  const existingRoots=doc.roots||[doc.tree],used=new Set(),report={images:0,diagrams:0,skipped:[],added:[],updated:[],kept:[],removed:[]};
  const opts={dry:!!args['dry-run'],prune:!!args.prune},baseDir=path.dirname(path.resolve(file));
  const merged=[];
  for(const fresh of roots){
   const match=existingRoots.find(r=>!used.has(r)&&norm(r.title)===norm(fresh.title));
   if(match)used.add(match);
   const node=await mergeInto(id,match||null,fresh,baseDir,report,opts);
   if(!match&&existingRoots.some(r=>r.id===node.id))node.id=nodeId(); // id de raiz nova não pode colidir
   merged.push(node);
  }
  for(const r of existingRoots)if(!used.has(r)){ // raízes que o outline não menciona: ficam (com posição) ou saem com --prune
   if(opts.prune)report.removed.push(r.title||'(sem título)');else{merged.push(r);report.kept.push(r.title||'(sem título)');}
  }
  const title=args.title&&args.title!==true?args.title:doc.title;
  const l=lintAll(roots);
  if(!opts.dry)await api(`/api/presentations/${id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({title,roots:merged})});
  console.log(JSON.stringify({id,url:`${BASE}/?p=${id}`,dryRun:opts.dry,added:report.added,updated:report.updated,kept:report.kept,removed:report.removed,images:report.images,diagrams:report.diagrams,warnings:[...warnings,...l.warnings],skipped:report.skipped},null,2));
 },
 async upload(args){
  const [id,file]=args._;if(!id||!file)die(t('usageUpload'));
  console.log(await uploadFile(id,path.resolve(file)));
 }
};

async function toolVersion(){ // lê package.json do repositório; uma cópia avulsa da skill (sem o app ao lado) não tem versão
 try{const pkg=JSON.parse(await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..','..','package.json'),'utf8'));if(pkg.name==='context-maps')return pkg.version;}catch{}
 return 'unknown';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [cmd,...rest]=process.argv.slice(2);
 if(cmd==='--version'||cmd==='version'){console.log(`context-maps ${await toolVersion()}`);process.exit(0);}
 if(!commands[cmd])die(t('usageCommands'),64);
 await commands[cmd](parseArgs(rest));
}
