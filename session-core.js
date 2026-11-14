// Sessões do Claude Code (.jsonl) → transcrição compacta para os cards. Puro (sem DOM, sem Node): usado pelo servidor
// (lê o arquivo linha a linha), pelo navegador (arquivo escolhido à mão, miniatura) e pela skill (rm.mjs).
//
// Transcrição: {title, started, ended, items:[…]} — cada item tem k (tipo):
//   user      {text, images?}                 mensagem da pessoa
//   assistant {text}                          resposta
//   think     {text}                          raciocínio (cortado)
//   cmd       {name, args}                    comando /… digitado
//   tool      {name, title, input, result, error?, skill?}   chamada de ferramenta (entrada e resultado cortados)
//   ask       {questions:[{header,question,multiSelect,options:[{label,description}]}], answers:{pergunta:resposta}}
//   next      {recap, ask, actions:[rótulos]} caixa de "próximo passo" (recap + pergunta + botões)
//   plan      {items:[{content,status}]}      lista de tarefas
//   sum       {text}                          contexto resumido (a conversa foi compactada)

export const LIMITS={input:1500,result:2500,think:1500,text:30000,sum:3000};
/** corta textos longos mantendo o começo e o fim */
export function clip(text,max){
 const s=String(text??'');if(s.length<=max)return s;
 const head=Math.floor(max*.7),tail=max-head;
 return `${s.slice(0,head)}\n⋯ +${s.length-max} ⋯\n${s.slice(-tail)}`;
}
const stripReminders=s=>String(s).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g,'').replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g,'').replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,'').replace(/<pasted_content[^>]*>|<\/pasted_content[^>]*>/g,'').trim();
const baseName=p=>String(p||'').split(/[\\/]/).pop();
const firstLine=s=>String(s||'').split('\n').find(l=>l.trim())?.trim()||'';
/** linha de resumo de uma chamada de ferramenta (o que aparece com ela recolhida) */
export function toolTitle(name,input={}){
 if(name==='Bash'||name==='PowerShell')return input.description||firstLine(input.command);
 if(name==='Read'||name==='Write'||name==='Edit'||name==='NotebookEdit')return baseName(input.file_path||input.notebook_path);
 if(name==='Grep'||name==='Glob')return input.pattern||'';
 if(name==='Skill')return input.skill||'';
 if(name==='Agent'||name==='Task')return input.description||'';
 if(name==='WebFetch')return input.url||'';
 if(name==='WebSearch')return input.query||'';
 return input.description||input.title||input.url||input.query||input.action||'';
}
const toolInput=(name,input={})=>clip(name==='Bash'||name==='PowerShell'?input.command||'':JSON.stringify(input,null,1),LIMITS.input);
const shortName=name=>String(name).replace(/^mcp__/,'').replace(/__/g,' › ');
function resultText(content){
 if(typeof content==='string')return {text:content,images:0};
 if(!Array.isArray(content))return {text:'',images:0};
 return {text:content.filter(b=>b.type==='text').map(b=>b.text).join('\n'),images:content.filter(b=>b.type==='image').length};
}
function parseAnswers(text){ // "…answered: "pergunta"="resposta", "pergunta 2"="resposta 2". You can now…"
 const out={};for(const m of String(text).matchAll(/"([^"]+)"="([^"]*)"/g))out[m[1]]=m[2];return out;
}

/** leitor incremental: push(objeto de uma linha do .jsonl) … finish() → transcrição */
export function createSessionReader(){
 const items=[],byToolId=new Map(),meta={title:'',started:'',ended:''};
 const userText=(raw,o)=>{
  if(o.isCompactSummary){items.push({k:'sum',text:clip(stripReminders(raw),LIMITS.sum)});return;}
  if(o.isMeta)return;
  const cmd=/<command-name>([^<]*)<\/command-name>/.exec(raw);
  if(cmd){items.push({k:'cmd',name:cmd[1].trim(),args:(/<command-args>([\s\S]*?)<\/command-args>/.exec(raw)?.[1]||'').trim()});return;}
  const text=stripReminders(raw);if(text)items.push({k:'user',text:clip(text,LIMITS.text)});
 };
 const push=o=>{
  if(!o||typeof o!=='object'||o.isSidechain)return;
  if(o.type==='custom-title'&&o.customTitle){meta.title=o.customTitle;return;}
  if(o.type!=='user'&&o.type!=='assistant')return;
  if(o.timestamp){if(!meta.started)meta.started=o.timestamp;meta.ended=o.timestamp;}
  const content=o.message?.content;
  if(o.type==='user'){
   if(typeof content==='string')return userText(content,o);
   if(!Array.isArray(content))return;
   let images=0;
   for(const b of content){
    if(b.type==='text')userText(b.text,o);
    else if(b.type==='image')images++;
    else if(b.type==='tool_result'){
     const item=byToolId.get(b.tool_use_id);if(!item)continue;
     const {text,images:n}=resultText(b.content);
     if(item.k==='ask')item.answers=o.toolUseResult?.answers&&typeof o.toolUseResult.answers==='object'?o.toolUseResult.answers:parseAnswers(text);
     else if(item.k==='tool'){item.result=clip(text,LIMITS.result)+(n?`\n[${n} image${n>1?'s':''}]`:'');if(b.is_error)item.error=true;}
    }
   }
   if(images){const last=items.at(-1);if(last?.k==='user')last.images=(last.images||0)+images;else items.push({k:'user',text:'',images});}
   return;
  }
  if(!Array.isArray(content))return;
  for(const b of content){
   if(b.type==='text'){if(b.text?.trim())items.push({k:'assistant',text:clip(b.text,LIMITS.text)});}
   else if(b.type==='thinking'){if(b.thinking?.trim())items.push({k:'think',text:clip(b.thinking,LIMITS.think)});}
   else if(b.type==='tool_use'){
    const input=b.input||{};let item;
    if(b.name==='AskUserQuestion')item={k:'ask',questions:(input.questions||[]).map(q=>({header:q.header||'',question:q.question||'',multiSelect:!!q.multiSelect,options:(q.options||[]).map(x=>({label:x.label||'',description:x.description||''}))})),answers:{}};
    else if(/wrap_up$/.test(b.name))item={k:'next',recap:input.recap||'',ask:input.ask||'',actions:(input.actions||[]).map(a=>a.label||a.action||'').filter(Boolean)};
    else if(/update_plan$/.test(b.name)||b.name==='TodoWrite'){const list=input.items||input.todos;item=Array.isArray(list)?{k:'plan',items:list.map(x=>({content:x.content||'',status:x.status||'pending'}))}:null;}
    else item={k:'tool',name:shortName(b.name),title:clip(toolTitle(b.name,input),200),input:toolInput(b.name,input),result:'',...(b.name==='Skill'?{skill:input.skill||''}:{})};
    if(item){items.push(item);byToolId.set(b.id,item);}
   }
  }
 };
 return {push,finish:()=>({...meta,items})};
}
/** texto de um .jsonl inteiro → transcrição */
export function parseSession(text){
 const reader=createSessionReader();
 for(const line of String(text).split('\n')){if(!line.trim())continue;try{reader.push(JSON.parse(line));}catch{}}
 return reader.finish();
}
/** só o trecho [from, to] (índices dos itens, inclusive) */
export const sliceSession=(session,from=0,to=session.items.length-1)=>({...session,items:session.items.slice(Math.max(0,from),to+1)});
export function sessionStats(session){
 const count=k=>session.items.filter(i=>i.k===k).length;
 return {items:session.items.length,users:count('user'),tools:count('tool'),asks:count('ask'),skills:session.items.filter(i=>i.skill).length,bytes:JSON.stringify(session).length};
}
/** texto principal de um item (busca, âncora da skill, miniatura) */
export const itemText=i=>i.k==='tool'?`${i.name} ${i.title}`:i.k==='ask'?i.questions.map(q=>q.question).join(' '):i.k==='next'?`${i.recap} ${i.ask}`:i.k==='plan'?i.items.map(x=>x.content).join(' '):i.k==='cmd'?`${i.name} ${i.args}`:i.text||'';
/** índice do primeiro item (de preferência uma mensagem da pessoa) que contém o texto; -1 se nenhum */
export function findAnchor(session,needle){
 const n=String(needle||'').trim().toLowerCase();if(!n)return -1;
 const hit=k=>session.items.findIndex(i=>(!k||i.k===k)&&itemText(i).toLowerCase().includes(n));
 const user=hit('user');return user>=0?user:hit('');
}

/* ---------- segredos: o que parece chave/token/senha é trocado por ••• ---------- */
const SECRET=/\b(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[\w-]{10,}|eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{5,})|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|((?:password|passwd|senha|secret|token|api[_-]?key|authorization)["']?\s*[=:]\s*["']?)(?!\{\{)([^\s"',;&]{8,})/gi;
const FIELDS=['text','input','result','title','args','recap','ask'];
const maskText=s=>String(s).replace(SECRET,(m,strong,prefix)=>prefix?`${prefix}•••`:'•••');
/** quantos itens têm algo com cara de segredo */
export function secretHits(session){
 return session.items.filter(i=>FIELDS.some(f=>typeof i[f]==='string'&&(SECRET.lastIndex=0,SECRET.test(i[f])))).length;
}
/** cópia da transcrição com os segredos trocados por ••• */
export function maskSecrets(session){
 return {...session,items:session.items.map(i=>{const out={...i};for(const f of FIELDS)if(typeof out[f]==='string')out[f]=maskText(out[f]);return out;})};
}

/* ---------- miniatura do card (SVG estático do trecho a partir do ponto de abertura) ---------- */
const plain=s=>String(s).replace(/```[\w-]*\n?/g,'').replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/`([^`\n]+)`/g,'$1').replace(/^#{1,6} /gm,''); // markdown → texto corrido (miniatura)
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function wrap(text,width,maxLines){
 const out=[];
 for(const para of String(text).replace(/\t/g,'  ').split('\n')){
  let line='';
  for(const word of para.split(' ')){
   if((line+' '+word).trim().length>width){if(line)out.push(line);line=word.length>width?word.slice(0,width-1)+'…':word;}
   else line=(line?line+' ':'')+word;
   if(out.length>=maxLines)break;
  }
  if(out.length>=maxLines)break;
  if(line||!out.length)out.push(line);
 }
 const cut=out.length>maxLines||String(text).length>out.join(' ').length+4;
 const lines=out.slice(0,maxLines);if(cut&&lines.length)lines[lines.length-1]=lines.at(-1).slice(0,width-1).replace(/\s+$/,'')+'…';
 return lines;
}
/** SVG 800×450 no estilo de conversa: a mensagem do ponto de abertura e o que vem logo depois */
export function sessionThumbSvg(session,anchor=0,{title='',you='You',assistant='Claude'}={}){
 const W=800,H=450,F="font-family=\"'Segoe UI', Arial, sans-serif\"",parts=[];
 parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151515" stop-opacity="0"/><stop offset="1" stop-color="#151515"/></linearGradient><clipPath id="body"><rect x="0" y="46" width="${W}" height="${H-46}"/></clipPath></defs>`);
 parts.push(`<rect width="${W}" height="${H}" rx="14" fill="#151515"/><rect width="${W}" height="46" rx="14" fill="#202020"/><rect y="30" width="${W}" height="16" fill="#202020"/>`);
 parts.push(`<circle cx="24" cy="23" r="6" fill="#d97757"/><text x="40" y="29" ${F} font-size="17" font-weight="600" fill="#e8e8e8">${esc(wrap(title||session.title||'Claude Code',70,1)[0]||'')}</text><g clip-path="url(#body)">`);
 let y=66;
 const label=(text,color)=>{parts.push(`<text x="28" y="${y+12}" ${F} font-size="13" font-weight="600" fill="${color}">${esc(text)}</text>`);y+=22;};
 const lines=(list,color,size=17,x=28)=>{for(const l of list){parts.push(`<text x="${x}" y="${y+size-3}" ${F} font-size="${size}" fill="${color}" xml:space="preserve">${esc(l)}</text>`);y+=size+6;}};
 for(const item of session.items.slice(Math.max(0,anchor))){
  if(y>H-30)break;
  if(item.k==='user'){
   const ls=wrap(item.text||`[${item.images||1} image]`,74,4),h=ls.length*23+40;
   parts.push(`<rect x="16" y="${y}" width="${W-32}" height="${h}" rx="12" fill="#1d3a30" stroke="#2f6b54"/>`);y+=10;label(you,'#7fd1ae');lines(ls,'#f2f2f2');y+=18;
  }else if(item.k==='assistant'){label(assistant,'#d97757');lines(wrap(plain(item.text),76,4),'#dcdcdc');y+=12;}
  else if(item.k==='tool'){
   const text=`${item.skill?'★ Skill':'▸ '+item.name}${item.title?' · '+item.title:''}`;
   parts.push(`<rect x="16" y="${y}" width="${W-32}" height="30" rx="8" fill="${item.skill?'#3a2f14':'#1e1e1e'}" stroke="${item.skill?'#b8891f':'#333'}"/><text x="28" y="${y+20}" ${F} font-size="14" fill="${item.skill?'#ffd43b':'#a8a8a8'}">${esc(wrap(text,92,1)[0])}</text>`);y+=38;
  }else if(item.k==='ask'){
   for(const q of item.questions){
    const opts=q.options.slice(0,4),h=44+opts.length*26;
    parts.push(`<rect x="16" y="${y}" width="${W-32}" height="${h}" rx="12" fill="#1b2330" stroke="#4a6fa5"/>`);
    parts.push(`<text x="28" y="${y+25}" ${F} font-size="16" font-weight="600" fill="#cfe0ff">${esc(wrap(`? ${q.question}`,78,1)[0])}</text>`);
    const picked=String(item.answers?.[q.question]??'');
    opts.forEach((o,i)=>{const on=picked.split(', ').includes(o.label)||picked===o.label;parts.push(`<text x="40" y="${y+50+i*26}" ${F} font-size="15" fill="${on?'#7fd1ae':'#9fb0c8'}">${esc(wrap(`${on?'✓':'○'} ${o.label}`,84,1)[0])}</text>`);});
    y+=h+10;
   }
  }else if(item.k==='next'&&item.ask){parts.push(`<text x="28" y="${y+16}" ${F} font-size="15" fill="#9fb0c8">${esc(wrap(`→ ${item.ask}`,88,1)[0])}</text>`);y+=30;}
  else if(item.k==='cmd'){parts.push(`<text x="28" y="${y+16}" ${F} font-size="15" fill="#a8a8a8">${esc(wrap(`${item.name} ${item.args}`,88,1)[0])}</text>`);y+=30;}
 }
 parts.push(`</g><rect x="0" y="${H-70}" width="${W}" height="70" fill="url(#fade)"/><rect width="${W}" height="${H}" rx="14" fill="none" stroke="#ffffff22"/></svg>`);
 return parts.join('');
}

/* ---------- arquivo do card: a miniatura SVG leva a transcrição dentro (em <metadata>, que o navegador não desenha).
   Um arquivo só: copiar, exportar (ZIP/HTML) e importar a apresentação funcionam como com qualquer imagem. ---------- */
const META_OPEN='<metadata id="cm-session">',META_CLOSE='</metadata>';
/** miniatura + transcrição num SVG só */
export function sessionCardSvg(session,anchor=0,labels={}){
 const json=JSON.stringify({v:1,anchor,session}).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 return sessionThumbSvg(session,anchor,labels).replace(/<\/svg>$/,()=>`${META_OPEN}${json}${META_CLOSE}</svg>`); // função: o texto da conversa pode ter "$&", "$'"…
}
/** SVG de um card de sessão → {session, anchor} (null se não for um) */
export function sessionFromSvg(svg){
 const text=String(svg),a=text.indexOf(META_OPEN);if(a<0)return null;
 const b=text.indexOf(META_CLOSE,a);if(b<0)return null;
 try{
  const data=JSON.parse(text.slice(a+META_OPEN.length,b).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
  return data?.session?.items?{session:data.session,anchor:data.anchor||0}:null;
 }catch{return null;}
}
