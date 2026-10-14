import {tree as seed,visibleNodes,allBranches,zoomAt,parentOf,newId,PALETTE} from './model.js?v=2';
import {cancelMotion,snapshot,animateLayout,hoverEdge,updateEdges} from './motion.js?v=2';
import * as store from './store.js?v=2';
const $=s=>document.querySelector(s), viewport=$('#viewport'), world=$('#world');
const ROOT_COLOR='#a7a7b8', GAP=64;
let doc={id:null,tree:seed}, tree=seed, expanded=new Set(['root']), camera={x:0,y:0,scale:1}, reading=false, editing=false, bounds={width:1,height:1};
let colors=new Map(), saveTimer=0, saving=Promise.resolve();

function updateCamera(){world.style.transform=`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;$('#zoom-level').textContent=`${Math.round(camera.scale*100)}%`;}
function fit(){const side=40,top=40,bottom=100,availH=viewport.clientHeight-top-bottom;camera.scale=Math.min(1,(viewport.clientWidth-side*2)/bounds.width,availH/bounds.height);camera.x=(viewport.clientWidth-bounds.width*camera.scale)/2;camera.y=top+(availH-bounds.height*camera.scale)/2;updateCamera();}
function zoom(factor,p={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){camera=zoomAt(camera,factor,p);updateCamera();}

/* Imagens */
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

/* Persistência (apenas com server.mjs) */
function setStatus(text,state=''){const s=$('#save-status');s.textContent=text;s.dataset.state=state;}
function commit(){
 if(!doc.id)return;
 setStatus('Alterações não salvas','dirty');clearTimeout(saveTimer);
 saveTimer=setTimeout(flush,500);
}
function flush(){
 clearTimeout(saveTimer);saveTimer=0;if(!doc.id)return saving;
 const snapshotDoc={id:doc.id,tree:JSON.parse(JSON.stringify(tree))};
 setStatus('Salvando…','saving');
 saving=saving.then(()=>store.save(snapshotDoc)).then(()=>{if(!saveTimer)setStatus('Salvo','saved');},()=>setStatus('Erro ao salvar','error'));
 return saving;
}

/* Edição */
function focusText(id){
 const text=document.querySelector(`[data-id="${id}"] [contenteditable]`);if(!text)return;
 text.focus({preventScroll:true});getSelection().selectAllChildren(text);
 const r=document.querySelector(`[data-id="${id}"]`).getBoundingClientRect(),v=viewport.getBoundingClientRect();
 if(r.left<v.left||r.right>v.right||r.top<v.top||r.bottom>v.bottom)fit();
}
function addChild(node){
 const child={id:newId(),title:'Nova ideia',children:[]};node.children.push(child);expanded.add(node.id);commit();render();focusText(child.id);
}
function addSibling(node){
 const parent=parentOf(tree,node.id);if(!parent)return;
 const sibling={id:newId(),title:'Nova ideia',children:[]};parent.children.splice(parent.children.indexOf(node)+1,0,sibling);commit();render();focusText(sibling.id);
}
function removeNode(node){
 const parent=parentOf(tree,node.id);if(!parent)return;
 const count=(n)=>1+n.children.reduce((a,c)=>a+count(c),0);
 if(node.children.length&&!confirm(`Excluir "${node.title}" e ${count(node)-1} ideia(s) abaixo dela?`))return;
 parent.children.splice(parent.children.indexOf(node),1);
 if(!parent.children.length)expanded.delete(parent.id);
 commit();render();
}
async function setImage(node,file){
 try{const src=await store.upload(doc.id,file);node.image={src,alt:node.title};commit();render();}
 catch{setStatus('Erro ao enviar imagem','error');}
}
function editTools(node,depth){
 const tools=document.createElement('div');tools.className='node-tools';
 const add=(label,aria,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',`${aria}: ${node.title}`);b.onclick=handler;tools.append(b);return b;};
 add('+ Filho','Adicionar filho',()=>addChild(node));
 if(depth>0)add('+ Irmão','Adicionar irmão',()=>addSibling(node));
 const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp,image/gif,image/svg+xml';picker.hidden=true;
 picker.onchange=()=>{if(picker.files[0])setImage(node,picker.files[0]);};
 add(node.image?'Trocar imagem':'Imagem','Escolher imagem',()=>picker.click());tools.append(picker);
 if(node.image)add('Sem imagem','Remover imagem',()=>{delete node.image;commit();render();});
 if(depth===1){
  const color=document.createElement('input');color.type='color';color.value=colors.get(node.id);color.className='color-input';color.setAttribute('aria-label',`Cor do ramo: ${node.title}`);
  color.onchange=()=>{node.color=color.value;commit();render();};tools.append(color);
 }
 if(depth>0)add('Excluir','Excluir ideia',()=>removeNode(node)).classList.add('danger');
 return tools;
}

/* Renderização */
function render(){
 cancelMotion();
 const container=$('#nodes');container.replaceChildren();$('#connections').replaceChildren();
 const visible=visibleNodes(tree,expanded), elements=new Map(), depths=new Map();
 colors=new Map();
 const assign=(node,depth,color)=>{depths.set(node.id,depth);colors.set(node.id,color);node.children.forEach((c,i)=>assign(c,depth+1,depth===0?(c.color||PALETTE[i%PALETTE.length]):color));};
 assign(tree,0,ROOT_COLOR);
 for(const node of visible){
  const depth=depths.get(node.id),isRoot=depth===0;
  const el=document.createElement('section');el.className=`node ${isRoot?'root':node.children.length?'branch':'leaf'}`;el.dataset.id=node.id;el.style.setProperty('--branch',colors.get(node.id));
  el.addEventListener('pointerenter',()=>hoverEdge(node.id,true));el.addEventListener('pointerleave',()=>hoverEdge(node.id,false));
  if(node.image){el.classList.add('has-image');el.append(imageButton(node));}
  const text=document.createElement(isRoot?'h1':'p');el.append(text);
  if(editing){
   text.contentEditable='plaintext-only';text.spellcheck=false;text.textContent=node.title;text.setAttribute('aria-label','Texto da ideia');
   text.addEventListener('input',()=>{node.title=text.textContent;commit();});
   text.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();text.blur();}});
   text.addEventListener('blur',()=>{if(!node.title.trim()){node.title='Nova ideia';text.textContent=node.title;commit();}});
  }
  if(node.children.length){
   const change=selector=>{const before=snapshot(camera),oldY=parseFloat(el.style.top)+el.offsetHeight/2,opening=!expanded.has(node.id);opening?expanded.add(node.id):expanded.delete(node.id);render();const next=document.querySelector(`[data-id="${node.id}"]`);camera.y+=(oldY-(parseFloat(next.style.top)+next.offsetHeight/2))*camera.scale;updateCamera();next.querySelector(selector)?.focus({preventScroll:true});animateLayout(before,camera,node.id,opening?node.children[0]?.id:null);};
   if(!editing){
    const title=document.createElement('button');title.className='node-title';title.textContent=node.title;title.setAttribute('aria-expanded',String(expanded.has(node.id)));title.onclick=()=>change('.node-title');text.append(title);
   }
   const open=expanded.has(node.id);
   const toggle=document.createElement('button');toggle.className=open?'toggle':'toggle is-collapsed';toggle.innerHTML=`<span class="toggle-stack" aria-hidden="true">${open?'':'<i></i><i></i>'}<b>${open?MINUS:CHEVRON}</b></span>`;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${open?'Recolher':'Expandir'}: ${node.title}`);toggle.title=open?'Recolher filhos':'Expandir filhos';toggle.onclick=()=>change('.toggle');el.append(toggle);
  }else if(!editing)text.textContent=node.title;
  if(node.image)el.append(imageBadge(node));
  if(editing)el.append(editTools(node,depth));
  container.append(el);elements.set(node.id,el);
 }

 // Layout em colunas por profundidade; cada pai fica centralizado em relação aos filhos visíveis.
 const colW=[];for(const node of visible){const d=depths.get(node.id);colW[d]=Math.max(colW[d]||0,elements.get(node.id).offsetWidth);}
 const colX=[0];for(let d=1;d<colW.length;d++)colX[d]=colX[d-1]+colW[d-1]+GAP;
 const kidsOf=n=>expanded.has(n.id)?n.children:[], heights=new Map();
 const gapFor=n=>depths.get(n.id)===0?42:22;
 const measure=n=>{const kids=kidsOf(n),own=elements.get(n.id).offsetHeight;kids.forEach(measure);const group=kids.reduce((a,k)=>a+heights.get(k.id),0)+gapFor(n)*Math.max(0,kids.length-1);heights.set(n.id,Math.max(own,group));heights.set(`${n.id}:group`,group);return heights.get(n.id);};
 const total=measure(tree), positions=new Map();
 const place=(n,top)=>{
  const kids=kidsOf(n),own=elements.get(n.id).offsetHeight,height=heights.get(n.id),group=heights.get(`${n.id}:group`);
  positions.set(n.id,{x:colX[depths.get(n.id)],y:top+(height-own)/2});
  let ky=top+(height-group)/2;for(const k of kids){place(k,ky);ky+=heights.get(k.id)+gapFor(n);}
 };
 place(tree,0);
 for(const [id,p] of positions){const el=elements.get(id);el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;}

 function connect(parent,child,color){
  const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path');path.dataset.parent=parent.id;path.dataset.child=child.id;path.style.color=color;
  if(parent.id===tree.id){
   const grad=document.createElementNS(ns,'linearGradient');grad.id=`fade-${child.id}`;grad.setAttribute('gradientUnits','userSpaceOnUse');
   for(const [offset,opacity] of [['0%','.04'],['100%','1']]){const stop=document.createElementNS(ns,'stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);stop.setAttribute('stop-opacity',opacity);grad.append(stop);}
   $('#connections').append(grad);path.setAttribute('stroke',`url(#fade-${child.id})`);
  }else path.setAttribute('stroke',color);
  $('#connections').append(path);
 }
 for(const node of visible)for(const kid of kidsOf(node))connect(node,kid,colors.get(kid.id));
 updateEdges();
 bounds={width:Math.max(...[...positions].map(([id,p])=>p.x+elements.get(id).offsetWidth+(elements.get(id).querySelector('.toggle')?40:0))),height:total};
 updateCamera();
}

function buildReading(){
 const article=$('#reading');article.replaceChildren();
 const intro=document.createElement('span');intro.className='eyebrow';intro.textContent='LEITURA LINEAR';article.append(intro);
 const walk=(node,depth)=>{
  const h=document.createElement(depth===0?'h1':depth===1?'h2':'h3');h.textContent=node.title;if(depth===1)h.style.color=colors.get(node.id);article.append(h);
  if(node.image)article.append(imageFor(node));
  node.children.forEach(c=>walk(c,depth+1));
 };
 walk(tree,0);
}

/* Apresentações */
function setEditing(on){
 editing=on;document.body.classList.toggle('is-editing',on);$('#edit-switch').setAttribute('aria-checked',String(on));render();
}
async function refreshMenu(){
 const list=await store.list(),menu=$('#doc-list');menu.replaceChildren();
 for(const item of list){
  const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=item.title;b.dataset.id=item.id;if(item.id===doc.id)b.setAttribute('aria-current','true');
  b.onclick=()=>{closeMenu();if(item.id!==doc.id)openDoc(item.id);};menu.append(b);
 }
}
function closeMenu(){$('#doc-menu').hidden=true;$('#doc-button').setAttribute('aria-expanded','false');}
async function openDoc(id){
 await flush();
 doc=await store.load(id);tree=doc.tree;expanded=new Set([tree.id]);
 history.replaceState(null,'',`?p=${encodeURIComponent(id)}`);
 $('#doc-title').textContent=tree.title;document.title=`${tree.title} · Response Maps`;
 setStatus('Salvo','saved');render();fit();
}
async function newDoc(){
 const title=prompt('Nome da nova apresentação','Nova apresentação');if(!title)return;
 const created=await store.create(title);await openDoc(created.id);if(!editing)setEditing(true);
}
async function deleteDoc(){
 if(!confirm(`Excluir a apresentação "${tree.title}"? O arquivo será removido da pasta presentations.`))return;
 await store.remove(doc.id);doc={id:null,tree};
 const list=await store.list();
 if(list.length)await openDoc(list[0].id);else{const created=await store.create('Nova apresentação');await openDoc(created.id);}
}
async function initStore(){
 if(!await store.available())return false;
 const list=await store.list();
 const wanted=new URLSearchParams(location.search).get('p');
 const id=list.some(i=>i.id===wanted)?wanted:list[0]?.id;
 if(!id)return false;
 doc=await store.load(id);tree=doc.tree;expanded=new Set([tree.id]);
 document.body.classList.add('has-store');$('#doc-title').textContent=tree.title;document.title=`${tree.title} · Response Maps`;setStatus('Salvo','saved');
 return true;
}

/* Controles */
$('#expand').onclick=()=>{expanded=allBranches(tree);render();fit();};
$('#collapse').onclick=()=>{expanded=new Set([tree.id]);render();fit();};
$('#fit').onclick=fit;$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);
$('#mode').onclick=()=>{reading=!reading;if(reading)buildReading();viewport.hidden=reading;$('#reading').hidden=!reading;for(const id of ['tree-controls','zoom-controls','edit-switch'])$('#'+id).hidden=reading;$('#mode-label').textContent=reading?'Mapa mental':'Modo texto';$('#mode').setAttribute('aria-pressed',String(reading));};
$('#edit-switch').onclick=()=>setEditing(!editing);
$('#doc-button').onclick=async()=>{const menu=$('#doc-menu');if(menu.hidden){await refreshMenu();menu.hidden=false;$('#doc-button').setAttribute('aria-expanded','true');}else closeMenu();};
$('#doc-new').onclick=()=>{closeMenu();newDoc();};
$('#doc-delete').onclick=()=>{closeMenu();deleteDoc();};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#doc-bar'))closeMenu();});
window.addEventListener('beforeunload',()=>{if(doc.id&&saveTimer)flush();});
$('#close-dialog').onclick=()=>$('dialog').close();$('dialog').addEventListener('click',()=>$('dialog').close());
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
viewport.addEventListener('dragstart',e=>e.preventDefault());
let drag=null;
viewport.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,input,[contenteditable]'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,camera:{...camera}};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;camera.x=drag.camera.x+e.clientX-drag.x;camera.y=drag.camera.y+e.clientY-drag.y;updateCamera();});
function stopDrag(){drag=null;viewport.classList.remove('dragging');}
viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);viewport.addEventListener('lostpointercapture',stopDrag);
window.addEventListener('resize',()=>{if(!reading)fit();});

await initStore();
render();fit();
