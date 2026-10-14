import {tree,visibleNodes,allBranches,zoomAt} from './model.js';
import {cancelMotion,snapshot,animateLayout,hoverEdge,updateEdges} from './motion.js';
const $=s=>document.querySelector(s), viewport=$('#viewport'), world=$('#world');
let expanded=new Set(['root']), camera={x:0,y:0,scale:1}, reading=false, bounds={width:1,height:1};
function updateCamera(){world.style.transform=`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;$('#zoom-level').textContent=`${Math.round(camera.scale*100)}%`;}
function fit(){const side=40,top=40,bottom=100,availH=viewport.clientHeight-top-bottom;camera.scale=Math.min(1,(viewport.clientWidth-side*2)/bounds.width,availH/bounds.height);camera.x=(viewport.clientWidth-bounds.width*camera.scale)/2;camera.y=top+(availH-bounds.height*camera.scale)/2;updateCamera();}
function zoom(factor,p={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){camera=zoomAt(camera,factor,p);updateCamera();}
function imageFor(node){const img=document.createElement('img');img.src=node.image.src;img.alt=node.image.alt;img.width=800;img.height=450;return img;}
function openImage(node){const img=$('dialog img');img.src=node.image.src;img.alt=node.image.alt;$('dialog p').textContent=node.image.alt;$('dialog').showModal();}
function imageButton(node){
 const button=document.createElement('button');button.className='image-button';button.setAttribute('aria-label',node.id==='root'?'Ampliar ilustração':`Ampliar imagem: ${node.title}`);button.append(imageFor(node));
 button.onclick=()=>openImage(node);return button;
}
function imageBadge(node){
 const button=document.createElement('button');button.className='node-badge';button.setAttribute('aria-label',`Ver imagem: ${node.title}`);button.title='Ver imagem';
 button.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.2" fill="currentColor"/><path d="m3 12 3.5-3.5 2.5 2.5 2-2 2 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>1';
 button.onclick=()=>openImage(node);return button;
}
const CHEVRON='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MINUS='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function render(){
 cancelMotion();
 const container=$('#nodes');container.replaceChildren();$('#connections').replaceChildren();
 const visible=visibleNodes(tree,expanded), elements=new Map(), positions=new Map();
 for(const node of visible){
  const el=document.createElement('section');el.className=`node ${node.id==='root'?'root':node.children.length?'branch':'leaf'}`;el.dataset.id=node.id;
  el.addEventListener('pointerenter',()=>hoverEdge(node.id,true));el.addEventListener('pointerleave',()=>hoverEdge(node.id,false));
  if(node.image){el.classList.add('has-image');el.append(imageButton(node));}
  if(node.id==='root'){
   const title=document.createElement('h1');el.append(title);
  }else{
   const p=document.createElement('p');el.append(p);
   if(node.children.length)el.style.setProperty('--branch',node.color);
  }
  const text=el.querySelector(node.id==='root'?'h1':'p');
  if(node.children.length){
   const change=selector=>{const before=snapshot(camera),oldY=parseFloat(el.style.top)+el.offsetHeight/2,opening=!expanded.has(node.id);opening?expanded.add(node.id):expanded.delete(node.id);render();const next=document.querySelector(`[data-id="${node.id}"]`);camera.y+=(oldY-(parseFloat(next.style.top)+next.offsetHeight/2))*camera.scale;updateCamera();next.querySelector(selector).focus({preventScroll:true});animateLayout(before,camera,node.id,opening?node.children[0]?.id:null);};
   const title=document.createElement('button');title.className='node-title';title.textContent=node.title;title.setAttribute('aria-expanded',String(expanded.has(node.id)));title.onclick=()=>change('.node-title');text.append(title);
   const open=expanded.has(node.id);
   const toggle=document.createElement('button');toggle.className=open?'toggle':'toggle is-collapsed';toggle.innerHTML=`<span class="toggle-stack" aria-hidden="true">${open?'':'<i></i><i></i>'}<b>${open?MINUS:CHEVRON}</b></span>`;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${open?'Recolher':'Expandir'}: ${node.title}`);toggle.title=open?'Recolher filhos':'Expandir filhos';toggle.onclick=()=>change('.toggle');el.append(toggle);
  }else{text.textContent=node.title;}
  if(node.image)el.append(imageBadge(node));
  container.append(el);elements.set(node.id,el);
 }
 const GAP=64,rootEl=elements.get('root'),branchX=rootEl.offsetWidth+GAP;
 const shownBranches=expanded.has('root')?tree.children:[];
 const leafX=branchX+Math.max(0,...shownBranches.map(b=>elements.get(b.id).offsetWidth))+GAP;
 let y=0;
 for(const branch of shownBranches){
  const el=elements.get(branch.id), kids=expanded.has(branch.id)?branch.children:[];
  const height=Math.max(el.offsetHeight,kids.reduce((a,k)=>a+elements.get(k.id).offsetHeight+22,0)-22);
  positions.set(branch.id,{x:branchX,y:y+(height-el.offsetHeight)/2});
  let ky=y+(height-(kids.reduce((a,k)=>a+elements.get(k.id).offsetHeight+22,0)-22))/2;for(const kid of kids){positions.set(kid.id,{x:leafX,y:ky});ky+=elements.get(kid.id).offsetHeight+22;}
  y+=height+42;
 }
 const total=Math.max(y-42,elements.get('root').offsetHeight);
 positions.set('root',{x:0,y:(total-elements.get('root').offsetHeight)/2});
 for(const [id,p] of positions){const el=elements.get(id);el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;}
 function connect(parent,child,color){
  const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path');path.dataset.parent=parent.id;path.dataset.child=child.id;path.style.color=color;
  if(parent.id==='root'){
   const grad=document.createElementNS(ns,'linearGradient');grad.id=`fade-${child.id}`;grad.setAttribute('gradientUnits','userSpaceOnUse');
   for(const [offset,opacity] of [['0%','.04'],['100%','1']]){const stop=document.createElementNS(ns,'stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);stop.setAttribute('stop-opacity',opacity);grad.append(stop);}
   $('#connections').append(grad);path.setAttribute('stroke',`url(#fade-${child.id})`);
  }else path.setAttribute('stroke',color);
  $('#connections').append(path);
 }
 for(const branch of expanded.has('root')?tree.children:[]){connect(tree,branch,branch.color);if(expanded.has(branch.id))for(const kid of branch.children)connect(branch,kid,branch.color);}
 updateEdges();
 bounds={width:Math.max(...[...positions].map(([id,p])=>p.x+elements.get(id).offsetWidth+(elements.get(id).querySelector('.toggle')?40:0))),height:total};
 updateCamera();
}
function buildReading(){const article=$('#reading');const intro=document.createElement('span');intro.className='eyebrow';intro.textContent='ESTUDO 001 / LEITURA LINEAR';article.append(intro);const title=document.createElement('h1');title.textContent=tree.title;article.append(title);const p=document.createElement('p');p.className='intro';p.textContent='Uma cidade não é apenas o que construímos. É a forma como nos movemos, nos encontramos e compartilhamos o espaço. Explore quatro pontos de partida.';article.append(p);if(tree.image)article.append(imageFor(tree));for(const branch of tree.children){const h=document.createElement('h2');h.textContent=branch.title;h.style.color=branch.color;article.append(h);if(branch.image)article.append(imageFor(branch));for(const kid of branch.children){const h=document.createElement('h3');h.textContent=kid.title;article.append(h);if(kid.image)article.append(imageFor(kid));}}}
$('#expand').onclick=()=>{expanded=allBranches(tree);render();fit();};
$('#collapse').onclick=()=>{expanded=new Set(['root']);render();fit();};
$('#fit').onclick=fit;$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);
$('#mode').onclick=()=>{reading=!reading;viewport.hidden=reading;$('#reading').hidden=!reading;for(const id of ['tree-controls','zoom-controls'])$('#'+id).hidden=reading;$('#mode-label').textContent=reading?'Mapa mental':'Modo texto';$('#mode').setAttribute('aria-pressed',String(reading));};
$('#close-dialog').onclick=()=>$('dialog').close();$('dialog').addEventListener('click',()=>$('dialog').close());
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
viewport.addEventListener('dragstart',e=>e.preventDefault());
let drag=null;
viewport.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,camera:{...camera}};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;camera.x=drag.camera.x+e.clientX-drag.x;camera.y=drag.camera.y+e.clientY-drag.y;updateCamera();});
function stopDrag(){drag=null;viewport.classList.remove('dragging');}
viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);viewport.addEventListener('lostpointercapture',stopDrag);
window.addEventListener('resize',()=>{if(!reading)fit();});
buildReading();render();fit();
