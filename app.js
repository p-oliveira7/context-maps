import {tree as seed,visibleNodes,allBranches,zoomAt,parentOf,findNode,newId,PALETTE} from './model.js?v=10';
import {cancelMotion,snapshot,animateLayout,hoverEdge,updateEdges} from './motion.js?v=10';
import * as store from './store.js?v=10';
const $=s=>document.querySelector(s), viewport=$('#viewport'), world=$('#world');
const ROOT_COLOR='#a7a7b8', GAP=64;
let doc={id:null,tree:seed}, tree=seed, expanded=new Set(['root']), camera={x:0,y:0,scale:1}, reading=false, editing=false, bounds={width:1,height:1};
let colors=new Map(), saveTimer=0, saving=Promise.resolve();

function updateCamera(){world.style.transform=`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;$('#zoom-level').textContent=`${Math.round(camera.scale*100)}%`;}
function fit(){const side=40,top=40,bottom=100,availH=viewport.clientHeight-top-bottom;camera.scale=Math.max(.1,Math.min(1,(viewport.clientWidth-side*2)/bounds.width,availH/bounds.height));camera.x=(viewport.clientWidth-bounds.width*camera.scale)/2;camera.y=top+(availH-bounds.height*camera.scale)/2;updateCamera();}
function zoom(factor,p={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){camera=zoomAt(camera,factor,p);updateCamera();}

/* Imagens e diagramas: cada ideia pode ter várias (node.images) */
const imagesOf=node=>node.images||[];
const nameOf=n=>(n.title&&n.title.trim())||(n.subtitle&&n.subtitle.trim())||'ideia sem título';
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
 button.setAttribute('aria-label',node.id===tree.id&&index===0?'Ampliar ilustração':`Ampliar imagem: ${nameOf(node)}${suffix}`);button.append(imageFor(image));
 if(image.kind==='diagram')button.classList.add('is-diagram');
 button.onclick=()=>openImage(node,index);return button;
}
function imageBadge(node){
 const count=imagesOf(node).length,button=document.createElement('button');button.className='node-badge';
 button.setAttribute('aria-label',count>1?`Ver ${count} imagens: ${nameOf(node)}`:`Ver imagem: ${nameOf(node)}`);button.title=count>1?'Ver imagens':'Ver imagem';
 button.innerHTML=`<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.2" fill="currentColor"/><path d="m3 12 3.5-3.5 2.5 2.5 2-2 2 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>${count}`;
 button.onclick=()=>openImage(node,0);return button;
}
function imageItem(node,image,index){
 const button=imageButton(node,image,index);
 if(!editing)return button;
 const item=document.createElement('div');item.className='image-item';item.append(button);
 const tools=document.createElement('div');tools.className='image-tools';
 if(image.kind==='diagram'){
  const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.setAttribute('aria-label',`Editar diagrama: ${nameOf(node)}${imagesOf(node).length>1?` (${index+1})`:''}`);
  edit.onclick=()=>openDiagramEditor(node,index);tools.append(edit);
 }
 const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.className='danger';remove.setAttribute('aria-label',`Remover imagem: ${nameOf(node)}${imagesOf(node).length>1?` (${index+1})`:''}`);
 remove.onclick=()=>{node.images.splice(index,1);if(!node.images.length)delete node.images;commit();render();};
 const total=imagesOf(node).length,suffix=total>1?` (${index+1})`:'';
 if(total>1){
  // reordenar: alça (arrastar) + botões ↑ ↓
  const grip=document.createElement('button');grip.type='button';grip.className='img-grip';grip.textContent='⋮⋮';grip.title='Arraste para reordenar';grip.setAttribute('aria-label',`Reordenar imagem: ${nameOf(node)}${suffix}`);
  const up=document.createElement('button');up.type='button';up.textContent='↑';up.dataset.move='up';up.setAttribute('aria-label',`Mover imagem para cima: ${nameOf(node)}${suffix}`);up.disabled=index===0;
  const down=document.createElement('button');down.type='button';down.textContent='↓';down.dataset.move='down';down.setAttribute('aria-label',`Mover imagem para baixo: ${nameOf(node)}${suffix}`);down.disabled=index===total-1;
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
 button.innerHTML=`${LINK_ICON}${links.length} ${links.length===1?'link':'links'}`;
 button.title=links.length===1?links[0].url:'Links';
 button.setAttribute('aria-label',links.length===1?`Abrir link: ${linkLabel(links[0])}`:`Ver ${links.length} links: ${nameOf(node)}`);
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
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remover link: ${linkLabel(link)}`);
  remove.onclick=e=>{e.stopPropagation();node.links.splice(i,1);if(!node.links.length)delete node.links;commit();render();};
  chip.append(remove);wrap.append(chip);
 });
 return wrap;
}
function addLink(node){
 const raw=prompt('Endereço do link (https://…)');if(raw===null||!raw.trim())return;
 const url=safeUrl(raw);if(!url){setStatus('Link inválido (use http ou https)','error');return;}
 (node.links||=[]).push({url});commit();render();
}

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
function addBefore(node){
 const parent=parentOf(tree,node.id);if(!parent)return;
 const sibling={id:newId(),title:'Nova ideia',children:[]};parent.children.splice(parent.children.indexOf(node),0,sibling);commit();render();focusText(sibling.id);
}
function addParent(node){
 const parent=parentOf(tree,node.id);if(!parent)return;
 const wrapper={id:newId(),title:'Nova ideia',children:[node]};
 if(node.color){wrapper.color=node.color;delete node.color;}
 parent.children[parent.children.indexOf(node)]=wrapper;
 expanded.add(wrapper.id);commit();render();focusText(wrapper.id);
}
function removeNode(node){
 const parent=parentOf(tree,node.id);if(!parent)return;
 const count=(n)=>1+n.children.reduce((a,c)=>a+count(c),0);
 if(node.children.length&&!confirm(`Excluir "${nameOf(node)}" e ${count(node)-1} ideia(s) abaixo dela?`))return;
 parent.children.splice(parent.children.indexOf(node),1);
 if(!parent.children.length)expanded.delete(parent.id);
 commit();render();
}
async function addImages(node,files){
 try{
  for(const file of files){const src=await store.upload(doc.id,file);(node.images||=[]).push({src,alt:nameOf(node)});}
  commit();render();
 }catch{setStatus('Erro ao enviar imagem','error');commit();render();}
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
  if(images.length<files.length)setStatus('Só imagens são aceitas (png, jpg, webp, gif ou svg)','error');
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
 const el=document.createElement('div');el.id='color-panel';el.className='color-panel';el.setAttribute('role','dialog');el.setAttribute('aria-label',`Cor das ligações: ${nameOf(node)}`);
 el.innerHTML=`<div class="cp-head"><strong>Cor das ligações</strong><button type="button" class="cp-close" aria-label="Fechar">×</button></div>
  <div class="cp-step">1. Escolha a cor</div><div class="cp-swatches"></div>
  <label class="cp-custom">Outra cor <input type="color" class="color-input" aria-label="Cor personalizada" value="#4f9d7a"></label>
  <div class="cp-step">2. Aplicar em</div>
  <div class="cp-actions">
   <button type="button" data-scope="children" disabled><b>Só filhos diretos</b><span>${direct} ligaç${direct===1?'ão':'ões'} a partir deste card</span></button>
   <button type="button" data-scope="all" disabled><b>Toda a ramificação abaixo</b><span>${all} ligaç${all===1?'ão':'ões'} neste card e em todos abaixo</span></button>
  </div>`;
 const swatches=el.querySelector('.cp-swatches'),custom=el.querySelector('.color-input'),actions=[...el.querySelectorAll('[data-scope]')];
 const select=value=>{
  chosen=value;
  swatches.querySelectorAll('.cp-swatch').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.color||null)===value||(b.hasAttribute('data-default')&&value===null))));
  actions.forEach(b=>b.disabled=false);
 };
 const def=document.createElement('button');def.type='button';def.className='cp-swatch cp-default';def.dataset.default='';def.textContent='↺';def.title='Cor padrão';def.setAttribute('aria-label','Cor padrão');def.setAttribute('aria-pressed','false');
 def.onclick=()=>select(null);swatches.append(def);
 for(const color of SWATCHES){
  const b=document.createElement('button');b.type='button';b.className='cp-swatch';b.dataset.color=color;b.style.background=color;b.title=color;b.setAttribute('aria-label',`Cor ${color}`);b.setAttribute('aria-pressed','false');
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
 const items=[{icon:'↳',label:'Filho',aria:'Adicionar filho',run:()=>addChild(node)}];
 if(depth>0)items.push(
  {icon:'↧',label:'Irmão',aria:'Adicionar irmão',run:()=>addSibling(node)},
  {icon:'↥',label:'Antes',aria:'Inserir antes de',run:()=>addBefore(node)},
  {icon:'⇱',label:'Pai',aria:'Inserir pai de',run:()=>addParent(node)});
 items.push(
  {icon:'▣',label:'Imagem',aria:'Adicionar imagem',run:()=>picker.click()},
  {icon:'◇',label:'Diagrama',aria:'Adicionar diagrama',run:()=>openDiagramEditor(node,null)},
  {icon:'↗',label:'Link',aria:'Adicionar link',run:()=>addLink(node)});
 if(node.children.length)items.push({icon:'◐',label:'Cor linhas',aria:'Cor das ligações',run:()=>openColorPanel(anchor,node)});
 if(depth>0)items.push({icon:'✕',label:'Excluir',aria:'Excluir ideia',danger:true,run:()=>removeNode(node)});
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
 const center=document.createElement('button');center.type='button';center.className='radial-center';center.textContent='×';center.setAttribute('aria-label','Fechar menu de edição');
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
 fab.title='Editar: abre a roda de ações';fab.setAttribute('aria-label',`Editar: ${nameOf(node)}`);fab.setAttribute('aria-haspopup','menu');fab.setAttribute('aria-expanded','false');
 fab.onclick=e=>{e.stopPropagation();if(radial&&radial.card===card)closeRadial();else openRadial(fab,card,node,depth,picker);};
 card.append(fab);
}

/* Diagramas (Mermaid carregado sob demanda; o SVG renderizado é salvo como imagem do nó) */
const DEFAULT_DIAGRAM='flowchart TD\n  A[Início] --> B{Decisão}\n  B -->|Sim| C[Fim]\n  B -->|Não| A';
let mermaidReady=null, renderSeq=0;
function loadMermaid(){
 if(mermaidReady)return mermaidReady;
 mermaidReady=new Promise((ok,fail)=>{
  const s=document.createElement('script');s.src='vendor/mermaid.min.js?v=12.2.0';
  s.onload=()=>{
   const g=window.__esbuild_esm_mermaid_nm?.mermaid,m=window.mermaid||g?.default||g;
   if(!m?.render){mermaidReady=null;return fail(new Error('Mermaid indisponível'));}
   m.initialize({startOnLoad:false,theme:'dark',securityLevel:'strict'});ok(m);
  };
  s.onerror=()=>{mermaidReady=null;fail(new Error('Não foi possível carregar o Mermaid'));};
  document.head.append(s);
 });
 return mermaidReady;
}
async function renderDiagram(source){
 if(!source.trim())throw new Error('Escreva o código do diagrama');
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
 let svg=null,timer=0,seq=0;
 const current=index===null?null:node.images?.[index];
 ta.value=current?.kind==='diagram'&&current.source?current.source:DEFAULT_DIAGRAM;
 const close=()=>{modal.hidden=true;document.removeEventListener('keydown',onKey);clearTimeout(timer);ta.oninput=null;opener?.focus?.({preventScroll:true});};
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
 const update=async()=>{
  const mine=++seq;
  try{const out=await renderDiagram(ta.value);if(mine!==seq)return;svg=out;preview.innerHTML=out;error.textContent='';apply.disabled=false;}
  catch(e){if(mine!==seq)return;svg=null;apply.disabled=true;error.textContent=String(e.message||e).split('\n').slice(0,3).join(' ');}
 };
 ta.oninput=()=>{apply.disabled=true;clearTimeout(timer);timer=setTimeout(update,350);};
 $('#diagram-cancel').onclick=close;
 apply.onclick=async()=>{
  if(!svg)return;apply.disabled=true;
  try{
   const src=await store.upload(doc.id,new File([svg],'diagrama.svg',{type:'image/svg+xml'}));
   const entry={src,alt:`Diagrama: ${nameOf(node)}`,kind:'diagram',source:ta.value};
   if(current)node.images[index]=entry;else(node.images||=[]).push(entry);
   close();commit();render();
  }catch{error.textContent='Erro ao salvar o diagrama';apply.disabled=false;}
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
const ancestorIds=id=>{const out=new Set();let p=parentOf(tree,id);while(p){out.add(p.id);p=parentOf(tree,p.id);}return out;};
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
 const target=findNode(tree,el.dataset.id);if(!target)return null;
 if(isInside(source,target.id))return {el,invalid:true};
 const r=el.getBoundingClientRect(),rel=(y-r.top)/r.height,isRoot=target.id===tree.id;
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
  if(below){const badge=document.createElement('div');badge.className='ghost-count';badge.textContent=`${below+1} ideias`;ghost.append(badge);}
  document.body.append(ghost);moving.ghost=ghost;
  const maxH=window.innerHeight*.7,maxW=window.innerWidth*.55;
  moving.ghostScale=Math.min(1,maxH/ghost.offsetHeight,maxW/ghost.offsetWidth);
  render(); // o conjunto "desplugou": sai do mapa e o layout se reorganiza
  showToast('Botão do meio move o quadro · roda do mouse dá zoom · Esc cancela',false,60000);
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
 endMoveSession();moving=null;
 if(!(active&&drop&&!drop.invalid)){if(active){expanded=startExpanded;render();}return;}
 // mantém abertos só os ancestrais do destino; o resto que abriu sozinho volta a fechar
 const keep=new Set([...ancestorIds(drop.target.id),drop.target.id]);
 for(const id of autoOpened)if(!keep.has(id))expanded.delete(id);
 moveNode(node,drop,startExpanded);
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
 const before={tree:JSON.stringify(tree),expanded:[...(startExpanded||expanded)]};
 const oldParent=parentOf(tree,source.id);if(!oldParent)return;
 oldParent.children.splice(oldParent.children.indexOf(source),1);
 if(!oldParent.children.length)expanded.delete(oldParent.id);
 if(drop.zone==='into'){drop.target.children.push(source);expanded.add(drop.target.id);}
 else{
  const parent=parentOf(tree,drop.target.id);
  parent.children.splice(parent.children.indexOf(drop.target)+(drop.zone==='after'?1:0),0,source);
 }
 if(JSON.stringify(tree)===before.tree){render();return;} // soltou no mesmo lugar
 lastMove=before;commit();render();revealNode(source.id);
 const below=countBelow(source);
 showToast(`“${nameOf(source)}”${below?` e mais ${below} ideia(s)`:''} movido`,true);
}
function undoMove(){
 if(!lastMove)return;
 tree=doc.tree=JSON.parse(lastMove.tree);expanded=new Set(lastMove.expanded);lastMove=null;
 hideToast();commit();render();
}

/* Renderização */
function render(){
 cancelMotion();
 const container=$('#nodes');container.replaceChildren();$('#connections').replaceChildren();
 const hidden=n=>!!(moving&&moving.active&&isInside(moving.node,n.id));
 const visible=visibleNodes(tree,expanded).filter(n=>!hidden(n)), elements=new Map(), depths=new Map();
 colors=new Map();
 const assign=(node,depth,color)=>{depths.set(node.id,depth);colors.set(node.id,color);node.children.forEach((c,i)=>assign(c,depth+1,depth===0?(c.color||PALETTE[i%PALETTE.length]):color));};
 assign(tree,0,ROOT_COLOR);
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
   text.contentEditable='plaintext-only';text.spellcheck=false;text.textContent=node.title;text.setAttribute('aria-label','Texto da ideia');text.dataset.placeholder='Título (opcional)';
   text.addEventListener('input',()=>{node.title=text.textContent;commit();});
   text.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();text.blur();}});
   text.addEventListener('blur',()=>{
    const hasContent=imagesOf(node).length>0||!!(node.subtitle&&node.subtitle.trim());
    if(!node.title.trim()&&(isRoot||!hasContent)){node.title='Nova ideia';text.textContent=node.title;commit();}
   });
  }
  if(node.children.length){
   const change=selector=>{const before=snapshot(camera),oldY=parseFloat(el.style.top)+el.offsetHeight/2,opening=!expanded.has(node.id);opening?expanded.add(node.id):expanded.delete(node.id);render();const next=document.querySelector(`[data-id="${node.id}"]`);camera.y+=(oldY-(parseFloat(next.style.top)+next.offsetHeight/2))*camera.scale;updateCamera();next.querySelector(selector)?.focus({preventScroll:true});animateLayout(before,camera,node.id,opening?node.children[0]?.id:null);};
   if(!editing){
    if(titled){const title=document.createElement('button');title.className='node-title';title.textContent=node.title;title.setAttribute('aria-expanded',String(expanded.has(node.id)));title.onclick=()=>change('.node-title');text.append(title);}
   }
   const open=expanded.has(node.id);
   const toggle=document.createElement('button');toggle.className=open?'toggle':'toggle is-collapsed';toggle.innerHTML=`<span class="toggle-stack" aria-hidden="true">${open?'':'<i></i><i></i>'}<b>${open?MINUS:CHEVRON}</b></span>`;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${open?'Recolher':'Expandir'}: ${nameOf(node)}`);toggle.title=open?'Recolher filhos':'Expandir filhos';toggle.onclick=()=>change('.toggle');el.append(toggle);
  }else if(!editing)text.textContent=node.title;
  if(editing||node.subtitle){
   const hint=document.createElement('div');hint.className='node-subtitle';
   if(editing){
    hint.contentEditable='plaintext-only';hint.spellcheck=false;hint.textContent=node.subtitle||'';
    hint.dataset.placeholder='Subtítulo (aparece ao passar o mouse)';hint.setAttribute('aria-label','Subtítulo da ideia');
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
   if(!isRoot){
    const grip=document.createElement('button');grip.type='button';grip.className='drag-handle';grip.innerHTML=GRIP;
    grip.title='Arraste para mover este card e tudo abaixo dele';grip.setAttribute('aria-label',`Mover: ${nameOf(node)}`);
    grip.addEventListener('pointerdown',e=>startMove(e,node,el));el.append(grip);
   }
  }
  container.append(el);elements.set(node.id,el);
 }

 // Layout em colunas por profundidade; cada pai fica centralizado em relação aos filhos visíveis.
 const colW=[];for(const node of visible){const d=depths.get(node.id);colW[d]=Math.max(colW[d]||0,elements.get(node.id).offsetWidth);}
 const colX=[0];for(let d=1;d<colW.length;d++)colX[d]=colX[d-1]+colW[d-1]+GAP;
 const kidsOf=n=>expanded.has(n.id)?n.children.filter(c=>!hidden(c)):[], heights=new Map();
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
 for(const el of elements.values())el.style.setProperty('--base-h',`${el.offsetHeight}px`);

 function connect(parent,child,color){
  const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path');path.dataset.parent=parent.id;path.dataset.child=child.id;path.style.color=color;
  if(parent.id===tree.id){
   const grad=document.createElementNS(ns,'linearGradient');grad.id=`fade-${child.id}`;grad.setAttribute('gradientUnits','userSpaceOnUse');
   for(const [offset,opacity] of [['0%','.04'],['100%','1']]){const stop=document.createElementNS(ns,'stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',color);stop.setAttribute('stop-opacity',opacity);grad.append(stop);}
   $('#connections').append(grad);path.setAttribute('stroke',`url(#fade-${child.id})`);
  }else path.setAttribute('stroke',color);
  $('#connections').append(path);
 }
 for(const node of visible)for(const kid of kidsOf(node))connect(node,kid,node.linksColor||colors.get(kid.id));
 updateEdges();
 bounds={width:Math.max(...[...positions].map(([id,p])=>p.x+elements.get(id).offsetWidth+(elements.get(id).querySelector('.toggle')?40:0))),height:total};
 updateCamera();
}

function buildReading(){
 const article=$('#reading');article.replaceChildren();
 const intro=document.createElement('span');intro.className='eyebrow';intro.textContent='LEITURA LINEAR';article.append(intro);
 const walk=(node,depth)=>{
  if(node.title.trim()){const h=document.createElement(depth===0?'h1':depth===1?'h2':'h3');h.textContent=node.title;if(depth===1)h.style.color=colors.get(node.id);article.append(h);}
  if(node.subtitle){const sp=document.createElement('p');sp.className='reading-subtitle';sp.textContent=node.subtitle;article.append(sp);}
  imagesOf(node).forEach(image=>article.append(imageFor(image)));
  if(linksOf(node).length){const row=document.createElement('div');row.className='reading-links';linksOf(node).forEach(l=>row.append(anchorFor(l,'reading-link')));article.append(row);}
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
 doc=await store.load(id);migrate(doc.tree);tree=doc.tree;expanded=new Set([tree.id]);
 history.replaceState(null,'',`?p=${encodeURIComponent(id)}`);
 $('#doc-title').textContent=tree.title;document.title=`${tree.title} · Context Maps`;
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
 doc=await store.load(id);migrate(doc.tree);tree=doc.tree;expanded=new Set([tree.id]);
 document.body.classList.add('has-store');$('#doc-title').textContent=tree.title;document.title=`${tree.title} · Context Maps`;setStatus('Salvo','saved');
 return true;
}

/* Controles */
$('#expand').onclick=()=>{expanded=allBranches(tree);render();fit();};
$('#collapse').onclick=()=>{expanded=new Set([tree.id]);render();fit();};
$('#fit').onclick=fit;$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);
$('#mode').onclick=()=>{reading=!reading;if(reading)buildReading();viewport.hidden=reading;$('#reading').hidden=!reading;for(const id of ['tree-controls','zoom-controls','edit-switch'])$('#'+id).hidden=reading;$('#mode-label').textContent=reading?'Mapa mental':'Modo texto';$('#mode').setAttribute('aria-pressed',String(reading));};
$('#edit-switch').onclick=()=>setEditing(!editing);
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
 $('#fullscreen-label').textContent=on?'Sair da tela cheia':'Tela cheia';
 fullscreenButton.title=on?'Sair da tela cheia':'Tela cheia';
});
$('#doc-button').onclick=async()=>{const menu=$('#doc-menu');if(menu.hidden){await refreshMenu();menu.hidden=false;$('#doc-button').setAttribute('aria-expanded','true');}else closeMenu();};
$('#doc-new').onclick=()=>{closeMenu();newDoc();};
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
migrate(tree);
render();fit();
