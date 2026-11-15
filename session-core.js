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
/** SVG 800×450 em visual de terminal: a mensagem do ponto de abertura e o que vem logo depois.
 *  "> " a pessoa, "●" o Claude e as ferramentas, "⎿" o resultado; cor só na resposta escolhida, na skill e no erro. */
export function sessionThumbSvg(session,anchor=0,{title=''}={}){
 const W=800,H=450,X=26,LH=24,COLS=76,FG='#d0d0d0',DIM='#7d7d7d',WHITE='#ffffff',OK='#5fbf8f',BAD='#e06c6c',HI='#e5c07b';
 const FONT="font-family=\"Consolas, 'Cascadia Mono', Menlo, monospace\" font-size=\"16\"",parts=[];
 parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0c0c" stop-opacity="0"/><stop offset="1" stop-color="#0c0c0c"/></linearGradient><clipPath id="body"><rect x="0" y="40" width="${W}" height="${H-40}"/></clipPath></defs>`);
 parts.push(`<rect width="${W}" height="${H}" rx="10" fill="#0c0c0c"/><rect width="${W}" height="40" rx="10" fill="#1a1a1a"/><rect y="28" width="${W}" height="12" fill="#1a1a1a"/>`);
 parts.push(`<circle cx="22" cy="20" r="5" fill="#3d3d3d"/><circle cx="40" cy="20" r="5" fill="#3d3d3d"/><circle cx="58" cy="20" r="5" fill="#3d3d3d"/><text x="80" y="25" ${FONT} fill="${DIM}">${esc(wrap(title||session.title||'claude',64,1)[0]||'')}</text><g clip-path="url(#body)">`);
 let y=58;
 // uma linha de texto: segmentos [texto, cor, negrito?]
 const row=(segs,x=X)=>{parts.push(`<text x="${x}" y="${y+17}" ${FONT} xml:space="preserve">${segs.map(([t,fill,bold])=>`<tspan fill="${fill}"${bold?' font-weight="700"':''}>${esc(t)}</tspan>`).join('')}</text>`);y+=LH;};
 const block=(mark,markFill,text,fill,max,bold)=>wrap(text,COLS-2,max).forEach((l,i)=>row([[i?'  ':mark+' ',markFill],[l,fill,bold]]));
 for(const item of session.items.slice(Math.max(0,anchor))){
  if(y>H-34)break;
  if(item.k==='user'||item.k==='cmd'){
   const ls=wrap(item.k==='cmd'?`${item.name} ${item.args}`:plain(item.text)||`[${item.images||1} image]`,COLS-2,4);
   parts.push(`<rect x="12" y="${y-2}" width="${W-24}" height="${ls.length*LH+6}" fill="#191919"/>`);
   ls.forEach((l,i)=>row([[i?'  ':'> ',DIM],[l,WHITE]]));y+=12;
  }else if(item.k==='assistant'){block('●',FG,plain(item.text),FG,4);y+=8;}
  else if(item.k==='tool'){
   const c=item.skill?HI:item.error?BAD:OK,label=wrap(`(${item.title||''})`,COLS-4-item.name.length,1)[0];
   row([['● ',c],[item.name,item.skill?HI:WHITE,true],[label,item.skill?HI:FG]]);
   const out=String(item.result||'').slice(0,400).replace(/\s+/g,' ').trim(); // prévia numa linha (um JSON não fica só "{")
   if(out)row([['  ⎿ ',DIM],[wrap(out.trim(),COLS-6,1)[0],DIM]]);
   y+=8;
  }else if(item.k==='ask'){
   for(const q of item.questions){
    const opts=q.options.slice(0,4),h=(1+opts.length)*LH+16,top=y;
    parts.push(`<rect x="14" y="${top}" width="${W-28}" height="${h}" rx="4" fill="none" stroke="#3a3a3a"/>`);y+=8;
    row([[q.header?`[${q.header}] `:'',DIM],[wrap(q.question,COLS-6-(q.header?q.header.length+3:0),1)[0],WHITE,true]]);
    const answer=String(item.answers?.[q.question]??''),picked=new Set(q.multiSelect?answer.split(', '):[answer]);
    opts.forEach((o,i)=>{const on=picked.has(o.label);row([[on?(q.multiSelect?'[✓] ':'❯   '):(q.multiSelect?'[ ] ':'    '),on?OK:DIM],[`${i+1}. `,on?OK:DIM],[wrap(o.label,COLS-12,1)[0],on?OK:FG,on]]);});
    y=top+h+10;
   }
  }else if(item.k==='next'&&item.ask){row([['→ ',DIM],[wrap(item.ask,COLS-2,1)[0],WHITE,true]]);y+=8;}
  else if(item.k==='plan'){for(const x of item.items.slice(0,4))row([[x.status==='completed'?'☒ ':x.status==='in_progress'?'▶ ':'☐ ',DIM],[wrap(x.content,COLS-2,1)[0],x.status==='completed'?DIM:x.status==='in_progress'?WHITE:FG]],X+18);y+=8;}
 }
 parts.push(`</g><rect x="0" y="${H-60}" width="${W}" height="60" fill="url(#fade)"/><rect width="${W}" height="${H}" rx="10" fill="none" stroke="#ffffff22"/></svg>`);
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
