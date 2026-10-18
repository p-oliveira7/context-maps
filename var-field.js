/* Campos com {{variáveis}} destacadas (como no Postman): vermelho quando a variável não tem valor, verde quando tem.
   Passar o mouse (ou Ctrl+. com o cursor dentro da variável) abre um painel que mostra o valor e deixa editá-lo.
   O campo continua sendo um <input>/<textarea> comum: uma camada "espelho" atrás do texto pinta as variáveis. */
const TOKEN=/\{\{\s*([\w$.-]+)\s*\}\}/g;

export function createVarFields({info,save,scopes,t}){
 const registry=new Set();
 let pop=null,showTimer=0,hideTimer=0,current=null;

 const statusOf=name=>{const i=info(name);return {...i,defined:i.scope==='dynamic'||(i.scope!=='none'&&String(i.value??'')!=='')};};

 function tokensOf(value){
  const out=[];let last=0,m;TOKEN.lastIndex=0;
  while((m=TOKEN.exec(value))){
   if(m.index>last)out.push({text:value.slice(last,m.index)});
   out.push({text:m[0],name:m[1],start:m.index,end:m.index+m[0].length});last=m.index+m[0].length;
  }
  if(last<value.length)out.push({text:value.slice(last)});
  return out;
 }

 function closePopover(){clearTimeout(showTimer);clearTimeout(hideTimer);if(pop){pop.remove();pop=null;current=null;document.removeEventListener('keydown',onKey,true);document.removeEventListener('pointerdown',onDown,true);}}
 const onKey=e=>{if(e.key==='Escape'&&pop){e.preventDefault();e.stopPropagation();const back=current?.entry?.input;closePopover();back?.focus({preventScroll:true});}};
 const onDown=e=>{if(pop&&!pop.contains(e.target)&&!e.target.closest?.('.api-var'))closePopover();};
 const scheduleHide=()=>{clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(pop&&!pop.contains(document.activeElement))closePopover();},320);};

 function openPopover(name,rect,entry,{focus=false}={}){
  clearTimeout(showTimer);clearTimeout(hideTimer);
  if(pop&&current?.name===name&&current.entry===entry)return;
  closePopover();
  const st=statusOf(name),options=scopes(name),dynamic=st.scope==='dynamic';
  let scope=options.some(o=>o.id===st.scope)?st.scope:options[0].id,revealed=!st.secret;
  const node=document.createElement('div');node.className='api-var-pop';node.setAttribute('role','dialog');node.setAttribute('aria-label',`{{${name}}}`);
  const head=document.createElement('div');head.className='api-var-pop-head';
  const code=document.createElement('code');code.textContent=`{{${name}}}`;
  const badge=document.createElement('span');badge.className=`api-var-badge ${st.defined?'is-defined':'is-undefined'}`;
  badge.textContent=dynamic?t('apiScopeDynamic'):st.defined?t(`apiScope_${st.scope}`):t('apiVarNoValue');
  head.append(code,badge);node.append(head);
  if(dynamic){
   const p=document.createElement('p');p.className='api-var-note';p.textContent=`${t('apiVarDynamic')} ${String(st.value)}`;node.append(p);
  }else{
   const label=document.createElement('label');label.className='api-var-row';
   const span=document.createElement('span');span.textContent=t('apiValue');
   const input=document.createElement('input');input.type=st.secret?'password':'text';input.value=st.value??'';input.spellcheck=false;input.setAttribute('aria-label',t('apiValue'));
   label.append(span,input);node.append(label);
   if(st.secret){
    const reveal=document.createElement('button');reveal.type='button';reveal.className='api-btn';reveal.textContent=t('apiVarShow');
    reveal.onclick=()=>{revealed=!revealed;input.type=revealed?'text':'password';reveal.textContent=revealed?t('apiVarHide'):t('apiVarShow');};
    label.append(reveal);
   }
   const where=document.createElement('label');where.className='api-var-row';
   const wspan=document.createElement('span');wspan.textContent=t('apiVarSaveIn');
   const select=document.createElement('select');select.setAttribute('aria-label',t('apiVarSaveIn'));
   for(const o of options){const opt=document.createElement('option');opt.value=o.id;opt.textContent=o.label;opt.selected=o.id===scope;select.append(opt);}
   select.onchange=()=>{scope=select.value;};where.append(wspan,select);node.append(where);
   const error=document.createElement('div');error.className='api-var-error';error.setAttribute('role','alert');node.append(error);
   const actions=document.createElement('div');actions.className='api-var-actions';
   const cancel=document.createElement('button');cancel.type='button';cancel.className='api-btn';cancel.textContent=t('cancel');cancel.onclick=()=>closePopover();
   const ok=document.createElement('button');ok.type='button';ok.className='api-btn primary';ok.textContent=t('save');
   const commit=async()=>{
    ok.disabled=true;error.textContent='';
    try{await save(name,input.value,{scope,secret:!!st.secret});closePopover();refresh();}
    catch(e){error.textContent=e.message||t('saveError');ok.disabled=false;}
   };
   ok.onclick=commit;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}});
   actions.append(cancel,ok);node.append(actions);
   node.addEventListener('focusin',()=>clearTimeout(hideTimer));
   if(focus)setTimeout(()=>{input.focus();input.select();},0);
  }
  node.addEventListener('mouseenter',()=>clearTimeout(hideTimer));node.addEventListener('mouseleave',scheduleHide);
  document.body.append(node);
  const width=node.offsetWidth,left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),below=rect.bottom+6,top=below+node.offsetHeight>window.innerHeight-8?Math.max(8,rect.top-node.offsetHeight-6):below;
  node.style.left=`${left}px`;node.style.top=`${top}px`;
  pop=node;current={name,entry};
  document.addEventListener('keydown',onKey,true);document.addEventListener('pointerdown',onDown,true);
 }

 function varField(input){
  const multiline=input.tagName==='TEXTAREA';
  const wrap=document.createElement('div');wrap.className=`api-var-field${multiline?' is-multiline':''}`;
  const mirror=document.createElement('div');mirror.className='api-var-mirror';mirror.setAttribute('aria-hidden','true');
  input.classList.add('api-var-input');
  wrap.append(mirror,input);
  const entry={wrap,input,mirror};
  const sync=()=>{mirror.scrollLeft=input.scrollLeft;mirror.scrollTop=input.scrollTop;};
  entry.paint=()=>{
   const nodes=tokensOf(input.value).map(tok=>{
    if(!tok.name)return document.createTextNode(tok.text);
    const s=statusOf(tok.name),span=document.createElement('span');
    span.className=`api-var ${s.scope==='dynamic'?'is-dynamic':s.defined?'is-defined':'is-undefined'}`;span.dataset.name=tok.name;span.dataset.start=String(tok.start);span.dataset.end=String(tok.end);span.textContent=tok.text;return span;
   });
   if(multiline&&input.value.endsWith('\n'))nodes.push(document.createTextNode(' ')); // a última linha vazia também ocupa altura
   mirror.replaceChildren(...nodes);sync();
  };
  for(const ev of ['input','keyup','mouseup','focus','scroll','select'])input.addEventListener(ev,()=>{if(ev==='input')entry.paint();else sync();});
  // passar o mouse sobre uma variável abre o painel (com uma pequena espera); sair fecha
  wrap.addEventListener('mousemove',e=>{
   const hit=[...mirror.querySelectorAll('.api-var')].find(span=>[...span.getClientRects()].some(r=>e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom));
   wrap.classList.toggle('is-over-var',!!hit);
   if(!hit){clearTimeout(showTimer);if(pop&&current?.entry===entry)scheduleHide();return;}
   clearTimeout(hideTimer);
   if(current?.name===hit.dataset.name&&current.entry===entry)return;
   clearTimeout(showTimer);showTimer=setTimeout(()=>openPopover(hit.dataset.name,hit.getBoundingClientRect(),entry),220);
  });
  wrap.addEventListener('mouseleave',()=>{clearTimeout(showTimer);wrap.classList.remove('is-over-var');if(pop&&current?.entry===entry)scheduleHide();});
  // teclado: Ctrl+. com o cursor dentro de uma variável
  input.addEventListener('keydown',e=>{
   if(!((e.ctrlKey||e.metaKey)&&e.key==='.'))return;
   const at=input.selectionStart??0,span=[...mirror.querySelectorAll('.api-var')].find(s=>Number(s.dataset.start)<=at&&at<=Number(s.dataset.end));
   if(!span)return;
   e.preventDefault();openPopover(span.dataset.name,span.getBoundingClientRect(),entry,{focus:true});
  });
  registry.add(entry);entry.paint();
  return wrap;
 }
 function refresh(){for(const e of [...registry]){if(!e.wrap.isConnected){registry.delete(e);continue;}e.paint();}}
 return {varField,refresh,closePopover};
}
