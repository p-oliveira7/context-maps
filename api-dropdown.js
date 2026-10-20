/* APIs anexadas a um card: antes de abrir é só o símbolo do botão API; ao abrir, uma lista com a coleção/pasta e as requests.
   Clicar num item leva ao cliente de API naquele ponto. A lista é um popover fixo (fora do mapa), então não mexe no layout dos cards. */
let current=null; // {btn,pop,off}

export function closeApiDropdown(restoreFocus=false){
 if(!current)return;
 const {btn,pop,off}=current;current=null;off();pop.remove();btn.setAttribute('aria-expanded','false');
 if(restoreFocus&&btn.isConnected)btn.focus({preventScroll:true});
}

const NS='http://www.w3.org/2000/svg';
function icon(){ // o mesmo símbolo do botão API do rodapé
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 12 12');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS(NS,'path');
 path.setAttribute('d','M2 3.5 4.5 6 2 8.5M6 9h4');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');
 path.setAttribute('stroke-width','1.4');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
 svg.append(path);return svg;
}

/* data: {name,type,path,items:[{type,name,path,method,depth}],total,offline} — onPick(item) recebe {type,name,path} */
export function apiDropdown({title,label,t,readOnly,load,onPick}){
 const btn=document.createElement('button');
 btn.type='button';btn.className='api-dd';btn.title=title;btn.setAttribute('aria-label',label);
 btn.setAttribute('aria-haspopup','menu');btn.setAttribute('aria-expanded','false');
 btn.append(icon());
 btn.addEventListener('click',e=>{e.stopPropagation();if(current?.btn===btn)closeApiDropdown();else open();});
 btn.addEventListener('keydown',e=>{if((e.key==='ArrowDown')&&current?.btn!==btn){e.preventDefault();open();}});
 // os cliques no botão não podem virar arrasto/seleção do card
 btn.addEventListener('pointerdown',e=>e.stopPropagation());

 function open(){
  closeApiDropdown();
  const pop=document.createElement('div');
  pop.className='api-dd-pop';pop.setAttribute('role','menu');pop.setAttribute('aria-label',label);
  const loading=document.createElement('div');loading.className='api-dd-note';loading.textContent=t('apiDdLoading');pop.append(loading);
  document.body.append(pop);
  const place=()=>{
   const r=btn.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight,gap=6;
   pop.style.maxHeight=`${Math.max(140,Math.min(vh*.6,vh-24))}px`;
   const h=pop.offsetHeight,w=pop.offsetWidth;
   let top=r.bottom+gap;if(top+h>vh-8&&r.top-gap-h>8)top=r.top-gap-h; // sem espaço embaixo: abre para cima
   pop.style.top=`${Math.max(8,Math.min(top,vh-h-8))}px`;
   pop.style.left=`${Math.max(8,Math.min(r.left,vw-w-8))}px`;
  };
  const onDown=e=>{if(!pop.contains(e.target)&&!btn.contains(e.target))closeApiDropdown();};
  const onKey=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeApiDropdown(true);return;}
   if(!pop.contains(document.activeElement))return;
   const items=[...pop.querySelectorAll('button.api-dd-item')],i=items.indexOf(document.activeElement);
   if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length]?.focus();}
   else if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length]?.focus();}
   else if(e.key==='Home'){e.preventDefault();items[0]?.focus();}
   else if(e.key==='End'){e.preventDefault();items.at(-1)?.focus();}
   else if(e.key==='Tab'){closeApiDropdown();}
  };
  const onWheel=e=>{if(!pop.contains(e.target))closeApiDropdown();}; // mexer no mapa fecha a lista
  document.addEventListener('pointerdown',onDown,true);document.addEventListener('keydown',onKey,true);
  document.addEventListener('wheel',onWheel,{capture:true,passive:true});window.addEventListener('resize',closeApiDropdown);
  const off=()=>{document.removeEventListener('pointerdown',onDown,true);document.removeEventListener('keydown',onKey,true);document.removeEventListener('wheel',onWheel,{capture:true});window.removeEventListener('resize',closeApiDropdown);};
  current={btn,pop,off};btn.setAttribute('aria-expanded','true');place();

  const row=(item,depth)=>{
   const isReq=item.type==='request',el=document.createElement(readOnly?'div':'button');
   el.className=`api-dd-item${isReq?' is-request':' is-folder'}${readOnly?' is-static':''}`;el.style.setProperty('--depth',String(depth));
   el.setAttribute('role','menuitem');if(!readOnly){el.type='button';el.addEventListener('click',()=>{closeApiDropdown();onPick({type:item.type,name:item.name,path:item.path||''});});}
   if(isReq){const m=document.createElement('span');m.className=`api-method api-m-${item.method}`;m.textContent=String(item.method||'get').toUpperCase().slice(0,6);el.append(m);}
   else{const f=document.createElement('span');f.className='api-dd-folder';f.setAttribute('aria-hidden','true');f.textContent=item.type==='collection'?'🗂':'📁';el.append(f);}
   const n=document.createElement('span');n.className='api-dd-name';n.textContent=item.name;el.append(n);
   return el;
  };
  load().then(data=>{
   if(current?.pop!==pop)return; // fechou enquanto carregava
   pop.replaceChildren();
   if(!data){const n=document.createElement('div');n.className='api-dd-note';n.textContent=t('apiMissing');pop.append(n);place();return;}
   pop.append(row({type:data.type,name:data.name,path:data.path,method:data.method},0));
   if(!data.items.length&&data.type!=='request'){const n=document.createElement('div');n.className='api-dd-note';n.textContent=t('apiDdEmpty');pop.append(n);}
   for(const it of data.items)pop.append(row(it,it.depth+1));
   if(data.total>data.items.length){const n=document.createElement('div');n.className='api-dd-note';n.textContent=t('apiTileMore',data.total-data.items.length);pop.append(n);}
   if(data.offline){const n=document.createElement('div');n.className='api-dd-note is-offline';n.textContent=t('apiOffline');pop.append(n);}
   place();
   (pop.querySelector('button.api-dd-item'))?.focus({preventScroll:true});
  });
 }
 return btn;
}
