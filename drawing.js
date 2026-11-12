// Desenhos livres nos cards (Excalidraw carregado sob demanda) e destaque do caminho até um quadro clicado.
import {sidePanel} from './openapi.js?v=7';

const BASE='vendor/excalidraw/';
let libReady=null;
const script=src=>new Promise((ok,fail)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>fail(new Error(src));document.head.append(s);});
/** React + ReactDOM + Excalidraw (builds UMD em vendor/), uma vez só */
export function loadExcalidraw(){
 if(libReady)return libReady;
 window.EXCALIDRAW_ASSET_PATH=new URL(BASE,location.href).href; // fontes e traduções saem da pasta local (nada de CDN)
 libReady=(async()=>{
  if(!window.React)await script(`${BASE}react.production.min.js`);
  if(!window.ReactDOM)await script(`${BASE}react-dom.production.min.js`);
  if(!window.ExcalidrawLib)await script(`${BASE}excalidraw.production.min.js`);
  if(!window.ExcalidrawLib?.Excalidraw)throw new Error('Excalidraw');
  return window.ExcalidrawLib;
 })().catch(e=>{libReady=null;throw e;});
 return libReady;
}

/* ---------- caminho até um quadro (puro: recebe os elementos da cena) ---------- */
const SHAPES=new Set(['rectangle','diamond','ellipse','text','image','frame']);
const live=els=>els.filter(e=>!e.isDeleted);
/** o quadro sob o ponto (coordenadas da cena); texto dentro de um quadro conta como o quadro */
export function shapeAt(elements,x,y){
 const els=live(elements),byId=new Map(els.map(e=>[e.id,e]));
 for(let i=els.length-1;i>=0;i--){
  const e=els[i];if(!SHAPES.has(e.type))continue;
  const x0=Math.min(e.x,e.x+e.width),y0=Math.min(e.y,e.y+e.height);
  if(x>=x0&&x<=x0+Math.abs(e.width)&&y>=y0&&y<=y0+Math.abs(e.height))return e.containerId&&byId.get(e.containerId)?.type!=='arrow'?byId.get(e.containerId)||e:e;
 }
 return null;
}
/** tudo o que leva até `targetId` seguindo as setas presas aos quadros: {nodes, arrows, order} — order = distância do início */
export function pathTo(elements,targetId){
 const els=live(elements);
 const arrows=els.filter(e=>e.type==='arrow'&&e.startBinding?.elementId&&e.endBinding?.elementId);
 const into=new Map();for(const a of arrows){const k=a.endBinding.elementId;if(!into.has(k))into.set(k,[]);into.get(k).push(a);}
 const nodes=new Set([targetId]),queue=[targetId];
 while(queue.length){const n=queue.shift();for(const a of into.get(n)||[]){const s=a.startBinding.elementId;if(!nodes.has(s)){nodes.add(s);queue.push(s);}}}
 const onPath=arrows.filter(a=>nodes.has(a.startBinding.elementId)&&nodes.has(a.endBinding.elementId));
 // ordem da animação: distância a partir dos inícios (quadros do caminho sem seta chegando de dentro dele)
 const order=new Map(),incoming=new Map([...nodes].map(n=>[n,0]));
 for(const a of onPath)incoming.set(a.endBinding.elementId,incoming.get(a.endBinding.elementId)+1);
 const q=[...nodes].filter(n=>!incoming.get(n));q.forEach(n=>order.set(n,0));
 for(let i=0;i<q.length;i++){const n=q[i],d=order.get(n);for(const a of onPath)if(a.startBinding.elementId===n){const m=a.endBinding.elementId;if(!order.has(m)){order.set(m,d+1);q.push(m);}if(!order.has(a.id))order.set(a.id,d+.5);}}
 for(const n of nodes)if(!order.has(n))order.set(n,0); // ciclos sem início: tudo de uma vez
 for(const a of onPath)if(!order.has(a.id))order.set(a.id,order.get(a.startBinding.elementId)+.5);
 return {nodes,arrows:new Set(onPath.map(a=>a.id)),order};
}
// cor do destaque: desenhada numa camada SVG por cima do canvas (o tema escuro do Excalidraw inverte as cores do canvas
// e desbota qualquer amarelo; por cima, a cor sai exata)
export const HIGHLIGHT='#ffd43b';
const owner=(path,e)=>path.nodes.has(e.id)||path.arrows.has(e.id)?e.id:e.containerId&&(path.nodes.has(e.containerId)||path.arrows.has(e.containerId))?e.containerId:null;
/** cópia dos elementos com o que está fora do caminho apagado */
export function dimmed(elements,path){
 return elements.map(e=>owner(path,e)!==null?e:{...e,opacity:18,version:(e.version||1)+1,versionNonce:Math.floor(Math.random()*2**31)});
}
/** SVG (coordenadas da tela, relativas ao canvas) com o contorno amarelo do caminho até o passo `step` */
export function overlaySvg(elements,path,step,{zoom,scrollX,scrollY}){
 const P=(x,y)=>[(x+scrollX)*zoom,(y+scrollY)*zoom],parts=[];
 for(const e of elements){
  if(e.isDeleted||!(path.nodes.has(e.id)||path.arrows.has(e.id))||path.order.get(e.id)>step)continue;
  const [x,y]=P(e.x,e.y),w=e.width*zoom,h=e.height*zoom,pad=5,fresh=path.order.get(e.id)>step-.5?' dw-new':'';
  if(e.type==='arrow'||e.type==='line'){
   const pts=(e.points||[]).map(([px,py])=>P(e.x+px,e.y+py).map(v=>v.toFixed(1)).join(',')).join(' ');
   parts.push(`<polyline class="dw-hl-arrow${fresh}" points="${pts}"/>`);
  }else if(e.type==='ellipse')parts.push(`<ellipse class="dw-hl-node${fresh}" cx="${x+w/2}" cy="${y+h/2}" rx="${w/2+pad}" ry="${h/2+pad}"/>`);
  else if(e.type==='diamond')parts.push(`<polygon class="dw-hl-node${fresh}" points="${x+w/2},${y-pad*1.4} ${x+w+pad*1.4},${y+h/2} ${x+w/2},${y+h+pad*1.4} ${x-pad*1.4},${y+h/2}"/>`);
  else parts.push(`<rect class="dw-hl-node${fresh}" x="${x-pad}" y="${y-pad}" width="${w+pad*2}" height="${h+pad*2}" rx="${Math.min(14,h/4)}"/>`);
 }
 return parts.join('');
}

/* ---------- configuração do destaque ----------
   No desenho (images[].highlight): {enabled, speed: instant|fast|normal, color}. Em cada quadro (customData):
   cmEnd = fim clicável (havendo algum marcado, só os marcados reagem ao clique), cmColor = cor do destaque até ele. */
export const SPEEDS={instant:0,fast:25,normal:60};
export const highlightSettings=h=>({enabled:h?.enabled!==false,speed:SPEEDS[h?.speed]!==undefined?h.speed:'normal',color:/^#[0-9a-f]{6}$/i.test(h?.color||'')?h.color:HIGHLIGHT});
/** o quadro clicado acende? (com fins marcados, só eles) */
export function clickTarget(elements,hit){
 if(!hit)return null;
 return live(elements).some(e=>e.customData?.cmEnd)&&!hit.customData?.cmEnd?null:hit;
}
export const endColor=(hit,settings)=>hit?.customData?.cmColor||settings.color;

/* ---------- janela do desenho ---------- */
/**
 * Abre o desenho na janela lateral. scene = {elements, files}. editable: começa editando (desenho novo).
 * onSave({elements,files}) a cada mudança (com pausa); onClose({changed, svg}) com a miniatura nova se mudou.
 */
export async function openDrawing({scene,title,t,lang,editable=false,highlight,onSave,onSettings,onClose}){
 let settings=highlightSettings(highlight);
 const lib=await loadExcalidraw();
 const {React,ReactDOM}=window;
 const host=document.createElement('div');host.className='dw-host';
 const mount=document.createElement('div');mount.className='dw-mount';
 const layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.setAttribute('class','dw-layer');layer.setAttribute('aria-hidden','true');
 host.append(mount,layer);
 const hint=document.createElement('p');hint.className='dw-hint';
 const toggle=document.createElement('button');toggle.type='button';toggle.className='dw-toggle';
 // configurações do destaque (desenho inteiro) e barra do quadro selecionado (modo de edição)
 const h=(tag,props={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==null&&v!==undefined&&v!==false)e.setAttribute(k,v===true?'':v);}e.append(...kids);return e;};
 const gear=h('button',{type:'button',class:'dw-gear','aria-expanded':'false','aria-controls':'dw-settings'},t('drawingHl'));
 const hlOn=h('input',{type:'checkbox'}),hlSpeed=h('select',{},...Object.keys(SPEEDS).map(k=>h('option',{value:k},t(`drawingSpeed_${k}`)))),hlColor=h('input',{type:'color'});
 const box=h('div',{class:'dw-settings',id:'dw-settings',hidden:true},
  h('label',{},hlOn,t('drawingHlOn')),
  h('label',{},t('drawingHlSpeed'),hlSpeed),
  h('label',{},t('drawingHlColor'),hlColor,h('button',{type:'button',class:'dw-mini',onclick:()=>setSettings({color:HIGHLIGHT})},t('drawingHlDefault'))));
 const syncSettings=()=>{hlOn.checked=settings.enabled;hlSpeed.value=settings.speed;hlColor.value=settings.color;hlSpeed.disabled=hlColor.disabled=!settings.enabled;};
 const setSettings=patch=>{settings=highlightSettings({...settings,...patch});syncSettings();onSettings?.(settings);if(!settings.enabled)clearHighlight();paintHint();};
 hlOn.addEventListener('change',()=>setSettings({enabled:hlOn.checked}));hlSpeed.addEventListener('change',()=>setSettings({speed:hlSpeed.value}));hlColor.addEventListener('input',()=>setSettings({color:hlColor.value}));
 gear.addEventListener('click',()=>{box.hidden=!box.hidden;gear.setAttribute('aria-expanded',String(!box.hidden));});
 const endBox=h('input',{type:'checkbox'}),endColorIn=h('input',{type:'color'});
 const bar=h('div',{class:'dw-boxbar',hidden:true},h('span',{},t('drawingBox')),h('label',{},endBox,t('drawingBoxEnd')),h('label',{},t('drawingBoxColor'),endColorIn),h('button',{type:'button',class:'dw-mini',onclick:()=>setCustom({cmColor:undefined})},t('drawingHlDefault')));
 let barFor=null;
 const setCustom=patch=>{
  if(!api||!barFor)return;
  api.updateScene({elements:api.getSceneElementsIncludingDeleted().map(e=>{if(e.id!==barFor)return e;const cd={...(e.customData||{}),...patch};for(const k of Object.keys(cd))if(cd[k]===undefined||cd[k]===false)delete cd[k];return {...e,customData:cd,version:(e.version||1)+1,versionNonce:Math.floor(Math.random()*2**31)};})});
 };
 endBox.addEventListener('change',()=>setCustom({cmEnd:endBox.checked}));endColorIn.addEventListener('input',()=>setCustom({cmColor:endColorIn.value}));
 const syncBar=st=>{
  const ids=Object.keys(st?.selectedElementIds||{}).filter(k=>st.selectedElementIds[k]),el=ids.length===1?api.getSceneElements().find(e=>e.id===ids[0]):null;
  const ok=editing&&settings.enabled&&el&&SHAPES.has(el.type)&&!el.containerId;
  bar.hidden=!ok;barFor=ok?el.id:null;
  if(ok){endBox.checked=!!el.customData?.cmEnd;endColorIn.value=el.customData?.cmColor||settings.color;}
 };
 let api=null,root=null,editing=editable,changed=false,lastVersion=-1,timer=0,base=null,anim=0,selected=null,lit=null;
 const elementsNow=()=>api?api.getSceneElementsIncludingDeleted().filter(e=>!e.isDeleted):[];
 const snapshot=()=>({elements:JSON.parse(JSON.stringify(elementsNow())),files:usedFiles()});
 const usedFiles=()=>{const all=api?.getFiles()||{},ids=new Set(elementsNow().filter(e=>e.type==='image').map(e=>e.fileId));return Object.fromEntries(Object.entries(all).filter(([k])=>ids.has(k)));};
 // miniatura do card: SVG no tema escuro, como o desenho aparece na janela
 const thumb=async()=>{const el=await lib.exportToSvg({elements:elementsNow(),files:usedFiles(),appState:{exportBackground:true,exportWithDarkMode:true,viewBackgroundColor:'#ffffff'},exportPadding:16});return new XMLSerializer().serializeToString(el);};
 const save=()=>{clearTimeout(timer);timer=0;onSave?.(snapshot(),thumb);};
 const flush=()=>{if(timer)save();};
 const drawLayer=()=>{
  if(!lit||!api){layer.innerHTML='';return;}
  layer.style.setProperty('--hl',lit.color);
  const st=api.getAppState(),r=host.getBoundingClientRect();
  layer.innerHTML=`<g transform="translate(${st.offsetLeft-r.left} ${st.offsetTop-r.top})">${overlaySvg(base,lit.path,lit.step,{zoom:st.zoom.value,scrollX:st.scrollX,scrollY:st.scrollY})}</g>`;
 };
 const clearHighlight=()=>{clearTimeout(anim);if(base&&api){api.updateScene({elements:base});}base=null;selected=null;lit=null;drawLayer();host.classList.remove('is-lit');};
 const panel=sidePanel({title,t,className:'dw-viewer',labels:{close:t('drawingClose'),resize:t('drawingResize'),resizeHint:t('openApiResizeHint')},escSkip:'.dw-host',
  onClose:async()=>{
   clearHighlight();flush();let svg=null;
   if(changed&&api){try{svg=await thumb();}catch{}}
   try{root?.unmount();}catch{}
   onClose?.({changed,svg});
  }});
 panel.head.insertBefore(gear,panel.head.querySelector('.oa-close'));panel.head.insertBefore(toggle,gear);
 panel.el.append(box,hint,bar,host);syncSettings();
 const paintHint=()=>{hint.textContent=editing?t('drawingEditHint'):!settings.enabled?t('drawingHlOffHint'):api&&elementsNow().some(e=>e.customData?.cmEnd)?t('drawingViewHintEnds'):t('drawingViewHint');};
 const paint=()=>{
  toggle.textContent=editing?t('drawingDone'):t('drawingEdit');toggle.setAttribute('aria-pressed',String(editing));
  paintHint();panel.el.classList.toggle('is-editing',editing);if(!editing)bar.hidden=true;
  root.render(React.createElement(lib.Excalidraw,props()));
 };
 const props=()=>({
  initialData:{elements:scene?.elements||[],files:scene?.files||{},appState:{viewBackgroundColor:'#ffffff'},scrollToContent:true},
  theme:'dark',langCode:lang==='pt'?'pt-BR':'en',viewModeEnabled:!editing,
  excalidrawAPI:a=>{if(api===a)return;api=a;setTimeout(()=>{if(a.getSceneElements().length)a.scrollToContent(undefined,{fitToViewport:true,viewportZoomFactor:.9});},60);}, // abre com o desenho inteiro à vista
  UIOptions:{canvasActions:{loadScene:false,saveToActiveFile:false,export:false,toggleTheme:false,changeViewBackgroundColor:false}},
  onChange:(els,st)=>{
   if(lit)drawLayer(); // moveu ou deu zoom: a camada acompanha
   if(!editing||!api)return;
   syncBar(st);
   const v=lib.getSceneVersion(els);if(lastVersion<0){lastVersion=v;return;}
   if(v===lastVersion)return;lastVersion=v;changed=true;
   clearTimeout(timer);timer=setTimeout(save,700);
  }
 });
 toggle.addEventListener('click',()=>{clearHighlight();if(editing)flush();editing=!editing;paint();});
 // modo de ver: clicar num quadro destaca o caminho até ele (as setas presas aos quadros), com uma animação curta
 let down=null;
 host.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};},true);
 host.addEventListener('pointerup',e=>{
  if(editing||!api||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;down=null;
  if(!e.target.closest('canvas'))return;
  const st=api.getAppState(),z=st.zoom.value,x=(e.clientX-st.offsetLeft)/z-st.scrollX,y=(e.clientY-st.offsetTop)/z-st.scrollY;
  if(!settings.enabled)return;
  const source=base||api.getSceneElements(),hit=clickTarget(source,shapeAt(source,x,y));
  if(!hit||hit.id===selected){clearHighlight();return;}
  clearHighlight();base=source;selected=hit.id;
  const path=pathTo(base,hit.id),last=Math.max(0,...path.order.values());
  api.updateScene({elements:dimmed(base,path)});host.classList.add('is-lit');
  const wait=SPEEDS[settings.speed];
  lit={path,step:wait?0:Infinity,color:endColor(hit,settings)};const tick=()=>{if(selected!==hit.id)return;drawLayer();if(lit.step<last){lit.step+=.5;anim=setTimeout(tick,wait);}};
  tick();
 },true);
 root=ReactDOM.createRoot(mount);paint();setTimeout(paintHint,200); // a dica depende dos fins marcados (cena carregada)
 panel.el.drawingApi=()=>api; // para os testes (e2e) lerem a cena e a câmera
 return {...panel,api:()=>api,path:id=>pathTo(elementsNow(),id)};
}
