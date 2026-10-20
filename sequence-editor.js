/* Editor visual do diagrama de sequência: lista de participantes e passos, canvas com o desenho, inspetor, desfazer/refazer e vista em texto.
   Trabalha sobre o modelo de sequence.js e só devolve o texto (Mermaid-compatível) ao aplicar. */
import {parseSequence,stringifySequence,layoutSequence,renderSequenceSvg} from './sequence.js?v=1';
import * as E from './sequence-edit.js?v=1';

function h(tag,props={},...kids){
 const el=document.createElement(tag);
 for(const [k,v] of Object.entries(props||{})){
  if(v===undefined||v===null||v===false)continue;
  if(k==='class')el.className=v;else if(k.startsWith('on'))el.addEventListener(k.slice(2).toLowerCase(),v);
  else if(k==='value')el.value=v;else if(k==='checked')el.checked=!!v;else el.setAttribute(k,v===true?'':v);
 }
 el.append(...kids.flat().filter(c=>c!==undefined&&c!==null&&c!==false));
 return el;
}
const SVG_NS='http://www.w3.org/2000/svg';
const svgEl=(tag,attrs)=>{const el=document.createElementNS(SVG_NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el;};

export function openSequenceEditor({source,t,measure,onApply,onClose}){
 let model;
 try{model=parseSequence(source);}catch{return false;}
 const initial=JSON.stringify(model),hist=E.createHistory(model);
 let sel=null,view='visual',zoom=1,layout=null,editing=false,textError='';
 const back=document.activeElement;

 /* ---------- estrutura ---------- */
 const status=h('span',{class:'seq-ed-status',role:'status','aria-live':'polite'});
 const undoBtn=h('button',{type:'button',class:'seq-btn',onClick:()=>undo()},t('seqEdUndo'));
 const redoBtn=h('button',{type:'button',class:'seq-btn',onClick:()=>redo()},t('seqEdRedo'));
 const visualTab=h('button',{type:'button',role:'tab',class:'seq-seg is-on','aria-selected':'true',onClick:()=>setView('visual')},t('seqEdVisual'));
 const textTab=h('button',{type:'button',role:'tab',class:'seq-seg','aria-selected':'false',onClick:()=>setView('text')},t('seqEdText'));
 const applyBtn=h('button',{type:'button',class:'seq-btn seq-primary',onClick:()=>apply()},t('seqEdApply'));
 const zoomLabel=h('span',{class:'seq-zoom-label'},'100%');
 const partList=h('ul',{class:'seq-list',role:'list','aria-label':t('seqEdParticipants')});
 const stepList=h('ol',{class:'seq-list seq-steps',role:'list','aria-label':t('seqEdSteps')});
 const host=h('div',{class:'seq-svg-host'});
 const inline=h('input',{type:'text',class:'seq-inline',hidden:true,'aria-label':t('seqEdLabel')});
 const stage=h('div',{class:'seq-stage',tabindex:'0','aria-label':t('seqEdCanvas')},host,inline);
 const textArea=h('textarea',{class:'seq-source',spellcheck:'false','aria-label':t('seqEdText'),hidden:true});
 const textErr=h('p',{class:'seq-text-error',role:'alert'});
 const inspector=h('div',{class:'seq-inspector','aria-label':t('seqEdInspector'),role:'region'});
 const card=h('div',{class:'seq-ed-card'},
  h('header',{class:'seq-ed-top'},h('h2',{id:'seq-ed-title'},t('seqEdTitle')),
   h('div',{class:'seq-seg-group',role:'tablist','aria-label':t('seqEdView')},visualTab,textTab),
   undoBtn,redoBtn,h('span',{class:'seq-spacer'}),status,
   h('button',{type:'button',class:'seq-btn',onClick:()=>cancel()},t('seqEdCancel')),applyBtn),
  h('div',{class:'seq-ed-body'},
   h('aside',{class:'seq-ed-left'},
    h('h3',{},t('seqEdParticipants')),partList,
    h('button',{type:'button',class:'seq-btn seq-wide',onClick:()=>addParticipantUi()},`+ ${t('seqEdAddParticipant')}`),
    h('h3',{},t('seqEdSteps')),stepList,
    h('div',{class:'seq-add-row'},
     h('button',{type:'button',class:'seq-btn',onClick:()=>addStepUi('message')},`+ ${t('seqEdAddMessage')}`),
     h('button',{type:'button',class:'seq-btn',onClick:()=>addStepUi('note')},`+ ${t('seqEdAddNote')}`),
     h('button',{type:'button',class:'seq-btn',onClick:()=>addStepUi('group')},`+ ${t('seqEdAddBlock')}`))),
   h('main',{class:'seq-ed-main'},
    h('div',{class:'seq-zoom'},h('button',{type:'button',class:'seq-btn','aria-label':t('seqEdZoomOut'),onClick:()=>setZoom(zoom-.15)},'−'),zoomLabel,h('button',{type:'button',class:'seq-btn','aria-label':t('seqEdZoomIn'),onClick:()=>setZoom(zoom+.15)},'+'),h('button',{type:'button',class:'seq-btn seq-fit','aria-label':t('seqEdFit'),title:`${t('seqEdFit')} (Ctrl+0)`,onClick:()=>fitZoom()},'⤢')),
    stage,textArea,textErr),
   h('aside',{class:'seq-ed-right'},inspector)));
 const overlay=h('div',{class:'seq-ed',role:'dialog','aria-modal':'true','aria-labelledby':'seq-ed-title'},card);

 /* ---------- ações ---------- */
 const say=text=>{status.textContent='';requestAnimationFrame(()=>{status.textContent=text;});};
 const nameOf=id=>E.nameOf(model,id);
 function commit(message){
  hist.push(model);redraw();if(message)say(message);
 }
 function undo(){const m=hist.undo();if(!m)return;model=m;fixSelection();redraw();say(t('seqEdUndone'));}
 function redo(){const m=hist.redo();if(!m)return;model=m;fixSelection();redraw();say(t('seqEdRedone'));}
 function fixSelection(){
  if(sel?.kind==='step'&&sel.index>=model.steps.length)sel=model.steps.length?{kind:'step',index:model.steps.length-1}:null;
  if(sel?.kind==='participant'&&!model.participants.some(p=>p.id===sel.id))sel=null;
 }
 function refreshSelection(){ // só a seleção mudou: o desenho não é refeito (assim o duplo clique continua no mesmo elemento)
  const svg=host.querySelector('svg');if(svg)drawSelection(svg);renderLists();renderInspector();
 }
 const select=s=>{sel=s;refreshSelection();};
 function addParticipantUi(){
  const after=sel?.kind==='participant'?model.participants.findIndex(p=>p.id===sel.id)+1:model.participants.length;
  const id=E.addParticipant(model,{index:after});sel={kind:'participant',id};
  commit(t('seqEdParticipantAdded',nameOf(id)));inspector.querySelector('input')?.focus();
 }
 function addStepUi(kind){
  const at=sel?.kind==='step'?(model.steps[sel.index].type==='group'?E.matchEnd(model,sel.index)+1:sel.index+1):model.steps.length;
  const last=sel?.kind==='participant'?sel.id:model.participants[0]?.id;
  let i;
  if(kind==='message'){
   const from=sel?.kind==='step'&&model.steps[sel.index].type==='message'?model.steps[sel.index].to:last,idx=model.participants.findIndex(p=>p.id===from),to=model.participants[idx+1]?.id??model.participants[idx-1]?.id??from;
   i=E.addMessage(model,{from,to,at});say(t('seqEdMsgAdded'));
  }else if(kind==='note')i=E.addNote(model,{actors:last?[last]:undefined,at}),say(t('seqEdNoteAdded'));
  else i=E.addGroup(model,{kind:'loop',at}),say(t('seqEdBlockAdded'));
  sel={kind:'step',index:i};hist.push(model);redraw();
  (kind==='group'?inspector.querySelector('select'):inspector.querySelector('input,textarea'))?.focus();
 }
 function removeSel(){
  if(!sel)return;
  if(sel.kind==='participant'){
   const uses=E.participantUse(model,sel.id),n=nameOf(sel.id);
   E.removeParticipant(model,sel.id);sel=null;commit(t('seqEdRemovedParticipant',n,uses));
  }else if(sel.kind==='step'){
   if(model.steps[sel.index].type==='end'){say(t('seqEdEndHint'));return;}
   E.removeStep(model,sel.index);
   sel=model.steps.length?{kind:'step',index:Math.min(sel.index,model.steps.length-1)}:null;
   commit(t('seqEdRemoved'));
  }
 }
 function moveSel(dir){
  if(sel?.kind==='step'){const k=E.moveStep(model,sel.index,dir);if(k>=0){sel={kind:'step',index:k};commit(t('seqEdMoved'));}}
  else if(sel?.kind==='participant'&&E.moveParticipant(model,sel.id,dir)){commit(t('seqEdMoved'));}
 }
 function setZoom(z,anchor){
  const before=zoom,box=stage.getBoundingClientRect(),px=anchor?anchor.x-box.left:stage.clientWidth/2,py=anchor?anchor.y-box.top:stage.clientHeight/2;
  const cx=(stage.scrollLeft+px)/before,cy=(stage.scrollTop+py)/before;
  zoom=Math.max(.2,Math.min(2.4,Math.round(z*100)/100));zoomLabel.textContent=`${Math.round(zoom*100)}%`;applyZoom();
  stage.scrollLeft=cx*zoom-px;stage.scrollTop=cy*zoom-py; // o ponto sob o cursor (ou o centro) fica no lugar
 }
 /** cabe o diagrama inteiro na largura visível (nunca amplia além de 100%) */
 function fitZoom(){if(!layout)return;setZoom(Math.min(1,(stage.clientWidth-32)/layout.width));stage.scrollLeft=0;stage.scrollTop=0;}
 function applyZoom(){const svg=host.querySelector('svg');if(svg&&layout){svg.style.width=`${Math.round(layout.width*zoom)}px`;svg.style.height=`${Math.round(layout.height*zoom)}px`;}}

 /* ---------- vista em texto ---------- */
 function setView(next){
  if(next===view)return;
  if(next==='text'){textArea.value=stringifySequence(model);}
  else{ // voltar ao visual: o texto precisa estar válido
   try{const parsed=parseSequence(textArea.value);if(JSON.stringify(parsed)!==JSON.stringify(model)){model=parsed;fixSelection();hist.push(model);}textErr.textContent='';}
   catch(e){textErr.textContent=t('sequenceError',e.line,t(`seqErr_${e.code}`,e.detail));return;}
  }
  view=next;visualTab.classList.toggle('is-on',view==='visual');textTab.classList.toggle('is-on',view==='text');
  visualTab.setAttribute('aria-selected',String(view==='visual'));textTab.setAttribute('aria-selected',String(view==='text'));
  stage.hidden=view!=='visual';textArea.hidden=view!=='text';card.classList.toggle('is-text',view==='text');
  redraw();(view==='text'?textArea:stage).focus();
 }
 textArea.addEventListener('input',()=>{
  try{parseSequence(textArea.value);textErr.textContent='';}
  catch(e){textErr.textContent=t('sequenceError',e.line,t(`seqErr_${e.code}`,e.detail));}
 });

 /* ---------- desenho ---------- */
 function redraw(){
  layout=layoutSequence(model,{measure});
  host.innerHTML=renderSequenceSvg(layout,{summary:''});
  const svg=host.querySelector('svg');svg.removeAttribute('role');svg.setAttribute('aria-hidden','true');
  // áreas de clique maiores nas mensagens e nas linhas de vida (só no editor)
  const lifelines=svgEl('g',{class:'seq-hits'});
  layout.participants.forEach((p,i)=>lifelines.append(svgEl('rect',{class:'seq-hit',x:p.x-9,y:layout.bodyY-8,width:18,height:Math.max(20,layout.bottom-layout.bodyY+8),'data-hit':i})));
  const firstMsg=svg.querySelector('.seq-bar,.seq-step');(firstMsg||svg.lastChild).before(lifelines);
  for(const it of layout.items){
   if(it.kind!=='message')continue;
   const g=svg.querySelector(`.seq-msg[data-step="${it.step}"]`);if(!g)continue;
   const x=Math.min(it.x1,it.x2),w=it.self?60+Math.max(...it.lines.map(l=>measure(l))):Math.abs(it.x2-it.x1),top=it.y-it.lines.length*16-6;
   g.prepend(svgEl('rect',{class:'seq-msghit',x,y:top,width:w,height:it.lines.length*16+14+(it.self?24:0),fill:'transparent'}));
  }
  drawSelection(svg);applyZoom();
  renderLists();renderInspector();
  undoBtn.disabled=!hist.canUndo;redoBtn.disabled=!hist.canRedo;
 }
 function drawSelection(svg){
  svg.querySelectorAll('.seq-sel').forEach(n=>n.remove());
  if(!sel)return;
  let box=null;
  if(sel.kind==='participant'){const r=svg.querySelector(`.seq-actor[data-actor="${CSS.escape(sel.id)}"] rect`);if(r)box=r.getBBox();}
  else{
   const g=svg.querySelector(`[data-step="${sel.index}"]`);
   if(g){const b=g.getBBox();box={x:b.x,y:b.y,width:b.width,height:b.height};}
   else if(layout.stepY[sel.index]!==undefined)box={x:8,y:layout.stepY[sel.index]-2,width:layout.width-16,height:4};
   if(box&&model.steps[sel.index]?.type==='group'){const g2=svg.querySelector(`.seq-group[data-step="${sel.index}"] > rect`);if(g2){const b=g2.getBBox();box=b;}}
  }
  if(!box)return;
  svg.append(svgEl('rect',{class:'seq-sel',x:box.x-5,y:box.y-5,width:box.width+10,height:box.height+10,rx:5,fill:'none',stroke:'#7fd3ae','stroke-width':1.6,'stroke-dasharray':'5 3','pointer-events':'none'}));
 }
 function renderLists(){
  partList.replaceChildren(...model.participants.map((p,i)=>{
   const on=sel?.kind==='participant'&&sel.id===p.id;
   return h('li',{class:`seq-row${on?' is-sel':''}`},
    h('button',{type:'button',class:'seq-row-main','aria-pressed':String(on),onClick:()=>select({kind:'participant',id:p.id})},h('span',{class:'seq-ico','aria-hidden':'true'},p.kind==='actor'?'☺':'▭'),h('span',{class:'seq-row-text'},p.name)),
    h('button',{type:'button',class:'seq-mini','aria-label':t('seqEdMoveLeft',p.name),disabled:i===0||null,onClick:()=>{sel={kind:'participant',id:p.id};moveSel(-1);}},'←'),
    h('button',{type:'button',class:'seq-mini','aria-label':t('seqEdMoveRight',p.name),disabled:i===model.participants.length-1||null,onClick:()=>{sel={kind:'participant',id:p.id};moveSel(1);}},'→'));
  }));
  stepList.replaceChildren(...model.steps.map((s,k)=>{
   const on=sel?.kind==='step'&&sel.index===k,depth=E.depthOf(model,k);
   return h('li',{class:`seq-row seq-step-row is-${s.type}${on?' is-sel':''}`,style:`--depth:${depth}`},
    h('button',{type:'button',class:'seq-row-main','aria-pressed':String(on),onClick:()=>select({kind:'step',index:k})},h('span',{class:'seq-num','aria-hidden':'true'},String(k+1)),h('span',{class:'seq-row-text'},E.describeStep(model,k))));
  }));
  if(!model.steps.length)stepList.append(h('li',{class:'seq-empty'},t('seqEdNoSteps')));
 }

 /* ---------- inspetor ---------- */
 const field=(label,control)=>h('label',{class:'seq-field'},h('span',{},label),control);
 const select$=(value,options,onChange,label)=>{
  const el=h('select',{'aria-label':label},...options.map(([v,l])=>h('option',{value:v,selected:v===value||null},l)));
  el.addEventListener('change',()=>onChange(el.value));return el;
 };
 const input$=(value,onCommit,{multiline=false,label}={})=>{
  const el=h(multiline?'textarea':'input',multiline?{rows:3,'aria-label':label,spellcheck:'false'}:{type:'text','aria-label':label,spellcheck:'false'});
  el.value=value;
  el.addEventListener('change',()=>onCommit(el.value));
  el.addEventListener('keydown',e=>{if(e.key==='Enter'&&!multiline){e.preventDefault();onCommit(el.value);}});
  return el;
 };
 const actionRow=(...btns)=>h('div',{class:'seq-actions'},...btns);
 function renderInspector(){
  const parts=model.participants.map(p=>[p.id,p.name]);
  const box=[];
  if(!sel){
   box.push(h('h3',{},t('seqEdDiagram')),
    field(t('seqEdTitleField'),input$(model.title,v=>{model.title=v.trim();commit();},{label:t('seqEdTitleField')})),
    h('label',{class:'seq-check'},h('input',{type:'checkbox',checked:model.autonumber,onChange:e=>{model.autonumber=e.target.checked;commit();}}),h('span',{},t('seqEdAutonumber'))),
    h('p',{class:'seq-hint'},t('seqEdHint')));
  }else if(sel.kind==='participant'){
   const p=model.participants.find(x=>x.id===sel.id),uses=E.participantUse(model,p.id);
   box.push(h('h3',{},t('seqEdParticipant')),
    field(t('seqEdName'),input$(p.name,v=>{E.renameParticipant(model,p.id,v);commit();},{label:t('seqEdName')})),
    field(t('seqEdKind'),select$(p.kind,[['participant',t('seqEdKindParticipant')],['actor',t('seqEdKindActor')]],v=>{E.setParticipantKind(model,p.id,v);commit();},t('seqEdKind'))),
    h('p',{class:'seq-hint'},`${t('seqEdId')}: ${p.id} · ${t('seqEdUsedBy',uses)}`),
    actionRow(h('button',{type:'button',class:'seq-btn seq-danger',onClick:()=>removeSel()},t('seqEdDelete'))));
  }else{
   const s=model.steps[sel.index];
   const del=h('button',{type:'button',class:'seq-btn seq-danger',onClick:()=>removeSel()},t('seqEdDelete'));
   const mv=[h('button',{type:'button',class:'seq-btn','aria-label':t('seqEdMoveUp'),onClick:()=>moveSel(-1)},'↑'),h('button',{type:'button',class:'seq-btn','aria-label':t('seqEdMoveDown'),onClick:()=>moveSel(1)},'↓')];
   if(s.type==='message'){
    box.push(h('h3',{},t('seqEdMessage')),
     field(t('seqEdLabel'),input$(s.text,v=>{E.updateStep(model,sel.index,{text:v});commit();},{label:t('seqEdLabel')})),
     field(t('seqEdFrom'),select$(s.from,parts,v=>{E.updateStep(model,sel.index,{from:v});commit();},t('seqEdFrom'))),
     field(t('seqEdTo'),select$(s.to,parts,v=>{E.updateStep(model,sel.index,{to:v});commit();},t('seqEdTo'))),
     field(t('seqEdLine'),select$(s.style,[['solid',t('seqEdLineSolid')],['dashed',t('seqEdLineDashed')]],v=>{E.updateStep(model,sel.index,{style:v});commit();},t('seqEdLine'))),
     field(t('seqEdHead'),select$(s.head,[['arrow',t('seqEdHeadArrow')],['open',t('seqEdHeadOpen')],['cross',t('seqEdHeadCross')],['async',t('seqEdHeadAsync')]],v=>{E.updateStep(model,sel.index,{head:v});commit();},t('seqEdHead'))),
     field(t('seqEdActivation'),select$(s.activate||'',[['',t('seqEdActNone')],['+',t('seqEdActOn')],['-',t('seqEdActOff')]],v=>{E.updateStep(model,sel.index,{activate:v});commit();},t('seqEdActivation'))),
     actionRow(...mv,del));
   }else if(s.type==='note'){
    box.push(h('h3',{},t('seqEdNote')),
     field(t('seqEdNoteText'),input$(s.text,v=>{E.updateStep(model,sel.index,{text:v});commit();},{multiline:true,label:t('seqEdNoteText')})),
     field(t('seqEdPosition'),select$(s.position,[['left',t('seqEdPosLeft')],['right',t('seqEdPosRight')],['over',t('seqEdPosOver')]],v=>{E.updateStep(model,sel.index,{position:v});commit();},t('seqEdPosition'))),
     field(t('seqEdParticipant'),select$(s.actors[0],parts,v=>{E.updateStep(model,sel.index,{actors:[v,...s.actors.slice(1)].slice(0,s.position==='over'?2:1)});commit();},t('seqEdParticipant'))),
     s.position==='over'?field(t('seqEdParticipant2'),select$(s.actors[1]||'',[['',t('seqEdNone')],...parts],v=>{E.updateStep(model,sel.index,{actors:v?[s.actors[0],v]:[s.actors[0]]});commit();},t('seqEdParticipant2'))):null,
     actionRow(...mv,del));
   }else if(s.type==='group'){
    box.push(h('h3',{},t('seqEdBlock')),
     field(t('seqEdBlockKind'),select$(s.kind,['loop','alt','opt','par','critical','break'].map(k=>[k,k]),v=>{E.updateStep(model,sel.index,{kind:v});commit();},t('seqEdBlockKind'))),
     field(t('seqEdBlockLabel'),input$(s.label,v=>{E.updateStep(model,sel.index,{label:v});commit();},{label:t('seqEdBlockLabel')})),
     actionRow(h('button',{type:'button',class:'seq-btn',onClick:()=>{const e=E.addElse(model,sel.index);if(e>=0){sel={kind:'step',index:e};commit(t('seqEdBranchAdded'));}}},t('seqEdAddElse')),...mv,del));
   }else if(s.type==='else'){
    box.push(h('h3',{},t('seqEdBranch')),field(t('seqEdBlockLabel'),input$(s.label,v=>{E.updateStep(model,sel.index,{label:v});commit();},{label:t('seqEdBlockLabel')})),actionRow(del));
   }else if(s.type==='end'){
    const g=E.groupOf(model,sel.index);
    box.push(h('h3',{},t('seqEdBlockEnd')),h('p',{class:'seq-hint'},t('seqEdEndHint')),g>=0?actionRow(h('button',{type:'button',class:'seq-btn',onClick:()=>select({kind:'step',index:g})},t('seqEdSelectBlock'))):null);
   }else{
    box.push(h('h3',{},s.type),actionRow(del));
   }
  }
  inspector.replaceChildren(...box.filter(Boolean));
 }

 /* ---------- interação com o desenho ---------- */
 const svgPoint=(svg,e)=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
 host.addEventListener('click',e=>{
  if(drag)return;
  if(panned){panned=false;return;}
  const g=e.target.closest?.('[data-step]');
  if(g&&!g.closest('.seq-hits')){const k=Number(g.dataset.step);select({kind:'step',index:k});stage.focus({preventScroll:true});return;}
  const a=e.target.closest?.('.seq-actor');
  if(a){select({kind:'participant',id:a.dataset.actor});stage.focus({preventScroll:true});return;}
  if(e.target.closest?.('.seq-hit')||e.target.closest?.('svg')){select(null);stage.focus({preventScroll:true});}
 });
 host.addEventListener('dblclick',e=>{
  const g=e.target.closest?.('.seq-msg[data-step]');
  if(g){editLabel(Number(g.dataset.step));return;}
  const a=e.target.closest?.('.seq-actor');if(a){select({kind:'participant',id:a.dataset.actor});inspector.querySelector('input')?.select();}
 });
 function editLabel(k){
  const s=model.steps[k];if(s?.type!=='message'&&s?.type!=='note')return;
  sel={kind:'step',index:k};refreshSelection();
  const g=host.querySelector(`[data-step="${k}"]`),label=g?.querySelector('text');if(!label)return;
  const r=label.getBoundingClientRect(),hr=stage.getBoundingClientRect();
  Object.assign(inline.style,{left:`${r.left-hr.left+stage.scrollLeft-10}px`,top:`${r.top-hr.top+stage.scrollTop-6}px`,width:`${Math.max(160,r.width+40)}px`});
  inline.hidden=false;inline.value=s.text;editing=true;inline.focus();inline.select();
  const finish=save=>{
   if(!editing)return;editing=false;inline.hidden=true;inline.onblur=null;
   if(save&&inline.value!==s.text){E.updateStep(model,k,{text:inline.value});commit();}
   stage.focus({preventScroll:true});
  };
  inline.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();ev.stopPropagation();finish(true);}else if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();finish(false);}};
  inline.onblur=()=>finish(true);
 }
 // Ctrl+roda dá zoom no cursor; arrastar o fundo (ou o botão do meio) rola o desenho
 stage.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();setZoom(zoom*(e.deltaY<0?1.1:1/1.1),{x:e.clientX,y:e.clientY});},{passive:false});
 let pan=null,panned=false;
 stage.addEventListener('pointerdown',e=>{
  const empty=!e.target.closest?.('[data-step],.seq-actor,.seq-hit,.seq-hits,input,textarea');
  if(!(e.button===1||(e.button===0&&empty))||editing)return;
  pan={x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop,moved:false,id:e.pointerId};
 });
 stage.addEventListener('pointermove',e=>{
  if(!pan)return;
  const dx=e.clientX-pan.x,dy=e.clientY-pan.y;
  if(!pan.moved&&Math.hypot(dx,dy)<5)return;
  if(!pan.moved){pan.moved=true;stage.setPointerCapture?.(pan.id);stage.classList.add('is-panning');}
  stage.scrollLeft=pan.left-dx;stage.scrollTop=pan.top-dy;
 });
 const endPan=()=>{if(!pan)return;panned=pan.moved;pan=null;stage.classList.remove('is-panning');if(panned)setTimeout(()=>{panned=false;},0);};
 stage.addEventListener('pointerup',endPan);stage.addEventListener('pointercancel',endPan);

 // arrastar de uma linha de vida até outra cria uma mensagem na altura onde se soltou
 let drag=null;
 host.addEventListener('pointerdown',e=>{
  const hit=e.target.closest?.('.seq-hit');if(!hit||e.button!==0)return;
  const svg=host.querySelector('svg'),from=Number(hit.dataset.hit),start=svgPoint(svg,e);
  e.preventDefault();
  const line=svgEl('line',{class:'seq-drag',x1:layout.participants[from].x,y1:start.y,x2:layout.participants[from].x,y2:start.y,stroke:'#7fd3ae','stroke-width':2,'stroke-dasharray':'5 3','pointer-events':'none'});
  svg.append(line);drag={from,line,svg,moved:false,y:start.y};
  host.setPointerCapture?.(e.pointerId);
 });
 host.addEventListener('pointermove',e=>{
  if(!drag)return;const p=svgPoint(drag.svg,e);
  if(Math.abs(p.x-layout.participants[drag.from].x)>12)drag.moved=true;
  drag.line.setAttribute('x2',p.x);drag.line.setAttribute('y2',drag.y);
 });
 const finishDrag=e=>{
  if(!drag)return;const d=drag;drag=null;d.line.remove();host.releasePointerCapture?.(e.pointerId);
  if(!d.moved)return;
  const p=svgPoint(d.svg,e);let to=-1,best=60;
  layout.participants.forEach((q,i)=>{const dist=Math.abs(q.x-p.x);if(dist<best){best=dist;to=i;}});
  if(to<0||to===d.from)return;
  let at=model.steps.length;for(let k=0;k<layout.stepY.length;k++)if(layout.stepY[k]>d.y){at=k;break;}
  const i=E.addMessage(model,{from:model.participants[d.from].id,to:model.participants[to].id,at});
  sel={kind:'step',index:i};hist.push(model);redraw();say(t('seqEdMsgAdded'));
  setTimeout(()=>editLabel(i),0);
 };
 host.addEventListener('pointerup',finishDrag);host.addEventListener('pointercancel',finishDrag);

 /* ---------- teclado ---------- */
 stage.addEventListener('keydown',e=>{
  if(editing)return;
  const mod=e.ctrlKey||e.metaKey;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();
   if(e.altKey){moveSel(e.key==='ArrowDown'?1:-1);return;}
   const cur=sel?.kind==='step'?sel.index:-1,next=Math.max(0,Math.min(model.steps.length-1,cur+(e.key==='ArrowDown'?1:-1)));
   if(model.steps.length)select({kind:'step',index:cur<0&&e.key==='ArrowUp'?model.steps.length-1:next});
  }else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
   if(e.altKey&&sel?.kind==='participant'){e.preventDefault();moveSel(e.key==='ArrowRight'?1:-1);return;}
   if(sel?.kind==='participant'){e.preventDefault();const i=model.participants.findIndex(p=>p.id===sel.id),n=model.participants[i+(e.key==='ArrowRight'?1:-1)];if(n)select({kind:'participant',id:n.id});}
  }else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSel();}
  else if(e.key==='Enter'){e.preventDefault();if(sel?.kind==='step'&&['message','note'].includes(model.steps[sel.index]?.type))editLabel(sel.index);else inspector.querySelector('input,select,textarea')?.focus();}
  else if(e.key==='Escape'&&sel){e.stopPropagation();e.preventDefault();select(null);}
  else if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();}
 });
 const tag=el=>el?.tagName;
 const onKey=e=>{
  if(!overlay.isConnected)return;
  const mod=e.ctrlKey||e.metaKey,typing=['INPUT','TEXTAREA'].includes(tag(document.activeElement));
  if(e.key==='Escape'){
   if(editing)return; // o campo do rótulo cuida do próprio Esc
   if(sel&&document.activeElement===stage)return; // no canvas o Esc limpa a seleção
   e.preventDefault();e.stopPropagation();cancel();return;
  }
  if(e.key==='Tab'){
   e.stopPropagation(); // o foco preso do app é só da janela de diagrama
   const items=[...overlay.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&!x.hidden&&x.offsetParent!==null);
   if(!items.length)return;const first=items[0],last=items.at(-1);
   if(!overlay.contains(document.activeElement)){e.preventDefault();first.focus();}
   else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   return;
  }
  if(mod&&e.key==='0'){e.preventDefault();e.stopPropagation();fitZoom();return;}
  if(mod&&(e.key==='='||e.key==='+')){e.preventDefault();e.stopPropagation();setZoom(zoom+.15);return;}
  if(mod&&e.key==='-'){e.preventDefault();e.stopPropagation();setZoom(zoom-.15);return;}
  if(mod&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();e.stopPropagation();e.shiftKey?redo():undo();return;}
  if(mod&&e.key.toLowerCase()==='y'&&!typing){e.preventDefault();e.stopPropagation();redo();return;}
  if(mod&&(e.key.toLowerCase()==='s'||e.key==='Enter')){e.preventDefault();e.stopPropagation();apply();}
 };

 /* ---------- fechar ---------- */
 const dirty=()=>view==='text'?textArea.value!==stringifySequence(JSON.parse(initial)):JSON.stringify(model)!==initial;
 function close(){
  document.removeEventListener('keydown',onKey,true);overlay.remove();
  if(back?.isConnected)back.focus({preventScroll:true});onClose?.();
 }
 function cancel(){
  if(dirty()&&!window.confirm(t('seqEdDiscard')))return;
  close();
 }
 function apply(){
  if(view==='text'){
   try{model=parseSequence(textArea.value);}catch(e){textErr.textContent=t('sequenceError',e.line,t(`seqErr_${e.code}`,e.detail));return;}
  }
  const text=stringifySequence(model);close();onApply(text);
 }

 document.addEventListener('keydown',onKey,true);
 document.body.append(overlay);
 redraw();stage.focus();
 requestAnimationFrame(()=>{if(layout&&layout.width>stage.clientWidth-32)fitZoom();});
 return true;
}
