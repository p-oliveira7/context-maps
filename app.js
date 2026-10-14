import {tree,visibleNodes,allBranches,zoomAt} from './model.js';
import {cancelMotion,snapshot,animateLayout,hoverEdge,updateEdges} from './motion.js';
const $=s=>document.querySelector(s), viewport=$('#viewport'), world=$('#world');
let expanded=new Set(['root']), camera={x:0,y:0,scale:1}, reading=false, bounds={width:1,height:1};
function updateCamera(){world.style.transform=`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;$('#zoom-level').textContent=`${Math.round(camera.scale*100)}%`;}
function fit(){const pad=28;camera.scale=Math.min(1,(viewport.clientWidth-pad*2)/bounds.width,(viewport.clientHeight-pad*2)/bounds.height);camera.x=(viewport.clientWidth-bounds.width*camera.scale)/2;camera.y=(viewport.clientHeight-bounds.height*camera.scale)/2;updateCamera();}
function zoom(factor,p={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){camera=zoomAt(camera,factor,p);updateCamera();}
function imageFor(node){const img=document.createElement('img');img.src=node.image.src;img.alt=node.image.alt;img.width=800;img.height=450;return img;}
function imageButton(node){
 const button=document.createElement('button');button.className='image-button';button.setAttribute('aria-label',node.id==='root'?'Ampliar ilustração':`Ampliar imagem: ${node.title}`);button.append(imageFor(node));
 button.onclick=()=>{const img=$('dialog img');img.src=node.image.src;img.alt=node.image.alt;$('dialog p').textContent=node.image.alt;$('dialog').showModal();};return button;
}
function render(){
 cancelMotion();
 const container=$('#nodes');container.replaceChildren();$('#connections').replaceChildren();
 const visible=visibleNodes(tree,expanded), elements=new Map(), positions=new Map();
 for(const node of visible){
  const el=document.createElement('section');el.className=`node ${node.id==='root'?'root':node.children.length?'branch':'leaf'}`;el.dataset.id=node.id;
  el.addEventListener('pointerenter',()=>hoverEdge(node.id,true));el.addEventListener('pointerleave',()=>hoverEdge(node.id,false));
  if(node.image){el.classList.add('has-image');el.append(imageButton(node));}
  if(node.id==='root'){
   const label=document.createElement('span');label.className='root-label';label.textContent='CIDADES POSSÍVEIS';el.append(label);
   const title=document.createElement('h1');el.append(title);
   const caption=document.createElement('p');caption.className='caption';caption.textContent='Quatro caminhos para imaginar uma vida melhor.';el.append(caption);
  }else{
   const p=document.createElement('p');el.append(p);
   if(node.children.length){
    el.style.setProperty('--branch',node.color);const index=document.createElement('span');index.className='branch-index';index.textContent=`0${tree.children.indexOf(node)+1}`;el.prepend(index);
   }
  }
  const text=el.querySelector(node.id==='root'?'h1':'p');
  if(node.children.length){
   const change=selector=>{const before=snapshot(camera),oldY=parseFloat(el.style.top)+el.offsetHeight/2,opening=!expanded.has(node.id);opening?expanded.add(node.id):expanded.delete(node.id);render();const next=document.querySelector(`[data-id="${node.id}"]`);camera.y+=(oldY-(parseFloat(next.style.top)+next.offsetHeight/2))*camera.scale;updateCamera();next.querySelector(selector).focus({preventScroll:true});animateLayout(before,camera,node.id,opening?node.children[0]?.id:null);};
   const title=document.createElement('button');title.className='node-title';title.textContent=node.title;title.setAttribute('aria-expanded',String(expanded.has(node.id)));title.onclick=()=>change('.node-title');text.append(title);
   const toggle=document.createElement('button');toggle.className='toggle';toggle.textContent=expanded.has(node.id)?'−':'+';toggle.setAttribute('aria-expanded',String(expanded.has(node.id)));toggle.setAttribute('aria-label',`${expanded.has(node.id)?'Recolher':'Expandir'}: ${node.title}`);toggle.onclick=()=>change('.toggle');el.append(toggle);
  }else{text.textContent=node.title;}
  container.append(el);elements.set(node.id,el);
 }
 let y=0;
 for(const branch of expanded.has('root')?tree.children:[]){
  const el=elements.get(branch.id), kids=expanded.has(branch.id)?branch.children:[];
  const height=Math.max(el.offsetHeight,kids.reduce((a,k)=>a+elements.get(k.id).offsetHeight+22,0)-22);
  positions.set(branch.id,{x:550,y:y+(height-el.offsetHeight)/2});
  let ky=y;for(const kid of kids){positions.set(kid.id,{x:1000,y:ky});ky+=elements.get(kid.id).offsetHeight+22;}
  y+=height+42;
 }
 const total=Math.max(y-42,elements.get('root').offsetHeight);
 positions.set('root',{x:0,y:(total-elements.get('root').offsetHeight)/2});
 for(const [id,p] of positions){const el=elements.get(id);el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;}
 function connect(parent,child,color){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.dataset.parent=parent.id;path.dataset.child=child.id;path.style.color=color;path.setAttribute('stroke',color);$('#connections').append(path);}
 for(const branch of expanded.has('root')?tree.children:[]){connect(tree,branch,branch.color);if(expanded.has(branch.id))for(const kid of branch.children)connect(branch,kid,branch.color);}
 updateEdges();
 bounds={width:Math.max(...[...positions].map(([id,p])=>p.x+elements.get(id).offsetWidth+(elements.get(id).querySelector('.toggle')?40:0))),height:total};
 $('#counter').textContent=`${visible.length} de 17 ideias visíveis`;updateCamera();
}
function buildReading(){const article=$('#reading');const intro=document.createElement('span');intro.className='eyebrow';intro.textContent='ESTUDO 001 / LEITURA LINEAR';article.append(intro);const title=document.createElement('h1');title.textContent=tree.title;article.append(title);const p=document.createElement('p');p.className='intro';p.textContent='Uma cidade não é apenas o que construímos. É a forma como nos movemos, nos encontramos e compartilhamos o espaço. Explore quatro pontos de partida.';article.append(p);if(tree.image)article.append(imageFor(tree));for(const branch of tree.children){const h=document.createElement('h2');h.textContent=branch.title;h.style.color=branch.color;article.append(h);if(branch.image)article.append(imageFor(branch));for(const kid of branch.children){const h=document.createElement('h3');h.textContent=kid.title;article.append(h);if(kid.image)article.append(imageFor(kid));}}}
$('#expand').onclick=()=>{expanded=allBranches(tree);render();fit();};
$('#collapse').onclick=()=>{expanded=new Set(['root']);render();fit();};
$('#fit').onclick=fit;$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);
$('#mode').onclick=()=>{reading=!reading;viewport.hidden=reading;$('#reading').hidden=!reading;for(const id of ['tree-controls','zoom-controls','map-meta','hint'])$('#'+id).hidden=reading;$('#mode').textContent=reading?'↗ Mapa mental':'≡ Modo texto';$('#mode').setAttribute('aria-pressed',String(reading));};
$('#close-dialog').onclick=()=>$('dialog').close();$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
let drag=null;
viewport.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,camera:{...camera}};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;camera.x=drag.camera.x+e.clientX-drag.x;camera.y=drag.camera.y+e.clientY-drag.y;updateCamera();});
function stopDrag(){drag=null;viewport.classList.remove('dragging');}
viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);viewport.addEventListener('lostpointercapture',stopDrag);
window.addEventListener('resize',()=>{if(!reading)fit();});
buildReading();render();fit();
