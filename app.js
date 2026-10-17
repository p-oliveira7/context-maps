import {tree as seed,visibleNodes,allBranches,zoomAt,parentOf,findNode,newId,PALETTE} from './model.js?v=16';
import {cancelMotion,snapshot,animateLayout,hoverEdge,updateEdges} from './motion.js?v=16';
import * as store from './store.js?v=17';
import {t,applyStatic} from './i18n.js?v=1';
import {VERSION} from './version.js?v=1';
applyStatic();
const $=s=>document.querySelector(s), viewport=$('#viewport'), world=$('#world');
$('#doc-version').textContent=`Context Maps v${VERSION}`;
const ROOT_COLOR='#a7a7b8', GAP=64;
let doc={id:null,title:seed.title,roots:[seed]}, roots=doc.roots, expanded=new Set(['root']), camera={x:0,y:0,scale:1}, reading=false, editing=false, bounds={x:0,y:0,width:1,height:1};
let colors=new Map(), saveTimer=0, saving=Promise.resolve();
/* Uma apresentação tem um nome (doc.title) e um ou mais cards raiz (roots), cada um com sua árvore e posição livre (x, y). */
const isRootNode=n=>roots.includes(n);
const findAny=id=>{for(const r of roots){const n=findNode(r,id);if(n)return n;}return null;};
const parentAny=id=>{for(const r of roots){const p=parentOf(r,id);if(p)return p;}return null;};
function normalizeDoc(raw){ // aceita o formato antigo ({tree}) e o novo ({title, roots})
 const list=Array.isArray(raw.roots)&&raw.roots.length?raw.roots:[raw.tree];
 list.forEach(migrate);
 return {id:raw.id,title:(raw.title&&raw.title.trim())||list[0].title,roots:list};
}
function useDoc(next){doc=next;roots=next.roots;expanded=new Set(roots.map(r=>r.id));}
function showDocTitle(){$('#doc-title').textContent=doc.title;document.title=`${doc.title} · ${t('pageTitle')}`;}

function updateCamera(){world.style.transform=`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;$('#zoom-level').textContent=`${Math.round(camera.scale*100)}%`;}
function fit(){const side=40,top=40,bottom=100,availH=viewport.clientHeight-top-bottom;camera.scale=Math.max(.1,Math.min(1,(viewport.clientWidth-side*2)/bounds.width,availH/bounds.height));camera.x=(viewport.clientWidth-bounds.width*camera.scale)/2-bounds.x*camera.scale;camera.y=top+(availH-bounds.height*camera.scale)/2-bounds.y*camera.scale;updateCamera();}
function zoom(factor,p={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){camera=zoomAt(camera,factor,p);updateCamera();}

/* Imagens e diagramas: cada ideia pode ter várias (node.images) */
const imagesOf=node=>node.images||[];
const nameOf=n=>(n.title&&n.title.trim())||(n.subtitle&&n.subtitle.trim())||t('untitled');
function migrate(node){
 if(node.image){node.images=[...(node.images||[]),node.image];delete node.image;}
 node.children.forEach(migrate);
}
function imageFor(image){const img=document.createElement('img');img.src=image.src;img.alt=image.alt;img.width=800;img.height=450;return img;}
const gallery={images:[],index:0};
function showGalleryImage(){
 const image=gallery.images[gallery.index],lightbox=$('dialog');
 lightbox.querySelector('img').src=image.src;lightbox.querySelector('img').alt=image.alt;lightbox.querySelector('p').textContent=image.alt;
 const many=gallery.images.length>1;
 for(const id of ['lightbox-prev','lightbox-next','lightbox-count'])$('#'+id).hidden=!many;
 $('#lightbox-count').textContent=`${gallery.index+1} / ${gallery.images.length}`;
}
function openImage(node,index=0){
 gallery.images=imagesOf(node);gallery.index=index;showGalleryImage();$('dialog').showModal();
}
function stepGallery(delta){const n=gallery.images.length;if(n<2)return;gallery.index=(gallery.index+delta+n)%n;showGalleryImage();}
function imageButton(node,image,index){
 const button=document.createElement('button');button.className='image-button';
 const many=imagesOf(node).length>1,suffix=many?` (${index+1})`:'';
 button.setAttribute('aria-label',node===roots[0]&&index===0?t('enlargeIllustration'):t('enlargeImage',nameOf(node),suffix));button.append(imageFor(image));
 if(image.kind==='diagram')button.classList.add('is-diagram');
 button.onclick=()=>openImage(node,index);return button;
}
function imageBadge(node){
 const count=imagesOf(node).length,button=document.createElement('button');button.className='node-badge';
 button.setAttribute('aria-label',count>1?t('viewImages',count,nameOf(node)):t('viewImage',nameOf(node)));button.title=count>1?t('viewImagesTitle'):t('viewImageTitle');
 button.innerHTML=`<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.2" fill="currentColor"/><path d="m3 12 3.5-3.5 2.5 2.5 2-2 2 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>${count}`;
 button.onclick=()=>openImage(node,0);return button;
}
function imageItem(node,image,index){
 const button=imageButton(node,image,index);
 if(!editing)return button;
 const item=document.createElement('div');item.className='image-item';item.append(button);
 const tools=document.createElement('div');tools.className='image-tools';
 if(image.kind==='diagram'){
  const edit=document.createElement('button');edit.type='button';edit.textContent=t('edit');edit.setAttribute('aria-label',t('editDiagram',nameOf(node),imagesOf(node).length>1?` (${index+1})`:''));
  edit.onclick=()=>openDiagramEditor(node,index);tools.append(edit);
 }
 const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.className='danger';remove.setAttribute('aria-label',t('removeImage',nameOf(node),imagesOf(node).length>1?` (${index+1})`:''));
 remove.onclick=()=>{node.images.splice(index,1);if(!node.images.length)delete node.images;commit();render();};
 const total=imagesOf(node).length,suffix=total>1?` (${index+1})`:'';
 if(total>1){
  // reordenar: alça (arrastar) + botões ↑ ↓
  const grip=document.createElement('button');grip.type='button';grip.className='img-grip';grip.textContent='⋮⋮';grip.title=t('dragReorder');grip.setAttribute('aria-label',t('reorderImage',nameOf(node),suffix));
  const up=document.createElement('button');up.type='button';up.textContent='↑';up.dataset.move='up';up.setAttribute('aria-label',t('moveImageUp',nameOf(node),suffix));up.disabled=index===0;
  const down=document.createElement('button');down.type='button';down.textContent='↓';down.dataset.move='down';down.setAttribute('aria-label',t('moveImageDown',nameOf(node),suffix));down.disabled=index===total-1;
  up.onclick=()=>reorderImage(node,index,index-1);down.onclick=()=>reorderImage(node,index,index+1);
  tools.prepend(grip,up,down);
  enableImageReorder(item,grip,node,index);
 }
 tools.append(remove);item.append(tools);return item;
}
function reorderImage(node,from,to){
 if(to<0||to>=node.images.length||from===to)return;
 const [moved]=node.images.splice(from,1);node.images.splice(to,0,moved);commit();render();
}
/* Arrastar para reordenar (só vale para o que nasce na alça; arquivos soltos continuam adicionando imagens) */
const IMG_TYPE='application/x-context-maps-image';
function enableImageReorder(item,grip,node,index){
 grip.addEventListener('pointerdown',()=>{item.draggable=true;});
 const reset=()=>{item.draggable=false;item.classList.remove('is-reordering');document.querySelectorAll('.image-item.drop-before,.image-item.drop-after').forEach(el=>el.classList.remove('drop-before','drop-after'));};
 item.addEventListener('dragstart',e=>{if(!item.draggable)return;e.stopPropagation();e.dataTransfer.setData(IMG_TYPE,String(index));e.dataTransfer.effectAllowed='move';item.classList.add('is-reordering');});
 item.addEventListener('dragend',reset);
 item.addEventListener('pointerup',()=>{if(!item.classList.contains('is-reordering'))item.draggable=false;});
 const place=e=>{const r=item.getBoundingClientRect();return e.clientY>r.top+r.height/2?'after':'before';};
 item.addEventListener('dragover',e=>{
  if(!e.dataTransfer?.types?.includes(IMG_TYPE))return;
  e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';
  const pos=place(e);item.classList.toggle('drop-before',pos==='before');item.classList.toggle('drop-after',pos==='after');
 });
 item.addEventListener('dragleave',e=>{if(!item.contains(e.relatedTarget))item.classList.remove('drop-before','drop-after');});
 item.addEventListener('drop',e=>{
  if(!e.dataTransfer?.types?.includes(IMG_TYPE))return;
  e.preventDefault();e.stopPropagation();
  const from=Number(e.dataTransfer.getData(IMG_TYPE)),pos=place(e);
  let to=pos==='after'?index+1:index;if(from<to)to--;
  reset();reorderImage(node,from,to);
 });
}
const CHEVRON='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MINUS='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* Links: ficam num selo abaixo do card (1 link abre direto; vários abrem uma lista) */
const linksOf=node=>node.links||[];
function safeUrl(raw){
 try{const text=String(raw||'').trim();if(!text)return null;const url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(text)?text:`https://${text}`);return ['http:','https:'].includes(url.protocol)?url.href:null;}
 catch{return null;}
}
const hostOf=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};
const linkLabel=link=>link.label||hostOf(link.url);
const LINK_ICON='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function closeLinkMenus(except){document.querySelectorAll('.link-menu').forEach(m=>{if(m!==except)m.remove();});}
function anchorFor(link,className){
 const a=document.createElement('a');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=linkLabel(link);a.title=link.url;if(className)a.className=className;
 return a;
}
function linkBadge(node){
 const links=linksOf(node),button=document.createElement('button');button.type='button';button.className='node-badge link-badge';
 button.innerHTML=`${LINK_ICON}${t('linkCount',links.length)}`;
 button.title=links.length===1?links[0].url:t('links');
 button.setAttribute('aria-label',links.length===1?t('openLink',linkLabel(links[0])):t('viewLinks',links.length,nameOf(node)));
 button.onclick=e=>{
  e.stopPropagation();
  if(links.length===1){window.open(links[0].url,'_blank','noopener,noreferrer');return;}
  const existing=button.parentElement.querySelector('.link-menu');closeLinkMenus();
  if(existing)return;
  const menu=document.createElement('div');menu.className='link-menu';menu.setAttribute('role','menu');
  links.forEach(l=>menu.append(anchorFor(l)));
  button.parentElement.append(menu);
 };
 return button;
}
function linkChips(node){
 const wrap=document.createElement('div');wrap.className='link-chips';
 linksOf(node).forEach((link,i)=>{
  const chip=document.createElement('span');chip.className='link-chip';
  chip.append(anchorFor(link));
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',t('removeLink',linkLabel(link)));
  remove.onclick=e=>{e.stopPropagation();node.links.splice(i,1);if(!node.links.length)delete node.links;commit();render();};
  chip.append(remove);wrap.append(chip);
 });
 return wrap;
}
function addLink(node){
 const raw=prompt(t('linkPrompt'));if(raw===null||!raw.trim())return;
 const url=safeUrl(raw);if(!url){setStatus(t('linkInvalid'),'error');return;}
 (node.links||=[]).push({url});commit();render();
}

/* Persistência (apenas com server.mjs) */
function setStatus(text,state=''){const s=$('#save-status');s.textContent=text;s.dataset.state=state;}
function commit(){
 if(!doc.id)return;
 setStatus(t('unsaved'),'dirty');clearTimeout(saveTimer);
 saveTimer=setTimeout(flush,500);
}
function flush(){
 clearTimeout(saveTimer);saveTimer=0;if(!doc.id)return saving;
 const snapshotDoc={id:doc.id,title:doc.title,roots:JSON.parse(JSON.stringify(roots))};
 setStatus(t('saving'),'saving');
 saving=saving.then(()=>store.save(snapshotDoc)).then(()=>{if(!saveTimer)setStatus(t('saved'),'saved');},()=>setStatus(t('saveError'),'error'));
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
 const child={id:newId(),title:t('newIdea'),children:[]};node.children.push(child);expanded.add(node.id);commit();render();focusText(child.id);
}
function addSibling(node){
 const parent=parentAny(node.id);if(!parent)return;
 const sibling={id:newId(),title:t('newIdea'),children:[]};parent.children.splice(parent.children.indexOf(node)+1,0,sibling);commit();render();focusText(sibling.id);
}
function addBefore(node){
 const parent=parentAny(node.id);if(!parent)return;
 const sibling={id:newId(),title:t('newIdea'),children:[]};parent.children.splice(parent.children.indexOf(node),0,sibling);commit();render();focusText(sibling.id);
}
function addParent(node){
 const parent=parentAny(node.id);if(!parent)return;
 const wrapper={id:newId(),title:t('newIdea'),children:[node]};
 if(node.color){wrapper.color=node.color;delete node.color;}
 parent.children[parent.children.indexOf(node)]=wrapper;
 expanded.add(wrapper.id);commit();render();focusText(wrapper.id);
}
function removeNode(node){
 const parent=parentAny(node.id);
 if(!parent&&roots.length<2)return; // a última raiz não pode ser excluída
 const count=(n)=>1+n.children.reduce((a,c)=>a+count(c),0);
 if(node.children.length&&!confirm(t('confirmDeleteIdea',nameOf(node),count(node)-1)))return;
 if(parent){parent.children.splice(parent.children.indexOf(node),1);if(!parent.children.length)expanded.delete(parent.id);}
 else roots.splice(roots.indexOf(node),1);
 commit();render();
}
/* Cards raiz: pontos de partida independentes, com posição livre no mapa */
const freeSpot=()=>({x:Math.round(bounds.x),y:Math.round(bounds.y+bounds.height+120)}); // abaixo de tudo o que já existe, sem sobrepor
function addRoot(){
 const c=freeSpot(),root={id:newId(),title:t('newRoot'),children:[],x:c.x,y:c.y};
 roots.push(root);expanded.add(root.id);commit();render();revealNode(root.id);focusText(root.id);
}
function detachNode(node,at){ // vira um card raiz (leva as filhas junto)
 const parent=parentAny(node.id);if(!parent)return;
 parent.children.splice(parent.children.indexOf(node),1);if(!parent.children.length)expanded.delete(parent.id);
 const c=at||freeSpot();node.x=c.x;node.y=c.y;delete node.color;
 roots.push(node);expanded.add(node.id);
}
async function addImages(node,files){
 try{
  for(const file of files){const src=await store.upload(doc.id,file);(node.images||=[]).push({src,alt:nameOf(node)});}
  commit();render();
 }catch{setStatus(t('uploadError'),'error');commit();render();}
}
/* Arrastar e soltar: arquivos de imagem soltos num card viram cópias em presentations/<id>/assets */
const isImageFile=f=>/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(f.type)||/\.(png|jpe?g|webp|gif|svg)$/i.test(f.name);
const hasFiles=e=>!!e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files');
function enableDrop(el,node){
 const over=e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';el.classList.add('drop-target');};
 el.addEventListener('dragenter',over);el.addEventListener('dragover',over);
 el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.classList.remove('drop-target');});
 el.addEventListener('drop',e=>{
  if(!hasFiles(e))return;
  e.preventDefault();e.stopPropagation();el.classList.remove('drop-target');
  const files=[...e.dataTransfer.files],images=files.filter(isImageFile);
  if(images.length)addImages(node,images);
  if(images.length<files.length)setStatus(t('onlyImages'),'error');
 });
}
// Soltar um arquivo fora de um card não deve abrir o arquivo no navegador.
for(const type of ['dragover','drop'])window.addEventListener(type,e=>{if(hasFiles(e))e.preventDefault();});

/* Cor das ligações: escolhe a cor e depois o alcance (só filhos diretos ou toda a ramificação abaixo) */
const SWATCHES=[...PALETTE,'#ffffff','#8a8a8a'];
let colorPanel=null;
function closeColorPanel(){
 if(!colorPanel)return;
 const p=colorPanel;colorPanel=null;p.el.remove();
 document.removeEventListener('pointerdown',p.onDown,true);document.removeEventListener('keydown',p.onKey,true);
}
function applyLinksColor(node,color,scope){
 const set=n=>{if(color)n.linksColor=color;else delete n.linksColor;};
 set(node); // linhas que saem deste card até os filhos diretos
 if(scope==='all'){const walk=n=>n.children.forEach(c=>{if(c.children.length)set(c);walk(c);});walk(node);}
 commit();render();
}
function openColorPanel(anchor,node){
 closeColorPanel();
 let chosen; // undefined = nada escolhido, null = padrão, string = cor
 const direct=node.children.length,all=countBelow(node);
 const el=document.createElement('div');el.id='color-panel';el.className='color-panel';el.setAttribute('role','dialog');el.setAttribute('aria-label',t('lineColorOf',nameOf(node)));
 el.innerHTML=`<div class="cp-head"><strong>${t('lineColor')}</strong><button type="button" class="cp-close" aria-label="${t('close')}">×</button></div>
  <div class="cp-step">${t('step1')}</div><div class="cp-swatches"></div>
  <label class="cp-custom">${t('anotherColor')} <input type="color" class="color-input" aria-label="${t('customColor')}" value="#4f9d7a"></label>
  <div class="cp-step">${t('step2')}</div>
  <div class="cp-actions">
   <button type="button" data-scope="children" disabled><b>${t('onlyDirect')}</b><span>${t('direct',direct)}</span></button>
   <button type="button" data-scope="all" disabled><b>${t('wholeBranch')}</b><span>${t('branchLines',all)}</span></button>
  </div>`;
 const swatches=el.querySelector('.cp-swatches'),custom=el.querySelector('.color-input'),actions=[...el.querySelectorAll('[data-scope]')];
 const select=value=>{
  chosen=value;
  swatches.querySelectorAll('.cp-swatch').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.color||null)===value||(b.hasAttribute('data-default')&&value===null))));
  actions.forEach(b=>b.disabled=false);
 };
 const def=document.createElement('button');def.type='button';def.className='cp-swatch cp-default';def.dataset.default='';def.textContent='↺';def.title=t('defaultColor');def.setAttribute('aria-label',t('defaultColor'));def.setAttribute('aria-pressed','false');
 def.onclick=()=>select(null);swatches.append(def);
 for(const color of SWATCHES){
  const b=document.createElement('button');b.type='button';b.className='cp-swatch';b.dataset.color=color;b.style.background=color;b.title=color;b.setAttribute('aria-label',t('colorName',color));b.setAttribute('aria-pressed','false');
  b.onclick=()=>select(color);swatches.append(b);
 }
 custom.addEventListener('input',()=>select(custom.value));
 actions.forEach(b=>b.onclick=()=>{if(chosen===undefined)return;const scope=b.dataset.scope;closeColorPanel();applyLinksColor(node,chosen,scope);});
 el.querySelector('.cp-close').onclick=closeColorPanel;
 const left=Math.min(Math.max(anchor.left+anchor.width/2-150,12),window.innerWidth-312),top=Math.min(Math.max(anchor.bottom+10,12),window.innerHeight-330);
 el.style.left=`${left}px`;el.style.top=`${top}px`;
 document.body.append(el);
 colorPanel={el,
  onDown:e=>{if(!el.contains(e.target))closeColorPanel();},
  onKey:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeColorPanel();}}};
 document.addEventListener('pointerdown',colorPanel.onDown,true);document.addEventListener('keydown',colorPanel.onKey,true);
}

/* Menu de edição: um botão (✎) no topo do card abre uma roda com as ações da ideia */
let radial=null;
function closeRadial(){
 if(!radial)return;
 const r=radial;radial=null;
 r.el.remove();r.card.classList.remove('menu-open');r.fab.setAttribute('aria-expanded','false');
 document.removeEventListener('pointerdown',r.onDown,true);document.removeEventListener('keydown',r.onKey,true);document.removeEventListener('wheel',r.onWheel,true);
}
function radialItems(node,depth,picker,anchor){
 const items=[{icon:'↳',label:t('child'),aria:t('addChild'),run:()=>addChild(node)}];
 if(depth>0)items.push(
  {icon:'↧',label:t('sibling'),aria:t('addSibling'),run:()=>addSibling(node)},
  {icon:'↥',label:t('before'),aria:t('insertBefore'),run:()=>addBefore(node)},
  {icon:'⇱',label:t('parent'),aria:t('insertParent'),run:()=>addParent(node)},
  {icon:'⎋',label:t('makeRoot'),aria:t('toRoot'),run:()=>{const before=snapshotForUndo();detachNode(node);lastMove=before;commit();render();revealNode(node.id);showToast(t('becameRoot',nameOf(node)),true);}});
 items.push(
  {icon:'▣',label:t('image'),aria:t('addImage'),run:()=>picker.click()},
  {icon:'◇',label:t('diagram'),aria:t('addDiagram'),run:()=>openDiagramEditor(node,null)},
  {icon:'↗',label:t('link'),aria:t('addLink'),run:()=>addLink(node)});
 if(node.children.length)items.push({icon:'◐',label:t('colorLines'),aria:t('lineColor'),run:()=>openColorPanel(anchor,node)});
 if(depth>0||roots.length>1)items.push({icon:'✕',label:t('del'),aria:t('deleteIdea'),danger:true,run:()=>removeNode(node)});
 return items;
}
function openRadial(fab,card,node,depth,picker){
 closeRadial();
 const items=radialItems(node,depth,picker,fab.getBoundingClientRect()),n=items.length;
 const R=Math.max(86,Math.ceil(n*58/(2*Math.PI))),pad=R+46;
 const fr=fab.getBoundingClientRect();
 const cx=Math.min(Math.max(fr.left+fr.width/2,pad),window.innerWidth-pad);
 const cy=Math.min(Math.max(fr.top+fr.height/2,pad),window.innerHeight-pad-70);
 const el=document.createElement('div');el.id='radial-menu';el.className='radial-menu';el.setAttribute('role','menu');
 el.style.left=`${cx}px`;el.style.top=`${cy}px`;
 const center=document.createElement('button');center.type='button';center.className='radial-center';center.textContent='×';center.setAttribute('aria-label',t('closeEditMenu'));
 center.onclick=closeRadial;el.append(center);
 items.forEach((item,k)=>{
  const angle=-Math.PI/2+k*(2*Math.PI/n),dx=Math.cos(angle)*R,dy=Math.sin(angle)*R;
  const b=document.createElement('button');b.type='button';b.className='radial-item'+(item.danger?' danger':'');b.setAttribute('role','menuitem');
  b.setAttribute('aria-label',`${item.aria}: ${nameOf(node)}`);
  b.innerHTML=`<span class="ri-icon" aria-hidden="true">${item.icon}</span><span class="ri-label">${item.label}</span>`;
  b.style.setProperty('--dx',`${dx}px`);b.style.setProperty('--dy',`${dy}px`);b.style.transitionDelay=`${k*14}ms`;
  b.onclick=e=>{e.stopPropagation();closeRadial();item.run();};
  el.append(b);
 });
 document.body.append(el);
 requestAnimationFrame(()=>el.classList.add('open'));
 card.classList.add('menu-open');fab.setAttribute('aria-expanded','true');
 radial={el,card,fab,
  onDown:e=>{if(!el.contains(e.target)&&e.target!==fab)closeRadial();},
  onKey:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRadial();fab.focus({preventScroll:true});}},
  onWheel:()=>closeRadial()};
 document.addEventListener('pointerdown',radial.onDown,true);document.addEventListener('keydown',radial.onKey,true);document.addEventListener('wheel',radial.onWheel,true);
}
function editControls(card,node,depth){
 const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp,image/gif,image/svg+xml';picker.multiple=true;picker.className='sr-input';picker.tabIndex=-1;
 picker.onchange=()=>{if(picker.files.length)addImages(node,[...picker.files]);};
 card.append(picker);
 const fab=document.createElement('button');fab.type='button';fab.className='edit-fab';fab.textContent='✎';
 fab.title=t('editWheel');fab.setAttribute('aria-label',t('editNode',nameOf(node)));fab.setAttribute('aria-haspopup','menu');fab.setAttribute('aria-expanded','false');
 fab.onclick=e=>{e.stopPropagation();if(radial&&radial.card===card)closeRadial();else openRadial(fab,card,node,depth,picker);};
 card.append(fab);
}

/* Diagramas (Mermaid carregado sob demanda; o SVG renderizado é salvo como imagem do nó) */
let mermaidReady=null, renderSeq=0;
function loadMermaid(){
 if(mermaidReady)return mermaidReady;
 mermaidReady=new Promise((ok,fail)=>{
  const s=document.createElement('script');s.src='vendor/mermaid.min.js?v=12.2.0';
  s.onload=()=>{
   const g=window.__esbuild_esm_mermaid_nm?.mermaid,m=window.mermaid||g?.default||g;
   if(!m?.render){mermaidReady=null;return fail(new Error(t('mermaidMissing')));}
   m.initialize({startOnLoad:false,theme:'dark',securityLevel:'strict'});ok(m);
  };
  s.onerror=()=>{mermaidReady=null;fail(new Error(t('mermaidLoad')));};
  document.head.append(s);
 });
 return mermaidReady;
}
async function renderDiagram(source){
 if(!source.trim())throw new Error(t('writeDiagram'));
 const mermaid=await loadMermaid(),id=`mm-${++renderSeq}`;
 try{
  await mermaid.parse(source);
  const {svg}=await mermaid.render(id,source);
  const box=svg.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/);
  return box?svg.replace(/(<svg[^>]*?) width="100%"/,`$1 width="${Math.ceil(box[1])}" height="${Math.ceil(box[2])}"`):svg;
 }finally{document.getElementById(`d${id}`)?.remove();}
}
function openDiagramEditor(node,index=null){
 const modal=$('#diagram-editor'),ta=$('#diagram-source'),preview=$('#diagram-preview'),error=$('#diagram-error'),apply=$('#diagram-apply');
 const opener=document.activeElement;
 // A pré-visualização é uma <img> (como o card): o CSS do app não vaza para o SVG do Mermaid e o que se vê é o que será salvo.
 const showPreview=markup=>{const img=document.createElement('img');img.alt=t('diagramPreview');img.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;preview.replaceChildren(img);};
 let svg=null,timer=0,seq=0;
 const current=index===null?null:node.images?.[index];
 ta.value=current?.kind==='diagram'&&current.source?current.source:t('defaultDiagram');
 const close=()=>{modal.hidden=true;document.removeEventListener('keydown',onKey);clearTimeout(timer);ta.oninput=null;opener?.focus?.({preventScroll:true});};
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
 const update=async()=>{
  const mine=++seq;
  try{const out=await renderDiagram(ta.value);if(mine!==seq)return;svg=out;showPreview(out);error.textContent='';apply.disabled=false;}
  catch(e){if(mine!==seq)return;svg=null;apply.disabled=true;error.textContent=String(e.message||e).split('\n').slice(0,3).join(' ');}
 };
 ta.oninput=()=>{apply.disabled=true;clearTimeout(timer);timer=setTimeout(update,350);};
 $('#diagram-cancel').onclick=close;
 apply.onclick=async()=>{
  if(!svg)return;apply.disabled=true;
  try{
   const src=await store.upload(doc.id,new File([svg],'diagrama.svg',{type:'image/svg+xml'}));
   const entry={src,alt:t('diagramAlt',nameOf(node)),kind:'diagram',source:ta.value};
   if(current)node.images[index]=entry;else(node.images||=[]).push(entry);
   close();commit();render();
  }catch{error.textContent=t('diagramSaveError');apply.disabled=false;}
 };
 preview.replaceChildren();error.textContent='';apply.disabled=true;
 modal.hidden=false;document.addEventListener('keydown',onKey);ta.focus();update();
}

/* Mover cards: arraste a alça (⋮⋮). O card sai do mapa e o conjunto inteiro (ele + tudo abaixo) acompanha o cursor.
   Soltar sobre um card = vira filho; na borda de cima/baixo = vira irmão. Ao pairar sobre um ramo fechado ele abre sozinho,
   para você percorrer as ramificações. Botão do meio do mouse move o quadro durante o arraste; Esc cancela. */
let moving=null, lastMove=null, toastTimer=0;
const isInside=(root,id)=>root.id===id||root.children.some(c=>isInside(c,id));
const countBelow=n=>n.children.reduce((a,c)=>a+1+countBelow(c),0);
const ancestorIds=id=>{const out=new Set();let p=parentAny(id);while(p){out.add(p.id);p=parentAny(p.id);}return out;};
const snapshotForUndo=()=>({tree:JSON.stringify(roots),expanded:[...expanded]});
const OPEN_DELAY=450, CLOSE_DELAY=700;
const GRIP='<svg viewBox="0 0 10 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></g></svg>';
function showToast(text,undo,ms=7000){
 const toast=$('#toast');$('#toast-text').textContent=text;$('#toast-undo').hidden=!undo;toast.hidden=false;
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},ms);
}
function hideToast(){clearTimeout(toastTimer);$('#toast').hidden=true;}
function ghostTree(node){
 const box=document.createElement('div');box.className='ghost-node';
 const title=document.createElement('div');title.className='ghost-title';title.textContent=nameOf(node);box.append(title);
 if(node.children.length){const kids=document.createElement('div');kids.className='ghost-kids';node.children.forEach(c=>kids.append(ghostTree(c)));box.append(kids);}
 return box;
}
function placeGhost(x,y){
 const g=moving.ghost;g.style.transform=`translate(${x+10}px,${y}px) translateY(-50%) scale(${moving.ghostScale})`;
}
function pickDrop(x,y,source){
 const el=document.elementFromPoint(x,y)?.closest('.node');if(!el)return null;
 const target=findAny(el.dataset.id);if(!target)return null;
 if(isInside(source,target.id))return {el,invalid:true};
 const r=el.getBoundingClientRect(),rel=(y-r.top)/r.height,isRoot=isRootNode(target);
 return {el,target,zone:isRoot?'into':rel<.28?'before':rel>.72?'after':'into'};
}
function clearDropMarks(){
 document.querySelectorAll('.drop-into,.drop-invalid,.drop-opening,.drop-leaf').forEach(el=>el.classList.remove('drop-into','drop-invalid','drop-opening','drop-leaf'));
 $('#drop-line').hidden=true;$('#drop-link').hidden=true;
}
function markDrop(drop,x,y){
 clearDropMarks();if(!drop)return;
 if(drop.invalid){drop.el.classList.add('drop-invalid');return;}
 if(drop.zone==='into'){
  const r=drop.el.getBoundingClientRect(),hasKids=drop.target.children.length>0;
  drop.el.classList.add('drop-into');
  if(!hasKids)drop.el.classList.add('drop-leaf'); // pulsa: "vai conectar"
  if(hasKids&&!expanded.has(drop.target.id))drop.el.classList.add('drop-opening'); // vai abrir as filhas
  // linha tracejada animada do card alvo até o conjunto que está sendo carregado
  const x1=r.right,y1=r.top+r.height/2,x2=x+10,y2=y,dx=Math.max(40,Math.abs(x2-x1)/2);
  $('#drop-link path').setAttribute('d',`M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`);
  $('#drop-link').hidden=false;
  return;
 }
 const r=drop.el.getBoundingClientRect(),line=$('#drop-line');
 line.style.left=`${r.left}px`;line.style.width=`${r.width}px`;line.style.top=`${(drop.zone==='before'?r.top:r.bottom)-2}px`;line.hidden=false;
}
function refreshDrop(){
 if(!moving||!moving.active)return;
 const {x,y}=moving.pointer;
 moving.drop=pickDrop(x,y,moving.node);markDrop(moving.drop,x,y);
 const drop=moving.drop,target=drop&&!drop.invalid?drop.target:null;
 const free=!drop&&!!document.elementFromPoint(x,y)?.closest('#viewport');
 moving.ghost.classList.toggle('ghost-free',free);moving.ghost.dataset.free=isRootNode(moving.node)?t('dropReposition'):t('dropNewRoot');
 // pairar sobre um ramo fechado: abre as filhas dinamicamente
 const wantsOpen=target&&drop.zone==='into'&&target.children.length&&!expanded.has(target.id);
 if(wantsOpen){
  if(moving.dwellId!==target.id){
   clearTimeout(moving.dwellTimer);moving.dwellId=target.id;
   moving.dwellTimer=setTimeout(()=>{
    if(!moving||moving.dwellId!==target.id)return;
    expanded.add(target.id);moving.autoOpened.add(target.id);moving.dwellId=null;render();refreshDrop();
   },OPEN_DELAY);
  }
 }else{clearTimeout(moving.dwellTimer);moving.dwellId=null;}
 // ramos abertos sozinhos que ficaram para trás fecham de novo
 const keep=target?new Set([...ancestorIds(target.id),target.id]):new Set();
 for(const id of moving.autoOpened){
  if(keep.has(id)){clearTimeout(moving.closeTimers.get(id));moving.closeTimers.delete(id);continue;}
  if(moving.closeTimers.has(id))continue;
  moving.closeTimers.set(id,setTimeout(()=>{
   if(!moving)return;
   moving.closeTimers.delete(id);
   const cur=moving.drop&&!moving.drop.invalid?moving.drop.target:null;
   if(cur&&(cur.id===id||ancestorIds(cur.id).has(id)))return;
   expanded.delete(id);moving.autoOpened.delete(id);render();refreshDrop();
  },CLOSE_DELAY));
 }
}
function endMoveSession(){
 if(!moving)return;
 clearTimeout(moving.dwellTimer);moving.closeTimers.forEach(t=>clearTimeout(t));
 moving.ghost?.remove();clearDropMarks();hideToast();
 document.body.classList.remove('is-moving');
 document.removeEventListener('pointermove',onMoveDrag);document.removeEventListener('pointerup',onMoveEnd);document.removeEventListener('pointercancel',cancelMove);document.removeEventListener('keydown',onMoveKey);
 document.removeEventListener('mousedown',blockMiddle,true);document.removeEventListener('auxclick',blockMiddle,true);
}
function cancelMove(){
 if(!moving)return;
 const {active,startExpanded}=moving;endMoveSession();moving=null;
 if(active){expanded=startExpanded;render();}
}
function onMoveKey(e){if(e.key==='Escape'){e.preventDefault();cancelMove();}}
function blockMiddle(e){if(e.button===1)e.preventDefault();} // evita o autoscroll do botão do meio
function onMoveDrag(e){
 if(!moving)return;
 moving.pointer={x:e.clientX,y:e.clientY};
 if(!moving.active){
  if(Math.hypot(e.clientX-moving.x,e.clientY-moving.y)<5)return;
  moving.active=true;document.body.classList.add('is-moving');
  const ghost=document.createElement('div');ghost.className='drag-ghost';
  const below=countBelow(moving.node);
  ghost.append(ghostTree(moving.node));
  if(below){const badge=document.createElement('div');badge.className='ghost-count';badge.textContent=t('ideasCount',below+1);ghost.append(badge);}
  document.body.append(ghost);moving.ghost=ghost;
  const maxH=window.innerHeight*.7,maxW=window.innerWidth*.55;
  moving.ghostScale=Math.min(1,maxH/ghost.offsetHeight,maxW/ghost.offsetWidth);
  render(); // o conjunto "desplugou": sai do mapa e o layout se reorganiza
  showToast(t('dragHint'),false,60000);
 }
 if(e.buttons&4&&moving.lastX!==undefined){camera.x+=e.clientX-moving.lastX;camera.y+=e.clientY-moving.lastY;updateCamera();}
 moving.lastX=e.clientX;moving.lastY=e.clientY;
 placeGhost(e.clientX,e.clientY);
 refreshDrop();
}
function onMoveEnd(e){
 if(!moving)return;
 const {active,node,startExpanded,autoOpened}=moving;
 const drop=active?pickDrop(e.clientX,e.clientY,node):null;
 const overMap=active&&!drop&&!!document.elementFromPoint(e.clientX,e.clientY)?.closest('#viewport');
 endMoveSession();moving=null;
 if(overMap){placeAtPointer(node,e.clientX,e.clientY,startExpanded);return;}
 if(!(active&&drop&&!drop.invalid)){if(active){expanded=startExpanded;render();}return;}
 // mantém abertos só os ancestrais do destino; o resto que abriu sozinho volta a fechar
 const keep=new Set([...ancestorIds(drop.target.id),drop.target.id]);
 for(const id of autoOpened)if(!keep.has(id))expanded.delete(id);
 moveNode(node,drop,startExpanded);
}
function placeAtPointer(node,clientX,clientY,startExpanded){
 const v=viewport.getBoundingClientRect(),at={x:Math.round((clientX-v.left-camera.x)/camera.scale),y:Math.round((clientY-v.top-camera.y)/camera.scale)-30};
 const before={tree:JSON.stringify(roots),expanded:[...(startExpanded||expanded)]};
 if(isRootNode(node)){node.x=at.x;node.y=at.y;}else detachNode(node,at);
 if(JSON.stringify(roots)===before.tree){render();return;}
 lastMove=before;commit();render();revealNode(node.id);
 showToast(isRootNode(node)&&roots.length>1&&roots.indexOf(node)>0?t('becameRoot',nameOf(node)):t('repositioned',nameOf(node)),true);
}
function startMove(e,node,el){
 if(e.button!==0||moving)return;
 e.preventDefault();e.stopPropagation();
 moving={node,el,x:e.clientX,y:e.clientY,pointer:{x:e.clientX,y:e.clientY},active:false,drop:null,ghost:null,ghostScale:1,startExpanded:new Set(expanded),autoOpened:new Set(),closeTimers:new Map(),dwellId:null,dwellTimer:0};
 document.addEventListener('pointermove',onMoveDrag);document.addEventListener('pointerup',onMoveEnd);document.addEventListener('pointercancel',cancelMove);document.addEventListener('keydown',onMoveKey);
 document.addEventListener('mousedown',blockMiddle,true);document.addEventListener('auxclick',blockMiddle,true);
}
function revealNode(id){
 const el=document.querySelector(`[data-id="${id}"]`);if(!el)return;
 el.classList.add('just-moved');setTimeout(()=>el.classList.remove('just-moved'),1400);
 const r=el.getBoundingClientRect(),v=viewport.getBoundingClientRect();
 if(r.left<v.left||r.right>v.right||r.top<v.top||r.bottom>v.bottom){
  camera.x+=v.left+v.width/2-(r.left+r.width/2);camera.y+=v.top+v.height/2-(r.top+r.height/2);updateCamera();
 }
}
function moveNode(source,drop,startExpanded){
 const before={tree:JSON.stringify(roots),expanded:[...(startExpanded||expanded)]};
 const oldParent=parentAny(source.id);
 if(oldParent){oldParent.children.splice(oldParent.children.indexOf(source),1);if(!oldParent.children.length)expanded.delete(oldParent.id);}
 else{roots.splice(roots.indexOf(source),1);delete source.x;delete source.y;} // uma raiz passa a ser filha de outro card
 if(drop.zone==='into'){drop.target.children.push(source);expanded.add(drop.target.id);}
 else{
  const parent=parentAny(drop.target.id);
  parent.children.splice(parent.children.indexOf(drop.target)+(drop.zone==='after'?1:0),0,source);
 }
 if(JSON.stringify(roots)===before.tree){render();return;} // soltou no mesmo lugar
 lastMove=before;commit();render();revealNode(source.id);
 const below=countBelow(source);
 showToast(t('moved',nameOf(source),below),true);
}
function undoMove(){
 if(!lastMove)return;
 roots=doc.roots=JSON.parse(lastMove.tree);expanded=new Set(lastMove.expanded);lastMove=null;
 hideToast();commit();render();
}

/* Renderização */
function render(){
 cancelMotion();
 const container=$('#nodes');container.replaceChildren();$('#connections').replaceChildren();
 const hidden=n=>!!(moving&&moving.active&&isInside(moving.node,n.id));
 const visible=roots.flatMap(r=>visibleNodes(r,expanded)).filter(n=>!hidden(n)), elements=new Map(), depths=new Map();
 colors=new Map();
 const assign=(node,depth,color)=>{depths.set(node.id,depth);colors.set(node.id,color);node.children.forEach((c,i)=>assign(c,depth+1,depth===0?(c.color||PALETTE[i%PALETTE.length]):color));};
 roots.forEach(root=>assign(root,0,ROOT_COLOR));
 for(const node of visible){
  const depth=depths.get(node.id),isRoot=depth===0;
  const el=document.createElement('section');el.className=`node ${isRoot?'root':node.children.length?'branch':'leaf'}`;el.dataset.id=node.id;el.style.setProperty('--branch',colors.get(node.id));
  el.addEventListener('pointerenter',()=>hoverEdge(node.id,true));el.addEventListener('pointerleave',()=>hoverEdge(node.id,false));
  const images=imagesOf(node);
  if(images.length){el.classList.add('has-image');images.forEach((image,i)=>el.append(imageItem(node,image,i)));}
  const text=document.createElement(isRoot?'h1':'p');el.append(text);
  const titled=node.title.trim().length>0;
  if(!titled&&!editing){text.hidden=true;el.classList.add('no-title');}
  if(editing){
   text.contentEditable='plaintext-only';text.spellcheck=false;text.textContent=node.title;text.setAttribute('aria-label',t('ideaText'));text.dataset.placeholder=t('titlePlaceholder');
   text.addEventListener('input',()=>{node.title=text.textContent;commit();});
   text.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();text.blur();}});
   text.addEventListener('blur',()=>{
    const hasContent=imagesOf(node).length>0||!!(node.subtitle&&node.subtitle.trim());
    if(!node.title.trim()&&(isRoot||!hasContent)){node.title=t('newIdea');text.textContent=node.title;commit();}
   });
  }
  if(node.children.length){
   const change=selector=>{const before=snapshot(camera),oldY=parseFloat(el.style.top)+el.offsetHeight/2,opening=!expanded.has(node.id);opening?expanded.add(node.id):expanded.delete(node.id);render();const next=document.querySelector(`[data-id="${node.id}"]`);camera.y+=(oldY-(parseFloat(next.style.top)+next.offsetHeight/2))*camera.scale;updateCamera();next.querySelector(selector)?.focus({preventScroll:true});animateLayout(before,camera,node.id,opening?node.children[0]?.id:null);};
   if(!editing){
    if(titled){const title=document.createElement('button');title.className='node-title';title.textContent=node.title;title.setAttribute('aria-expanded',String(expanded.has(node.id)));title.onclick=()=>change('.node-title');text.append(title);}
   }
   const open=expanded.has(node.id);
   const toggle=document.createElement('button');toggle.className=open?'toggle':'toggle is-collapsed';toggle.innerHTML=`<span class="toggle-stack" aria-hidden="true">${open?'':'<i></i><i></i>'}<b>${open?MINUS:CHEVRON}</b></span>`;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?t('collapse',nameOf(node)):t('expand',nameOf(node)));toggle.title=open?t('collapseChildren'):t('expandChildren');toggle.onclick=()=>change('.toggle');el.append(toggle);
  }else if(!editing)text.textContent=node.title;
  if(editing||node.subtitle){
   const hint=document.createElement('div');hint.className='node-subtitle';
   if(editing){
    hint.contentEditable='plaintext-only';hint.spellcheck=false;hint.textContent=node.subtitle||'';
    hint.dataset.placeholder=t('subtitlePlaceholder');hint.setAttribute('aria-label',t('ideaSubtitle'));
    hint.addEventListener('input',()=>{if(hint.textContent.trim())node.subtitle=hint.textContent;else delete node.subtitle;commit();});
    hint.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();hint.blur();}});
   }else hint.textContent=node.subtitle;
   el.append(hint);
  }
  const links=linksOf(node);
  if(images.length||links.length){
   const row=document.createElement('div');row.className='node-badges';
   if(images.length)row.append(imageBadge(node));
   if(links.length)row.append(editing?linkChips(node):linkBadge(node));
   el.append(row);
  }
  if(editing){
   editControls(el,node,depth);enableDrop(el,node);
   if(!isRoot||roots.length>1){
    const grip=document.createElement('button');grip.type='button';grip.className='drag-handle';grip.innerHTML=GRIP;
    grip.title=isRoot?t('gripRoot'):t('gripNode');grip.setAttribute('aria-label',t('moveNode',nameOf(node)));
    grip.addEventListener('pointerdown',e=>startMove(e,node,el));el.append(grip);
   }
  }
  container.append(el);elements.set(node.id,el);
 }


 // Layout de cada árvore (colunas por profundidade; cada pai centralizado nas filhas visíveis) e posição livre de cada raiz.
 const kidsOf=n=>expanded.has(n.id)?n.children.filter(c=>!hidden(c)):[];
 const gapFor=n=>depths.get(n.id)===0?42:22;
 const layoutTree=root=>{
  const nodes=visibleNodes(root,expanded).filter(n=>!hidden(n)),heights=new Map(),local=new Map();
  const colW=[];for(const n of nodes){const d=depths.get(n.id);colW[d]=Math.max(colW[d]||0,elements.get(n.id).offsetWidth);}
  const colX=[0];for(let d=1;d<colW.length;d++)colX[d]=colX[d-1]+colW[d-1]+GAP;
  const measure=n=>{const kids=kidsOf(n),own=elements.get(n.id).offsetHeight;kids.forEach(measure);const group=kids.reduce((a,k)=>a+heights.get(k.id),0)+gapFor(n)*Math.max(0,kids.length-1);heights.set(n.id,Math.max(own,group));heights.set(`${n.id}:group`,group);return heights.get(n.id);};
  const total=measure(root);
  const place=(n,top)=>{
   const kids=kidsOf(n),own=elements.get(n.id).offsetHeight,height=heights.get(n.id),group=heights.get(`${n.id}:group`);
   local.set(n.id,{x:colX[depths.get(n.id)],y:top+(height-own)/2});
   let ky=top+(height-group)/2;for(const k of kids){place(k,ky);ky+=heights.get(k.id)+gapFor(n);}
  };
  place(root,0);
  return {local,total,rootY:local.get(root.id).y};
 };
 const positions=new Map(),trees=[];let stackBottom=0;
 for(const root of roots){
  if(!elements.has(root.id))continue;
  const L=layoutTree(root),manual=Number.isFinite(root.x)&&Number.isFinite(root.y);
  const ox=manual?root.x:0,oy=manual?root.y-L.rootY:stackBottom; // sem posição salva: empilha abaixo das anteriores
  let w=0;for(const [id,p] of L.local){const el=elements.get(id);w=Math.max(w,p.x+el.offsetWidth+(el.querySelector('.toggle')?40:0));}
  trees.push({L,ox,oy,w,h:L.total,dx:0,dy:0,ax:ox,ay:oy+L.rootY}); // ax, ay: onde está o card raiz (âncora) na posição salva
  stackBottom=Math.max(stackBottom,oy+L.total+120);
 }
 // Se árvores abertas se sobrepõem, uma delas se afasta (só visualmente, nada é salvo) e volta à origem ao recolher.
 // A ordem original entre os cards raiz é preservada: quem estava abaixo (ou à direita) continua abaixo (ou à direita) e é quem se afasta.
 const MARGIN=80,hits=(a,b)=>a.x<b.x+b.w+MARGIN&&b.x<a.x+a.w+MARGIN&&a.y<b.y+b.h+MARGIN&&b.y<a.y+a.h+MARGIN;
 const boxOf=T=>({x:T.ox+T.dx,y:T.oy+T.dy,w:T.w,h:T.h});
 for(let guard=0;guard<200;guard++){
  let moved=false;
  search:for(let i=0;i<trees.length;i++)for(let j=i+1;j<trees.length;j++){
   const A=trees[i],B=trees[j],a=boxOf(A),b=boxOf(B);
   if(!hits(a,b))continue;
   const dyAnchor=B.ay-A.ay,dxAnchor=B.ax-A.ax;
   if(Math.abs(dyAnchor)>=Math.abs(dxAnchor)){ // relação vertical: o que estava abaixo continua abaixo
    const [first,second]=dyAnchor>=0?[a,B]:[b,A];second.dy+=first.y+first.h+MARGIN-boxOf(second).y;
   }else{ // relação horizontal: o que estava à direita continua à direita
    const [first,second]=dxAnchor>=0?[a,B]:[b,A];second.dx+=first.x+first.w+MARGIN-boxOf(second).x;
   }
   moved=true;break search;
  }
  if(!moved)break;
 }
 for(const T of trees)for(const [id,p] of T.L.local)positions.set(id,{x:p.x+T.ox+T.dx,y:p.y+T.oy+T.dy});
 for(const [id,p] of positions){const el=elements.get(id);el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;}
 for(const el of elements.values())el.style.setProperty('--base-h',`${el.offsetHeight}px`);

 function connect(parent,child,color){
  const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path');path.dataset.parent=parent.id;path.dataset.child=child.id;path.style.color=color;
  if(depths.get(parent.id)===0){
   const grad=document.createElementNS(ns,'linearGradient');grad.id=`fade-${child.id}`;grad.setAttribute('gradientUnits','userSpaceOnUse');
   for(const [offset,opacity] of [['0%','.04'],['100%','1']]){const stop=document.createElementNS(ns,'stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);stop.setAttribute('stop-opacity',opacity);grad.append(stop);}
   $('#connections').append(grad);path.setAttribute('stroke',`url(#fade-${child.id})`);
  }else path.setAttribute('stroke',color);
  $('#connections').append(path);
 }
 for(const node of visible)for(const kid of kidsOf(node))connect(node,kid,node.linksColor||colors.get(kid.id));
 updateEdges();
 if(positions.size){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [id,p] of positions){const el=elements.get(id);minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x+el.offsetWidth+(el.querySelector('.toggle')?40:0));maxY=Math.max(maxY,p.y+el.offsetHeight);}
  bounds={x:minX,y:minY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)};
 }
 updateCamera();
}

function buildReading(){
 const article=$('#reading');article.replaceChildren();
 const intro=document.createElement('span');intro.className='eyebrow';intro.textContent=t('linearReading');article.append(intro);
 const walk=(node,depth)=>{
  if(node.title.trim()){const h=document.createElement(depth===0?'h1':depth===1?'h2':'h3');h.textContent=node.title;if(depth===1)h.style.color=colors.get(node.id);article.append(h);}
  if(node.subtitle){const sp=document.createElement('p');sp.className='reading-subtitle';sp.textContent=node.subtitle;article.append(sp);}
  imagesOf(node).forEach(image=>article.append(imageFor(image)));
  if(linksOf(node).length){const row=document.createElement('div');row.className='reading-links';linksOf(node).forEach(l=>row.append(anchorFor(l,'reading-link')));article.append(row);}
  node.children.forEach(c=>walk(c,depth+1));
 };
 roots.forEach(root=>walk(root,0));
}

/* Apresentações */
function setEditing(on){
 editing=on;document.body.classList.toggle('is-editing',on);$('#edit-switch').setAttribute('aria-checked',String(on));render();
}
async function refreshMenu(){
 const list=await store.list(),menu=$('#doc-list');menu.replaceChildren();
 const addItem=item=>{
  const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=item.title;b.dataset.id=item.id;if(item.folder)b.title=`${item.folder}`;if(item.id===doc.id)b.setAttribute('aria-current','true');
  b.onclick=()=>{closeMenu();if(item.id!==doc.id)openDoc(item.id);};menu.append(b);
 };
 list.filter(item=>!item.folder).forEach(addItem);
 const folders=new Map();list.filter(item=>item.folder).forEach(item=>{if(!folders.has(item.folderKey))folders.set(item.folderKey,{label:item.folderLabel,dir:item.folder,items:[]});folders.get(item.folderKey).items.push(item);});
 for(const [key,folder] of folders){
  const head=document.createElement('div');head.className='doc-folder';head.title=folder.dir;head.setAttribute('role','presentation');
  const name=document.createElement('span');name.textContent=`📁 ${folder.label}`;
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',t('removeFolder',folder.label));remove.title=t('removeFolderTitle');
  remove.onclick=async e=>{e.stopPropagation();try{await store.removeLibrary(key);await refreshMenu();}catch{setStatus(t('removeFolderError'),'error');}};
  head.append(name,remove);menu.append(head);folder.items.forEach(addItem);
 }
}
let menuTicket=0;
function closeMenu(){menuTicket++;$('#doc-menu').hidden=true;$('#doc-button').setAttribute('aria-expanded','false');}
async function openDoc(id){
 await flush();
 useDoc(normalizeDoc(await store.load(id)));
 history.replaceState(null,'',`?p=${encodeURIComponent(id)}`);
 showDocTitle();
 setStatus(t('saved'),'saved');render();fit();
}
async function newDoc(){
 const title=prompt(t('newPresPrompt'),t('newPres'));if(!title)return;
 const created=await store.create(title);await openDoc(created.id);if(!editing)setEditing(true);
}
/* Salvar como: escolhe nome e pasta (biblioteca do app ou qualquer pasta da máquina) e se abre a nova apresentação */
let saveDialog=null;
async function openSaveDialog(presetMode){
 if(!doc.id||saveDialog)return;
 const modal=$('#saveas-modal'),name=$('#saveas-name'),folder=$('#saveas-folder'),custom=$('#saveas-custom'),pathInput=$('#saveas-path'),error=$('#saveas-error'),submit=$('#saveas-submit'),opener=document.activeElement;
 $('#saveas-heading').textContent=presetMode==='stay'?t('saveCopy'):t('saveAs');
 name.value=`${doc.title} (${t('copySuffix')})`;error.textContent='';pathInput.value='';custom.hidden=true;submit.disabled=false;
 modal.querySelector(`input[name="saveas-mode"][value="${presetMode}"]`).checked=true;
 let libs=[];try{libs=await store.libraries();}catch{}
 folder.replaceChildren();
 for(const lib of libs.filter(l=>l.main)){const o=document.createElement('option');o.value='';o.textContent=`${t('mainLibrary')} (presentations/)`;folder.append(o);}
 for(const lib of libs.filter(l=>!l.main)){const o=document.createElement('option');o.value=lib.dir;o.textContent=`${lib.label} — ${lib.dir}`;folder.append(o);}
 const other=document.createElement('option');other.value='__other';other.textContent=t('otherFolder');folder.append(other);
 folder.onchange=()=>{custom.hidden=folder.value!=='__other';if(!custom.hidden)pathInput.focus();};
 const close=()=>{modal.hidden=true;saveDialog=null;document.removeEventListener('keydown',onKey);opener?.focus?.({preventScroll:true});};
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
 $('#saveas-close').onclick=close;$('#saveas-cancel').onclick=close;
 $('#saveas-pick').onclick=async()=>{ // janela nativa de escolha de pasta (o servidor roda nesta máquina)
  error.textContent=t('pickerWaiting');
  try{const {path:picked}=await store.pickFolder();error.textContent='';if(picked)pathInput.value=picked;}
  catch(e){error.textContent=e.status===501?t('pickerUnavailable'):t('pickerFailed');}
 };
 $('#saveas-form').onsubmit=async e=>{
  e.preventDefault();
  const title=name.value.trim();if(!title){error.textContent=t('enterName');name.focus();return;}
  const dir=folder.value==='__other'?pathInput.value.trim():folder.value;
  if(folder.value==='__other'&&!dir){error.textContent=t('enterFolder');pathInput.focus();return;}
  const mode=modal.querySelector('input[name="saveas-mode"]:checked').value;
  submit.disabled=true;error.textContent='';
  try{
   await flush(); // garante que tudo que está na tela já foi gravado antes de copiar
   const created=await store.copy(doc.id,title,dir||undefined);
   close();
   const where=created.id.includes('~')?t('inFolder',dir):t('inLibrary');
   if(mode==='open'){await openDoc(created.id);showToast(t('nowIn',created.title,where),false,6000);}
   else showToast(t('copySaved',created.title,where),false,6000);
  }catch(err){error.textContent=err.message&&!/^\d+$/.test(err.message)?err.message:t('copyError');submit.disabled=false;}
 };
 modal.hidden=false;saveDialog=true;document.addEventListener('keydown',onKey);name.focus();name.select();
}
const saveCopy=switchTo=>openSaveDialog(switchTo?'open':'stay');
async function addFolder(){ // registra uma pasta existente para listar e editar as apresentações que há nela
 try{
  const {path:picked}=await store.pickFolder();
  if(!picked)return;
  await store.addLibrary(picked);await refreshMenu();showToast(t('folderAdded',picked),false,4000);
 }catch(e){
  const typed=prompt(t('folderPrompt'));
  if(typed&&typed.trim()){try{await store.addLibrary(typed.trim());await refreshMenu();}catch(err){showToast(err.message||t('invalidFolder'),false,4000);}}
 }
}
async function deleteDoc(){
 if(!confirm(t('confirmDeletePres',doc.title)))return;
 await store.remove(doc.id);doc={...doc,id:null};
 const list=await store.list();
 if(list.length)await openDoc(list[0].id);else{const created=await store.create(t('newPres'));await openDoc(created.id);}
}
async function initStore(){
 if(!await store.available())return false;
 const list=await store.list();
 const wanted=new URLSearchParams(location.search).get('p');
 const id=list.some(i=>i.id===wanted)?wanted:list[0]?.id;
 if(!id)return false;
 useDoc(normalizeDoc(await store.load(id)));
 document.body.classList.add('has-store');showDocTitle();setStatus(t('saved'),'saved');
 return true;
}

/* Controles */
$('#expand').onclick=()=>{expanded=roots.reduce((set,r)=>new Set([...set,...allBranches(r)]),new Set());render();fit();};
$('#collapse').onclick=()=>{expanded=new Set(roots.map(r=>r.id));render();fit();};
$('#fit').onclick=fit;$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);
$('#mode').onclick=()=>{reading=!reading;if(reading)buildReading();viewport.hidden=reading;$('#reading').hidden=!reading;for(const id of ['tree-controls','zoom-controls','edit-switch','add-root'])$('#'+id).hidden=reading;$('#mode-label').textContent=reading?t('mindMap'):t('textMode');$('#mode').setAttribute('aria-pressed',String(reading));};
$('#edit-switch').onclick=()=>setEditing(!editing);
$('#add-root').onclick=addRoot;
/* Nome da apresentação (separado do texto dos cards raiz): duplo clique no menu do topo */
function editDocTitle(){
 if(!doc.id||$('.doc-title-input'))return;
 closeMenu();
 const button=$('#doc-button'),input=document.createElement('input');input.className='doc-title-input';input.value=doc.title;input.setAttribute('aria-label',t('presName'));input.maxLength=120;
 input.style.width=`${Math.max(button.offsetWidth,200)}px`;input.style.height=`${button.offsetHeight}px`;
 const note=document.createElement('div');note.className='doc-title-error';note.setAttribute('role','alert');note.hidden=true;
 $('#doc-bar').append(input,note);input.focus();input.select();
 let done=false,busy=false;
 const close=()=>{done=true;input.remove();note.remove();};
 const finish=async mode=>{ // mode: 'enter' | 'blur' | 'cancel'
  if(done||busy)return;
  const value=input.value.trim();
  if(mode==='cancel'||!value||value===doc.title){close();return;}
  busy=true;
  let clash=false;
  try{clash=(await store.list()).some(item=>item.id!==doc.id&&String(item.title).trim().toLowerCase()===value.toLowerCase());}catch{}
  busy=false;
  if(done)return;
  if(clash){
   if(mode==='enter'){note.textContent=t('nameTaken');note.hidden=false;input.classList.add('is-invalid');input.focus();return;}
   close();showToast(t('nameKept',value,doc.title),false,5000);return;
  }
  close();doc.title=value;showDocTitle();commit();
 };
 input.addEventListener('input',()=>{note.hidden=true;input.classList.remove('is-invalid');});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish('enter');}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish('cancel');}});
 input.addEventListener('blur',()=>finish('blur'));
}
$('#doc-button').addEventListener('dblclick',editDocTitle);
$('#toast-undo').onclick=undoMove;
/* Tela cheia do navegador: o mapa continua igual, só ganha toda a tela */
const fullscreenButton=$('#fullscreen');
if(!document.fullscreenEnabled)fullscreenButton.hidden=true;
fullscreenButton.onclick=()=>{
 if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
 else document.documentElement.requestFullscreen().catch(()=>{});
};
document.addEventListener('fullscreenchange',()=>{
 const on=!!document.fullscreenElement;
 fullscreenButton.setAttribute('aria-pressed',String(on));
 $('#fullscreen-label').textContent=on?t('exitFullscreen'):t('fullscreen');
 fullscreenButton.title=on?t('exitFullscreen'):t('fullscreen');
});
$('#doc-button').onclick=async()=>{ // fechar/editar invalida uma abertura que ainda está carregando a lista
 const menu=$('#doc-menu');
 if(menu.hidden){const ticket=++menuTicket;await refreshMenu();if(ticket!==menuTicket)return;menu.hidden=false;$('#doc-button').setAttribute('aria-expanded','true');}
 else closeMenu();
};
$('#doc-new').onclick=()=>{closeMenu();newDoc();};
$('#doc-addfolder').onclick=()=>{closeMenu();addFolder();};
$('#doc-saveas').onclick=()=>{closeMenu();saveCopy(true);};
$('#doc-copy').onclick=()=>{closeMenu();saveCopy(false);};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='s'&&doc.id){e.preventDefault();saveCopy(true);}});
$('#doc-delete').onclick=()=>{closeMenu();deleteDoc();};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#doc-bar'))closeMenu();if(!e.target.closest('.node-badges'))closeLinkMenus();});
window.addEventListener('beforeunload',()=>{if(doc.id&&saveTimer)flush();});
$('#close-dialog').onclick=e=>{e.stopPropagation();$('dialog').close();};$('dialog').addEventListener('click',()=>$('dialog').close());
$('#lightbox-prev').onclick=e=>{e.stopPropagation();stepGallery(-1);};
$('#lightbox-next').onclick=e=>{e.stopPropagation();stepGallery(1);};
$('dialog').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();stepGallery(-1);}if(e.key==='ArrowRight'){e.preventDefault();stepGallery(1);}});
viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
viewport.addEventListener('dragstart',e=>{if(!e.target.closest?.('.image-item'))e.preventDefault();});
let drag=null;
viewport.addEventListener('mousedown',e=>{if(e.button===1)e.preventDefault();}); // sem o autoscroll do botão do meio
viewport.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
viewport.addEventListener('pointerdown',e=>{const middle=e.button===1;if(moving||(e.button!==0&&!middle)||(!middle&&e.target.closest('button,input,a,[contenteditable]')))return;if(middle)e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY,camera:{...camera}};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;camera.x=drag.camera.x+e.clientX-drag.x;camera.y=drag.camera.y+e.clientY-drag.y;updateCamera();});
function stopDrag(){drag=null;viewport.classList.remove('dragging');}
viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);viewport.addEventListener('lostpointercapture',stopDrag);
window.addEventListener('resize',()=>{if(!reading)fit();});

await initStore();
roots.forEach(migrate);
render();fit();
