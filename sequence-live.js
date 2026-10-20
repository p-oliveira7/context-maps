/* Janela flutuante de fluxo ao vivo: mostra um diagrama de sequência com passos ligados a requests e pinta as setas
   conforme as respostas do API client (rodar tudo, passo a passo, ou enviando pelo próprio painel). Funciona fora do editor. */
import {parseSequence,layoutSequence,renderSequenceSvg} from './sequence.js?v=2';
import {evaluateOutcome,tracePath} from './sequence-flow.js?v=2';

const SVG_NS='http://www.w3.org/2000/svg';
const svgEl=(tag,attrs)=>{const el=document.createElementNS(SVG_NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el;};
function h(tag,props={},...kids){
 const el=document.createElement(tag);
 for(const [k,v] of Object.entries(props||{})){
  if(v===undefined||v===null||v===false)continue;
  if(k==='class')el.className=v;else if(k.startsWith('on'))el.addEventListener(k.slice(2).toLowerCase(),v);
  else if(k==='checked')el.checked=!!v;else el.setAttribute(k,v===true?'':v);
 }
 el.append(...kids.flat().filter(c=>c!==undefined&&c!==null&&c!==false));
 return el;
}

export const liveText=(v,t)=>v.error?`${t('seqLiveError')}: ${v.error}`:`${v.status} · ${v.timeMs} ms${v.mock?` · MOCK ${v.mock}`:''}`;

/** pinta o diagrama já desenhado em `svg`: o caminho que o resultado percorre (verde, desfecho com erro em vermelho, ramos não tomados apagados)
 e, nos passos ligados, a pílula com status e tempo. live: id do passo -> resultado; running: id em execução; pulse: ids recém-atualizados */
export function paintLiveSvg(svg,layout,live,{model,running='',pulse=new Set(),t}){
 svg.querySelectorAll('.seq-live-tag').forEach(n=>n.remove());
 const {state}=tracePath(model,live);
 svg.querySelectorAll('[data-step]').forEach(el=>{
  el.classList.remove('is-path-ok','is-path-fail','is-path-skip','is-live-pulse','is-live-run');
  const v=state[Number(el.dataset.step)];if(v)el.classList.add(`is-path-${v}`);
 });
 svg.querySelectorAll('.seq-trace-life').forEach(n=>n.remove());
 svg.querySelectorAll('.seq-actor').forEach(n=>n.classList.remove('is-path-ok'));
 // as linhas de vida (pontilhadas) e as caixas dos participantes por onde o caminho passa
 const span=new Map();
 for(const it of layout.items){
  if(it.kind!=='message'||!['ok','fail'].includes(state[it.step]))continue;
  for(const p of new Set([it.from,it.to])){const r=span.get(p)||{y1:Infinity,y2:-Infinity};r.y1=Math.min(r.y1,it.y);r.y2=Math.max(r.y2,it.self?it.y2:it.y);span.set(p,r);}
 }
 const firstStep=svg.querySelector('.seq-bar,.seq-step');
 for(const [p,r] of span){
  const part=layout.participants[p],life=svgEl('line',{class:'seq-trace-life',x1:part.x,x2:part.x,y1:layout.bodyY,y2:r.y2+14});
  (firstStep||svg.lastChild).before(life);
  svg.querySelector(`.seq-actor[data-actor="${CSS.escape(part.id)}"]`)?.classList.add('is-path-ok');
 }
 for(const it of layout.items){
  if(it.kind!=='message'||!it.sid)continue;
  const g=svg.querySelector(`.seq-msg[data-step="${it.step}"]`),v=live.get(it.sid);if(!g)continue;
  if(running===it.sid)g.classList.add('is-live-run');
  if(!v)continue;
  if(pulse.has(it.sid))g.classList.add('is-live-pulse');
  const label=liveText(v,t),w=Math.round(label.length*6.1+12),cx=it.self?it.x2+8+w/2:(it.x1+it.x2)/2,cy=it.self?it.y+11:it.y;
  const pill=svgEl('g',{class:`seq-live-tag is-${v.outcome}`});
  pill.append(svgEl('rect',{x:cx-w/2,y:cy-8,width:w,height:16,rx:8}),svgEl('text',{x:cx,y:cy+3.5,'text-anchor':'middle'}));
  pill.lastChild.textContent=label;g.append(pill);
 }
}

let current=null;
/** abre (ou troca) a janela de fluxo ao vivo; api = {toggle,run,onResult}; devolve false se o diagrama não for de sequência */
export function openLiveFlow({source,title,t,measure,api,onClose}){
 let model;try{model=parseSequence(source);}catch{return false;}
 current?.close();
 const live=new Map(),pulse=new Set();let cursor=0,runCtl=null,layout=null,unsubscribe=null,observer=null;
 const boundIdx=()=>model.steps.map((s,i)=>s.bind&&s.id?i:-1).filter(i=>i>=0);
 const host=h('div',{class:'seq-live-host'}),status=h('span',{class:'seq-live-status',role:'status','aria-live':'polite'});
 const apiBtn=h('button',{type:'button',class:'seq-btn seq-api-toggle','aria-pressed':'false',title:t('seqLiveApiTitle'),onClick:()=>{api.toggle(!document.body.classList.contains('api-open'));sync();}},t('seqLiveApi'));
 const playBtn=h('button',{type:'button',class:'seq-btn seq-play',onClick:()=>{api.toggle(true);runFrom(Infinity);}},`▶ ${t('seqLivePlay')}`);
 const stopBtn=h('button',{type:'button',class:'seq-btn seq-danger',hidden:true,onClick:()=>runCtl?.abort()},`■ ${t('seqLiveStop')}`);
 const stepBtn=h('button',{type:'button',class:'seq-btn',onClick:()=>{api.toggle(true);runFrom(1);}},`⏭ ${t('seqLiveStep')}`);
 const resetBtn=h('button',{type:'button',class:'seq-btn',onClick:()=>reset()},t('seqLiveResetBtn'));
 const stopOnFail=h('input',{type:'checkbox',checked:true,'aria-label':t('seqLiveStopOnFail')});
 const info=h('span',{class:'seq-flow-info',role:'status'});
 const closeBtn=h('button',{type:'button',class:'seq-btn seq-live-close','aria-label':t('seqLiveClose'),title:t('seqLiveClose'),onClick:()=>close()},'×');
 const head=h('div',{class:'seq-live-head'},h('strong',{id:'seq-live-title'},title||t('seqLiveGroup')),h('span',{class:'seq-spacer'}),closeBtn);
 const bar=h('div',{class:'seq-flow',role:'group','aria-label':t('seqLiveGroup')},apiBtn,playBtn,stopBtn,stepBtn,resetBtn,h('label',{class:'seq-flow-chk'},stopOnFail,h('span',{},t('seqLiveStopOnFail'))),info);
 const win=h('div',{class:'seq-live-win',role:'dialog','aria-labelledby':'seq-live-title'},head,bar,host,h('div',{class:'seq-live-foot'},status));

 function draw(){
  layout=layoutSequence(model,{measure});
  host.innerHTML=renderSequenceSvg(layout,{summary:''});
  const svg=host.querySelector('svg');svg.removeAttribute('role');svg.setAttribute('aria-hidden','true');
  paint();
 }
 function paint(){
  const svg=host.querySelector('svg');if(svg&&layout)paintLiveSvg(svg,layout,live,{model,running:runCtl?.current||'',pulse,t});
  sync();
 }
 function sync(){
  const n=boundIdx().length,running=!!runCtl;
  playBtn.hidden=running;stopBtn.hidden=!running;playBtn.disabled=!n;stepBtn.disabled=!n||running;resetBtn.disabled=running||!(live.size||cursor);
  info.textContent=n?t('seqLiveCount',Math.min(cursor,n),n):t('seqLiveNoBound');
  apiBtn.setAttribute('aria-pressed',String(document.body.classList.contains('api-open')));
 }
 const say=text=>{status.textContent='';requestAnimationFrame(()=>{status.textContent=text;});};
 function onResult(r){
  let hit=false;
  for(const s of model.steps){
   if(!s.bind||!s.id||s.bind.collection!==r.collection||s.bind.request!==r.path)continue;
   hit=true;live.set(s.id,{outcome:evaluateOutcome(s.bind,r),status:r.status,error:r.error,timeMs:r.timeMs,mock:r.mock});pulse.add(s.id);
   setTimeout(()=>{pulse.delete(s.id);if(win.isConnected)paint();},900);
  }
  if(hit)paint();
 }
 const sleep=(ms,signal)=>new Promise(res=>{const id=setTimeout(res,ms);signal?.addEventListener('abort',()=>{clearTimeout(id);res();},{once:true});});
 async function runFrom(count){
  if(runCtl)return;
  const todo=boundIdx();if(cursor>=todo.length)cursor=0;
  runCtl=new AbortController();paint();
  try{
   for(let n=0;n<count&&cursor<todo.length&&!runCtl.signal.aborted;n++,cursor++){
    const s=model.steps[todo[cursor]];runCtl.current=s.id;paint();
    const r=await api.run({collection:s.bind.collection,path:s.bind.request,signal:runCtl.signal});
    if(runCtl.signal.aborted)break;
    if(!r.status&&!r.error)break;
    if(stopOnFail.checked&&live.get(s.id)?.outcome==='fail'){cursor++;say(t('seqLiveStopped',s.text||s.bind.request));break;}
    if(count>1)await sleep(550,runCtl.signal);
   }
  }finally{runCtl=null;paint();}
 }
 function reset(){runCtl?.abort();live.clear();pulse.clear();cursor=0;paint();say(t('seqLiveReset'));}
 function close(){
  runCtl?.abort();unsubscribe?.();observer?.disconnect();document.removeEventListener('keydown',onKey,true);win.remove();
  if(current===api0)current=null;onClose?.();
 }
 const onKey=e=>{if(e.key==='Escape'&&win.contains(document.activeElement)){e.stopPropagation();close();}};

 // arrastar pelo cabeçalho
 head.addEventListener('pointerdown',e=>{
  if(e.target.closest('button'))return;
  const r=win.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
  win.style.left=`${r.left}px`;win.style.top=`${r.top}px`;win.style.right='auto';win.style.bottom='auto';
  const move=ev=>{win.style.left=`${Math.max(0,Math.min(innerWidth-120,ev.clientX-dx))}px`;win.style.top=`${Math.max(0,Math.min(innerHeight-60,ev.clientY-dy))}px`;};
  const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);};
  addEventListener('pointermove',move);addEventListener('pointerup',up);
 });

 const api0={close};current=api0;
 unsubscribe=api.onResult(onResult);
 observer=new MutationObserver(()=>sync());observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('keydown',onKey,true);
 document.body.append(win);draw();playBtn.focus();
 return true;
}
