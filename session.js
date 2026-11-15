// Sessões do Claude Code nos cards: desenho da conversa, visualizador lateral e janela de importar.
import {sidePanel} from './openapi.js?v=8';
import {parseSession,sliceSession,sessionStats,secretHits,maskSecrets,itemText,sessionFromSvg} from './session-core.js?v=2';

const el=(tag,props={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==null&&v!==undefined&&v!==false)e.setAttribute(k,v===true?'':v);}e.append(...kids.filter(x=>x!==null&&x!==undefined&&x!==false));return e;};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** markdown mínimo e seguro (o texto é escapado antes): blocos de código, `código`, **negrito**, títulos e links http(s) */
export function miniMarkdown(text){
 const blocks=[];
 let s=esc(text).replace(/```([\w-]*)\n([\s\S]*?)```/g,(m,lang,code)=>{blocks.push(`<pre class="ss-code"><code>${code.replace(/\n$/,'')}</code></pre>`);return `\u0000${blocks.length-1}\u0000`;});
 s=s.replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
  .replace(/^#{1,6} (.+)$/gm,'<strong class="ss-h">$1</strong>')
  .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
 return s.replace(/\u0000(\d+)\u0000/g,(m,i)=>blocks[Number(i)]);
}
/** lê o arquivo do card (SVG com a transcrição dentro) → {session, anchor} ou null */
export async function loadSessionCard(src){
 try{const res=await fetch(src);if(!res.ok)return null;return sessionFromSvg(await res.text());}catch{return null;}
}
// Visual de terminal (como o Claude Code): fonte monoespaçada, quase sem cor; "> " para a pessoa, "●" para o Claude e
// para as ferramentas, "⎿" para o resultado. Realce só onde importa: resposta escolhida, skill, erro, ponto marcado.
const STATUS={completed:'☒',in_progress:'▶',pending:'☐'};
const firstLine=text=>String(text||'').slice(0,400).replace(/\s+/g,' ').trim().slice(0,200); // prévia do resultado numa linha (um JSON não fica só "{")
const line=(mark,cls,...kids)=>el('div',{class:'ss-line'},el('span',{class:`ss-mark ${cls}`,'aria-hidden':'true'},mark),el('div',{class:'ss-body'},...kids));
/** um item da transcrição → elemento (as ferramentas ficam recolhidas; o corpo só é montado ao abrir) */
function renderItem(item,index,t){
 const row=el('div',{class:`ss-item ss-${item.k}`,'data-i':String(index)});
 if(item.k==='user'){
  row.setAttribute('aria-label',t('sessionYou'));
  const body=el('div',{class:'ss-text'});if(item.text)body.innerHTML=miniMarkdown(item.text);
  row.append(line('>','',body,item.images?el('span',{class:'ss-note'},t('sessionImages',item.images)):null));
 }else if(item.k==='assistant'){
  const body=el('div',{class:'ss-text'});body.innerHTML=miniMarkdown(item.text);row.append(line('●','',body));
 }else if(item.k==='think'||item.k==='sum'){
  const d=el('details',{},el('summary',{},t(item.k==='think'?'sessionThinking':'sessionSummary')));
  d.addEventListener('toggle',()=>{if(d.open&&d.children.length===1)d.append(el('pre',{class:'ss-pre'},item.text));});row.append(line(item.k==='think'?'✻':'⋯','is-dim',d));
 }else if(item.k==='cmd'){
  row.append(line('>','',el('span',{class:'ss-text'},`${item.name}${item.args?' '+item.args:''}`)));
 }else if(item.k==='tool'){ // ● Nome(resumo)  +  ⎿ primeira linha do resultado; clicar abre a entrada e o resultado inteiros
  if(item.skill)row.classList.add('is-skill');if(item.error)row.classList.add('is-error');
  const d=el('details',{},el('summary',{},el('span',{class:'ss-tool-name'},item.name),el('span',{class:'ss-tool-title'},`(${item.title||''})`),item.error?el('span',{class:'ss-tool-err'},t('sessionToolError')):null));
  d.addEventListener('toggle',()=>{
   if(!d.open||d.children.length>1)return;
   if(item.input)d.append(el('pre',{class:'ss-pre'},item.input));
   if(item.result)d.append(el('pre',{class:'ss-pre ss-result'},item.result));
  });
  const out=firstLine(item.result);
  row.append(line('●',item.error?'is-bad':'is-ok',d,out?el('div',{class:'ss-out'},el('span',{'aria-hidden':'true'},'⎿ '),out):null));
 }else if(item.k==='ask'){ // as perguntas como apareceram (caixa do terminal), com a resposta marcada
  row.setAttribute('aria-label',t('sessionAsked'));
  for(const q of item.questions){
   const answer=String(item.answers?.[q.question]??''),picked=new Set(q.multiSelect?answer.split(', '):[answer]);
   const known=q.options.some(o=>picked.has(o.label));
   row.append(el('div',{class:'ss-q'},
    el('div',{class:'ss-q-head'},q.header?el('span',{class:'ss-q-chip'},q.header):null,el('strong',{class:'ss-q-title'},q.question)),
    el('ul',{class:'ss-q-options'},...q.options.map((o,n)=>{const on=picked.has(o.label);return el('li',{class:on?'is-picked':'','aria-label':on?t('sessionPicked',o.label):o.label},el('span',{class:'ss-q-mark','aria-hidden':'true'},on?(q.multiSelect?'[✓]':'❯'):(q.multiSelect?'[ ]':' ')),el('span',{class:'ss-q-num','aria-hidden':'true'},`${n+1}.`),el('span',{},el('b',{},o.label),o.description?el('small',{},o.description):null));})),
    answer&&!known?el('p',{class:'ss-q-answer'},el('span',{},t('sessionAnswer')),answer):!answer?el('p',{class:'ss-q-answer is-none'},t('sessionNoAnswer')):null));
  }
 }else if(item.k==='next'){
  row.setAttribute('aria-label',t('sessionNext'));
  row.append(el('div',{class:'ss-q'},item.recap?el('p',{class:'ss-recap'},item.recap):null,item.ask?el('strong',{class:'ss-q-title'},item.ask):null,
   item.actions.length?el('div',{class:'ss-actions'},...item.actions.map(a=>el('span',{class:'ss-action'},`[ ${a} ]`))):null));
 }else if(item.k==='plan'){
  row.append(line('●','is-dim',el('ul',{class:'ss-plan-list'},...item.items.map(x=>el('li',{class:`is-${x.status}`},el('span',{'aria-hidden':'true'},STATUS[x.status]||'☐'),x.content)))));
 }
 return row;
}
/** desenha a conversa inteira em `host` */
export function renderSession(host,session,t){
 const frag=document.createDocumentFragment();session.items.forEach((item,i)=>frag.append(renderItem(item,i,t)));
 host.replaceChildren(frag);
}
const goTo=(list,index,{flash=true}={})=>{
 const row=list.querySelector(`[data-i="${index}"]`);if(!row)return;
 list.scrollTop=row.offsetTop-list.offsetTop-12;
 if(flash){row.classList.remove('is-flash');void row.offsetWidth;row.classList.add('is-flash');}
};

/** Abre a sessão na janela lateral, já no ponto marcado (anchor = índice do item). */
export function openSessionViewer({session,anchor=0,title,t,onClose}){
 const list=el('div',{class:'ss-list',tabindex:'0','aria-label':t('sessionTranscript')});
 const panel=sidePanel({title:title||session.title||t('session'),t,className:'ss-viewer',labels:{close:t('sessionClose'),resize:t('sessionResize'),resizeHint:t('openApiResizeHint')},onClose});
 const tools=el('button',{type:'button',class:'dw-gear','aria-pressed':'false',onclick:()=>{const open=tools.getAttribute('aria-pressed')!=='true';tools.setAttribute('aria-pressed',String(open));list.querySelectorAll('.ss-tool details').forEach(d=>{d.open=open;});}},t('sessionTools'));
 const think=el('button',{type:'button',class:'dw-gear','aria-pressed':'false',onclick:()=>{const on=think.getAttribute('aria-pressed')!=='true';think.setAttribute('aria-pressed',String(on));list.classList.toggle('show-think',on);}},t('sessionThinkingToggle'));
 const mark=el('button',{type:'button',class:'dw-toggle',onclick:()=>goTo(list,anchor)},t('sessionGoAnchor'));
 const closeBtn=panel.head.querySelector('.oa-close');panel.head.insertBefore(mark,closeBtn);panel.head.insertBefore(tools,closeBtn);panel.head.insertBefore(think,closeBtn);
 const stats=sessionStats(session);
 panel.el.append(el('p',{class:'dw-hint'},t('sessionViewHint',stats.users,stats.tools)),list);
 renderSession(list,session,t);
 list.querySelector(`[data-i="${anchor}"]`)?.classList.add('is-anchor');
 requestAnimationFrame(()=>goTo(list,anchor,{flash:false}));
 return panel;
}

/**
 * Janela de importar: escolhe uma sessão desta máquina (ou um arquivo .jsonl), o trecho a guardar e o ponto de abertura.
 * current = {session, anchor, title} ao trocar o ponto de uma sessão já no card. onPick({session, anchor, title}).
 */
export function openSessionDialog({t,lang,current=null,onPick}){
 let source=current?.session||null,cursor=current?.anchor??-1,anchor=current?.anchor??-1,from=0,to=-1,loadSeq=0;
 const list=el('div',{class:'ss-list ss-pick',tabindex:'0','aria-label':t('sessionTranscript')});
 const status=el('p',{class:'oa-status',role:'status','aria-live':'polite'});
 const info=el('p',{class:'ss-info'});
 const mask=el('input',{type:'checkbox',checked:true}),maskRow=el('label',{class:'ss-mask',hidden:true},mask,el('span',{}));
 const add=el('button',{type:'button',class:'primary',disabled:true},t(current?'sessionReplace':'sessionAdd'));
 const titleInput=el('input',{type:'text',class:'ss-title','aria-label':t('sessionTitle'),placeholder:t('sessionTitle'),value:current?.title||''});
 const search=el('input',{type:'search',class:'ss-search',placeholder:t('sessionSearch'),'aria-label':t('sessionSearch')});
 const found=el('div',{class:'ss-sessions',role:'listbox','aria-label':t('sessionList')});
 const fileInput=el('input',{type:'file',accept:'.jsonl,application/x-ndjson,application/json',hidden:true});
 const btn=(key,fn)=>el('button',{type:'button',disabled:true,onclick:fn},t(key));
 const bAnchor=btn('sessionOpenHere',()=>{anchor=cursor;paint();}),bFrom=btn('sessionFromHere',()=>{from=cursor;if(to<from)to=source.items.length-1;paint();}),bTo=btn('sessionToHere',()=>{to=cursor;if(from>to)from=0;paint();}),bAll=btn('sessionWhole',()=>{from=0;to=source.items.length-1;paint();});
 const close=()=>{document.removeEventListener('keydown',onKey,true);modal.remove();};
 const onKey=e=>{if(e.key==='Escape'&&!e.target.closest?.('#api-panel')){e.stopPropagation();close();}};
 const picked=()=>{const cut=sliceSession(source,from,to);return mask.checked?maskSecrets(cut):cut;};
 const paint=()=>{
  const ready=!!source&&source.items.length>0;
  for(const b of [bAnchor,bFrom,bTo])b.disabled=!ready||cursor<0;bAll.disabled=!ready;
  if(!ready){add.disabled=true;info.textContent='';maskRow.hidden=true;return;}
  if(anchor<from||anchor>to)anchor=source.items.findIndex((i,n)=>n>=from&&n<=to&&i.k==='user');if(anchor<0)anchor=from;
  list.querySelectorAll('.ss-item').forEach(row=>{const i=Number(row.dataset.i);row.classList.toggle('is-out',i<from||i>to);row.classList.toggle('is-anchor',i===anchor);row.classList.toggle('is-cursor',i===cursor);});
  const cut=sliceSession(source,from,to),stats=sessionStats(cut),hits=secretHits(cut);
  info.textContent=t('sessionInfo',stats.items,Math.max(1,Math.round(stats.bytes/1024)),from>0||to<source.items.length-1);
  maskRow.hidden=!hits;if(hits)maskRow.lastChild.textContent=t('sessionSecrets',hits);
  add.disabled=false;
 };
 const show=(session,name)=>{
  source=session;from=0;to=session.items.length-1;cursor=-1;anchor=session.items.findIndex(i=>i.k==='user');
  if(!titleInput.value||titleInput.dataset.auto==='1'){titleInput.value=session.title||name||'';titleInput.dataset.auto='1';}
  renderSession(list,session,t);status.textContent=session.items.length?t('sessionLoaded'):t('sessionEmpty');status.classList.toggle('is-error',!session.items.length);paint();
 };
 titleInput.addEventListener('input',()=>{titleInput.dataset.auto='0';});
 list.addEventListener('click',e=>{const row=e.target.closest('.ss-item');if(!row||e.target.closest('a'))return;cursor=Number(row.dataset.i);paint();}); // nas ferramentas o clique também abre/fecha o detalhe
 list.addEventListener('dblclick',e=>{const row=e.target.closest('.ss-item');if(!row)return;cursor=anchor=Number(row.dataset.i);paint();});
 mask.addEventListener('change',paint);
 const loadRemote=async(s,row)=>{
  const mine=++loadSeq;status.textContent=t('sessionLoading');status.classList.remove('is-error');
  found.querySelectorAll('[aria-selected=true]').forEach(x=>x.setAttribute('aria-selected','false'));row.setAttribute('aria-selected','true');
  try{
   const res=await fetch(`api/sessions/${encodeURIComponent(s.project)}/${encodeURIComponent(s.id)}`,{headers:{'x-context-maps':'1'}});
   if(!res.ok)throw new Error(String(res.status));const session=await res.json();if(mine!==loadSeq)return;
   titleInput.dataset.auto='1';show(session,s.title||s.first);
  }catch{if(mine===loadSeq){status.textContent=t('sessionLoadError');status.classList.add('is-error');}}
 };
 let all=[];
 const paintList=()=>{
  const q=search.value.trim().toLowerCase();
  const rows=all.filter(s=>!q||`${s.title} ${s.first} ${s.cwd}`.toLowerCase().includes(q)).map(s=>{
   const date=s.modified?new Date(s.modified).toLocaleDateString(lang==='pt'?'pt-BR':'en-US',{day:'2-digit',month:'short',year:'numeric'}):'';
   const row=el('button',{type:'button',class:'ss-session',role:'option','aria-selected':'false'},
    el('strong',{},s.title||s.first||s.id),
    el('small',{},[date,s.cwd?s.cwd.split(/[\\/]/).filter(Boolean).pop():'',`${Math.max(1,Math.round(s.size/1024))} KB`].filter(Boolean).join(' · ')),
    s.title&&s.first?el('span',{},s.first):null);
   row.addEventListener('click',()=>loadRemote(s,row));return row;
  });
  found.replaceChildren(...(rows.length?rows:[el('p',{class:'oa-hint'},t(all.length?'sessionNoMatch':'sessionNone'))]));
 };
 search.addEventListener('input',paintList);
 fileInput.addEventListener('change',async()=>{
  const f=fileInput.files[0];fileInput.value='';if(!f)return;
  ++loadSeq;status.textContent=t('sessionLoading');status.classList.remove('is-error');
  try{titleInput.dataset.auto='1';show(parseSession(await f.text()),f.name.replace(/\.jsonl$/i,''));}catch{status.textContent=t('sessionLoadError');status.classList.add('is-error');}
 });
 add.addEventListener('click',()=>{
  if(!source)return;const session=picked();
  close();onPick({session,anchor:Math.max(0,anchor-from),title:titleInput.value.trim()||session.title||t('session')});
 });
 const modal=el('div',{class:'oa-modal ss-modal',role:'dialog','aria-modal':'false','aria-labelledby':'ss-dialog-title'},
  el('div',{class:'oa-card'},
   el('header',{class:'oa-dialog-head'},el('h2',{id:'ss-dialog-title'},t(current?'sessionReplaceTitle':'sessionAddTitle')),el('button',{type:'button','aria-label':t('close'),onclick:close},'×')),
   el('div',{class:'oa-dialog-body'},
    el('div',{class:'oa-inputs'},
     el('p',{class:'oa-hint'},t(current?'sessionIntroCurrent':'sessionIntro')),
     current?null:search,current?null:found,
     current?null:el('div',{class:'oa-row'},el('button',{type:'button',onclick:()=>fileInput.click()},t('sessionFile')),fileInput),
     el('label',{class:'oa-focus-field'},el('span',{},t('sessionTitle')),titleInput),
     status),
    el('div',{class:'ss-preview'},
     el('div',{class:'ss-bar'},bAnchor,bFrom,bTo,bAll,el('span',{class:'ss-bar-hint'},t('sessionPickHint'))),
     list)),
   el('footer',{class:'oa-dialog-foot'},info,maskRow,el('button',{type:'button',onclick:close},t('cancel')),add)));
 document.body.append(modal);document.addEventListener('keydown',onKey,true);
 if(current){renderSession(list,source,t);to=source.items.length-1;paint();requestAnimationFrame(()=>goTo(list,anchor,{flash:false}));titleInput.focus();}
 else{
  search.focus();found.replaceChildren(el('p',{class:'oa-hint'},t('sessionLoading')));
  fetch('api/sessions',{headers:{'x-context-maps':'1'}}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{all=d.sessions||[];paintList();},()=>{found.replaceChildren(el('p',{class:'oa-hint'},t('sessionListError')));});
 }
 return {close};
}
export {itemText};
