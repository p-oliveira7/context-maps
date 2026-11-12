// Formato de fluxo (.flow) → desenho do Excalidraw (cena) + miniatura SVG, com layout automático em camadas.
// Sem dependências; usado pelo rm.mjs (marcador [flow:arquivo.flow]) e pelos testes.
//
//   # Título opcional
//   direction: right            (ou down)
//   client: Cliente
//   auth: Token válido? [diamond]
//   ok: 200 OK [ellipse] {color=#2f9e44}
//   client -> auth: POST /orders
//   auth -> ok: sim
//
// Linha "id: Rótulo [forma] {color=#hex}" declara um quadro (forma: box, diamond, ellipse; padrão box).
// No quadro, {end} marca um fim clicável (havendo algum, só eles acendem o caminho) e {highlight=#hex} a cor do destaque até ele.
// Destaque do desenho: "highlight: off", "speed: instant|fast|normal", "highlight-color: #hex".
// Linha "a -> b: rótulo" liga dois quadros (o rótulo é opcional; quadros não declarados são criados com o id como rótulo).
// "\n" no rótulo quebra a linha. Linhas vazias e "//" são ignoradas.

const SHAPES={box:'rectangle',rect:'rectangle',rectangle:'rectangle',diamond:'diamond',decision:'diamond',ellipse:'ellipse',circle:'ellipse',end:'ellipse',start:'ellipse'};
const RE_EDGE=/^(.+?)\s*-+>\s*([^:]+?)\s*(?::\s*(.*))?$/;
const RE_NODE=/^([\w.-]+)\s*:\s*(.+)$/;
const RE_COLOR=/\{color=(#[0-9a-fA-F]{6})\}/;
const RE_SHAPE=/\[(\w+)\]/;
const RE_END=/\{end\}/;
const RE_HL=/\{highlight=(#[0-9a-fA-F]{6})\}/;

/** texto → {title, direction, highlight:{enabled?,speed?,color?}, nodes:[{id,label,shape,color,end?,highlight?}], edges:[{from,to,label}], warnings} */
export function parseFlow(text){
 const out={title:'',direction:'right',highlight:{},nodes:[],edges:[],warnings:[]},byId=new Map();
 const node=(id,props={})=>{let n=byId.get(id);if(!n){n={id,label:id,shape:'rectangle',color:null};byId.set(id,n);out.nodes.push(n);}Object.assign(n,props);return n;};
 String(text).split(/\r?\n/).forEach((raw,i)=>{
  const line=raw.trim();if(!line||line.startsWith('//'))return;
  if(line.startsWith('#')){if(!out.title)out.title=line.replace(/^#+\s*/,'');return;}
  const dir=/^direction\s*:\s*(right|down|lr|td)\s*$/i.exec(line);
  if(dir){out.direction=/^(down|td)$/i.test(dir[1])?'down':'right';return;}
  const hl=/^highlight\s*:\s*(on|off)\s*$/i.exec(line);if(hl){out.highlight.enabled=hl[1].toLowerCase()==='on';return;}
  const sp=/^speed\s*:\s*(instant|fast|normal)\s*$/i.exec(line);if(sp){out.highlight.speed=sp[1].toLowerCase();return;}
  const hc=/^highlight-color\s*:\s*(#[0-9a-fA-F]{6})\s*$/i.exec(line);if(hc){out.highlight.color=hc[1];return;}
  const e=RE_EDGE.exec(line);
  if(e){const from=e[1].trim(),to=e[2].trim();if(!/^[\w.-]+$/.test(from)||!/^[\w.-]+$/.test(to)){out.warnings.push(`line ${i+1}: invalid id in "${line}"`);return;}node(from);node(to);out.edges.push({from,to,label:(e[3]||'').trim().replace(/\\n/g,'\n')});return;}
  const m=RE_NODE.exec(line);
  if(m){
   let label=m[2];const color=RE_COLOR.exec(label)?.[1]||null,shapeKey=RE_SHAPE.exec(label)?.[1]?.toLowerCase(),end=RE_END.test(label),hlColor=RE_HL.exec(label)?.[1]||null;
   label=label.replace(RE_COLOR,'').replace(RE_SHAPE,'').replace(RE_END,'').replace(RE_HL,'').trim().replace(/\\n/g,'\n');
   if(shapeKey&&!SHAPES[shapeKey])out.warnings.push(`line ${i+1}: unknown shape [${shapeKey}] (use box, diamond or ellipse)`);
   node(m[1],{label:label||m[1],shape:SHAPES[shapeKey]||'rectangle',...(color?{color}:{}),...(end?{end:true}:{}),...(hlColor?{highlight:hlColor}:{})});return;
  }
  out.warnings.push(`line ${i+1}: not understood: "${line}"`);
 });
 if(!out.nodes.length)out.warnings.push('no boxes');
 return out;
}

/* ---------- layout em camadas (da esquerda para a direita, ou de cima para baixo) ---------- */
const CHAR=9,LINE=24,PAD_X=28,PAD_Y=18,GAP_LAYER=110,GAP_NODE=46;
function sizeOf(n){
 const lines=n.label.split('\n'),w=Math.max(...lines.map(l=>l.length))*CHAR+PAD_X*2,h=lines.length*LINE+PAD_Y*2;
 const k=n.shape==='diamond'?1.6:n.shape==='ellipse'?1.25:1;
 return {w:Math.max(140,Math.round(w*k)),h:Math.max(64,Math.round(h*k))};
}
export function layoutFlow(flow){
 const ids=flow.nodes.map(n=>n.id),out=new Map(ids.map(id=>[id,[]])),inc=new Map(ids.map(id=>[id,[]]));
 // setas que voltam (ciclos) não contam para as camadas
 const state=new Map(),back=new Set();
 const visit=id=>{state.set(id,1);for(const e of flow.edges.filter(e=>e.from===id)){const s=state.get(e.to);if(s===1)back.add(e);else if(!s)visit(e.to);}state.set(id,2);};
 ids.forEach(id=>{if(!state.get(id))visit(id);});
 for(const e of flow.edges)if(!back.has(e)){out.get(e.from).push(e.to);inc.get(e.to).push(e.from);}
 const layer=new Map(),order=[];const indeg=new Map(ids.map(id=>[id,inc.get(id).length]));
 const q=ids.filter(id=>!indeg.get(id));q.forEach(id=>layer.set(id,0));
 for(let i=0;i<q.length;i++){const id=q[i];order.push(id);for(const t of out.get(id)){layer.set(t,Math.max(layer.get(t)||0,layer.get(id)+1));indeg.set(t,indeg.get(t)-1);if(!indeg.get(t))q.push(t);}}
 const layers=[];for(const id of ids){const l=layer.get(id)||0;(layers[l]||=[]).push(id);}
 // ordem dentro da camada: média da posição de quem chega (uma passada), mantendo a ordem do arquivo como desempate
 const pos=new Map();layers.forEach(L=>L.forEach((id,i)=>pos.set(id,i)));
 for(let l=1;l<layers.length;l++){const L=layers[l]||[];L.sort((a,b)=>{const m=x=>{const p=inc.get(x);return p.length?p.reduce((s,y)=>s+pos.get(y),0)/p.length:pos.get(x);};return m(a)-m(b)||ids.indexOf(a)-ids.indexOf(b);});L.forEach((id,i)=>pos.set(id,i));}
 const size=new Map(flow.nodes.map(n=>[n.id,sizeOf(n)])),right=flow.direction!=='down',box=new Map();
 const along=id=>right?size.get(id).w:size.get(id).h,across=id=>right?size.get(id).h:size.get(id).w;
 const spans=layers.map(L=>(L||[]).reduce((s,id)=>s+across(id),0)+GAP_NODE*Math.max(0,(L||[]).length-1)),maxSpan=Math.max(0,...spans);
 let main=0;
 layers.forEach((L=[],l)=>{
  const thick=Math.max(0,...L.map(along));let cross=(maxSpan-spans[l])/2;
  for(const id of L){const s=size.get(id),a=main+(thick-along(id))/2;box.set(id,right?{x:a,y:cross,w:s.w,h:s.h}:{x:cross,y:a,w:s.w,h:s.h});cross+=across(id)+GAP_NODE;}
  main+=thick+GAP_LAYER;
 });
 return {box,back,right};
}

/* ---------- cena do Excalidraw ---------- */
let seq=0;
const rid=p=>`${p}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const common=(over)=>({angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:2,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:Math.floor(Math.random()*2**31),version:1,versionNonce:Math.floor(Math.random()*2**31),isDeleted:false,boundElements:[],updated:Date.now(),link:null,locked:false,...over});
const textEl=(text,containerId,x,y,w,h,color)=>common({id:rid('t'),type:'text',x,y,width:w,height:h,text,originalText:text,fontSize:20,fontFamily:1,textAlign:'center',verticalAlign:'middle',containerId,lineHeight:1.25,baseline:Math.round(h*.8),strokeColor:color||'#1e1e1e'});
/** fluxo → {elements, files} (mesmo formato que o app guarda em images[].scene) */
export function flowToScene(flow){
 const {box,right}=layoutFlow(flow),els=[],idOf=new Map();
 for(const n of flow.nodes){
  const b=box.get(n.id),id=rid('n');idOf.set(n.id,id);
  const shape=common({id,type:n.shape,x:b.x,y:b.y,width:b.w,height:b.h,roundness:n.shape==='rectangle'?{type:3}:n.shape==='diamond'?{type:2}:null,customData:{flowId:n.id,...(n.end?{cmEnd:true}:{}),...(n.highlight?{cmColor:n.highlight}:{})},...(n.color?{strokeColor:n.color}:{})});
  const lines=n.label.split('\n'),th=lines.length*25,tw=Math.max(...lines.map(l=>l.length))*11;
  const text=textEl(n.label,id,b.x+(b.w-tw)/2,b.y+(b.h-th)/2,tw,th,n.color);
  shape.boundElements.push({type:'text',id:text.id});els.push(shape,text);
 }
 const byFlowId=new Map(els.filter(e=>e.customData?.flowId).map(e=>[e.customData.flowId,e]));
 for(const e of flow.edges){
  const a=box.get(e.from),b=box.get(e.to),s=byFlowId.get(e.from),t=byFlowId.get(e.to),id=rid('a');
  // sai do lado de saída do quadro de origem e chega no lado de entrada do destino (setas de volta saem por baixo/direita)
  const forward=right?b.x>a.x+a.w/2:b.y>a.y+a.h/2;
  const p0=right?(forward?{x:a.x+a.w,y:a.y+a.h/2}:{x:a.x+a.w/2,y:a.y+a.h}):(forward?{x:a.x+a.w/2,y:a.y+a.h}:{x:a.x+a.w,y:a.y+a.h/2});
  const p1=right?(forward?{x:b.x,y:b.y+b.h/2}:{x:b.x+b.w/2,y:b.y+b.h}):(forward?{x:b.x+b.w/2,y:b.y}:{x:b.x+b.w,y:b.y+b.h/2});
  const mid=forward?null:right?{x:(p0.x+p1.x)/2,y:Math.max(a.y+a.h,b.y+b.h)+60}:{x:Math.max(a.x+a.w,b.x+b.w)+60,y:(p0.y+p1.y)/2};
  const pts=[[0,0],...(mid?[[mid.x-p0.x,mid.y-p0.y]]:[]),[p1.x-p0.x,p1.y-p0.y]]; // setas de volta passam por um ponto no meio
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const arrow=common({id,type:'arrow',x:p0.x,y:p0.y,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),points:pts,lastCommittedPoint:null,
   startBinding:{elementId:s.id,focus:0,gap:4},endBinding:{elementId:t.id,focus:0,gap:4},startArrowhead:null,endArrowhead:'arrow',roundness:{type:2}});
  s.boundElements.push({type:'arrow',id});t.boundElements.push({type:'arrow',id});els.push(arrow);
  if(e.label){
   const lines=e.label.split('\n'),th=lines.length*20,tw=Math.max(...lines.map(l=>l.length))*9,c=mid||{x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2};
   const lbl={...textEl(e.label,id,c.x-tw/2,c.y-th/2,tw,th),fontSize:16};
   arrow.boundElements.push({type:'text',id:lbl.id});els.push(lbl);
  }
 }
 return {elements:els,files:{}};
}

/* ---------- miniatura SVG (tema escuro, como no app) ---------- */
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function flowToSvg(flow){
 const {box,right}=layoutFlow(flow),M=24;
 let W=0,H=0;for(const b of box.values()){W=Math.max(W,b.x+b.w);H=Math.max(H,b.y+b.h);}
 W+=M*2;H+=M*2+70;
 const fg='#e8e8e8',parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${W} ${H}" width="${W}" height="${H}" font-family="Virgil, Segoe Print, Comic Sans MS, cursive"><rect x="${-M}" y="${-M}" width="${W}" height="${H}" fill="#121212"/><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10" fill="none" stroke="${fg}" stroke-width="1.6"/></marker></defs>`];
 for(const e of flow.edges){
  const a=box.get(e.from),b=box.get(e.to),forward=right?b.x>a.x+a.w/2:b.y>a.y+a.h/2;
  const p0=right?(forward?[a.x+a.w,a.y+a.h/2]:[a.x+a.w/2,a.y+a.h]):(forward?[a.x+a.w/2,a.y+a.h]:[a.x+a.w,a.y+a.h/2]);
  const p1=right?(forward?[b.x-4,b.y+b.h/2]:[b.x+b.w/2,b.y+b.h+4]):(forward?[b.x+b.w/2,b.y-4]:[b.x+b.w+4,b.y+b.h/2]);
  const mid=forward?null:right?[(p0[0]+p1[0])/2,Math.max(a.y+a.h,b.y+b.h)+60]:[Math.max(a.x+a.w,b.x+b.w)+60,(p0[1]+p1[1])/2];
  parts.push(mid?`<path d="M${p0} Q${mid} ${p1}" fill="none" stroke="${fg}" stroke-width="2" marker-end="url(#ah)"/>`:`<path d="M${p0}L${p1}" stroke="${fg}" stroke-width="2" marker-end="url(#ah)"/>`);
  if(e.label){const c=mid||[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2];parts.push(`<text x="${c[0]}" y="${c[1]-6}" fill="#bbb" font-size="15" text-anchor="middle">${esc(e.label.replace(/\n/g,' '))}</text>`);}
 }
 for(const n of flow.nodes){
  const b=box.get(n.id),stroke=n.color||fg,cx=b.x+b.w/2,cy=b.y+b.h/2;
  parts.push(n.shape==='diamond'?`<path d="M${cx} ${b.y}L${b.x+b.w} ${cy}L${cx} ${b.y+b.h}L${b.x} ${cy}Z" fill="#1b1b1b" stroke="${stroke}" stroke-width="2"/>`:n.shape==='ellipse'?`<ellipse cx="${cx}" cy="${cy}" rx="${b.w/2}" ry="${b.h/2}" fill="#1b1b1b" stroke="${stroke}" stroke-width="2"/>`:`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="#1b1b1b" stroke="${stroke}" stroke-width="2"/>`);
  const lines=n.label.split('\n');lines.forEach((l,i)=>parts.push(`<text x="${cx}" y="${cy+(i-(lines.length-1)/2)*24+7}" fill="${n.color||fg}" font-size="19" text-anchor="middle">${esc(l)}</text>`));
 }
 parts.push('</svg>');return parts.join('');
}
