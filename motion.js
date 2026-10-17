const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let frame=0, timer=0;
export function cancelMotion(){cancelAnimationFrame(frame);clearTimeout(timer);document.querySelectorAll('.is-presenting').forEach(e=>e.classList.remove('is-presenting'));}
export function snapshot(camera){return {camera:{...camera},nodes:new Map([...document.querySelectorAll('.node')].map(e=>[e.dataset.id,{x:parseFloat(e.style.left),y:parseFloat(e.style.top)}]))};}
const edgeListeners=[];
export const onEdges=fn=>edgeListeners.push(fn);
export function updateEdges(){
 for(const path of document.querySelectorAll('#connections path')){
  const parent=document.querySelector(`[data-id="${path.dataset.parent}"]`),child=document.querySelector(`[data-id="${path.dataset.child}"]`);
  const x1=parseFloat(parent.style.left)+parent.offsetWidth,y1=parseFloat(parent.style.top)+parent.offsetHeight/2;
  const x2=parseFloat(child.style.left),y2=parseFloat(child.style.top)+child.offsetHeight/2;
  const dy=y2-y1,s=Math.sign(dy),r=Math.min(21,Math.abs(dy)/2,(x2-x1)/4),tx=x1+Math.min(21,(x2-x1)/2);
  path.setAttribute('d',`M${x1},${y1} H${tx-r} Q${tx},${y1} ${tx},${y1+s*r} V${y2-s*r} Q${tx},${y2} ${tx+r},${y2} H${x2}`);
  const grad=document.getElementById(`fade-${path.dataset.child}`);
  if(grad){grad.setAttribute('x1',x1);grad.setAttribute('y1',y1);grad.setAttribute('x2',x2);grad.setAttribute('y2',y2);}
 }
 for(const fn of edgeListeners)fn();
}
export function hoverEdge(id,on){document.querySelector(`#connections path[data-child="${id}"]`)?.classList.toggle('is-hovered',on);}
export function animateLayout(before,camera,parentId,firstChild){
 const nodes=[...document.querySelectorAll('.node')];
 const parent=document.querySelector(`[data-id="${parentId}"]`);
 const fromParent={x:parseFloat(parent.style.left)+parent.offsetWidth,y:parseFloat(parent.style.top)+parent.offsetHeight/2};
 const items=nodes.map(el=>({el,to:{x:parseFloat(el.style.left),y:parseFloat(el.style.top)},from:before.nodes.has(el.dataset.id)?{x:before.nodes.get(el.dataset.id).x+(before.camera.x-camera.x)/camera.scale,y:before.nodes.get(el.dataset.id).y+(before.camera.y-camera.y)/camera.scale}:fromParent,fresh:!before.nodes.has(el.dataset.id)}));
 const paint=t=>{const ease=1-(1-t)**3;for(const {el,from,to,fresh} of items){el.style.left=`${from.x+(to.x-from.x)*ease}px`;el.style.top=`${from.y+(to.y-from.y)*ease}px`;el.style.opacity=fresh?String(ease):'1';}updateEdges();};
 if(!reduced()){
  const start=performance.now();paint(0);
  const tick=now=>{const t=Math.min(1,(now-start)/420);paint(t);if(t<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
 }
 if(firstChild){
  const path=document.querySelector(`#connections path[data-child="${firstChild}"]`);
  if(path){path.setAttribute('pathLength','1');path.classList.add('is-presenting');timer=setTimeout(()=>path.classList.remove('is-presenting'),1000);}
 }
}
