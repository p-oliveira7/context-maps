/* Corpo da resposta do cliente de API: árvore JSON recolhível, XML/HTML com cores, texto bruto, preview (imagem, SVG, HTML isolado),
   busca dentro do corpo (Ctrl+F) e filtro por caminho (items[0].id). Só constrói nós DOM com textContent: nada do corpo vira HTML. */
import {parseResponseBody} from './pipeline.js?v=1';
import {getPath} from './assertions.js?v=1';

const TREE_BUDGET=4000,PAGE=200,MAX_STR=1500,MAX_MATCHES=2000,MAX_HIGHLIGHT=300000;
const OPEN_ALL=1500; // até este número de objetos/listas a árvore abre inteira; acima, só os dois primeiros níveis (para não travar)
const ID=/^[A-Za-z_$][\w$]*$/;
const parsedOf=new WeakMap(),uiOf=new WeakMap();

export function bodyKind(res){
 const type=String(res.contentType||'').toLowerCase();
 if(res.binary)return /^image\/(png|jpe?g|gif|webp|bmp|x-icon|avif)/.test(type)?'image':'binary';
 const text=res.bodyText||'';
 if(/json/.test(type)||/^\s*[\[{]/.test(text)){
  if(!parsedOf.has(res)){let v;try{v={ok:true,value:JSON.parse(text)};}catch{v={ok:false};}parsedOf.set(res,v);}
  if(parsedOf.get(res).ok)return 'json';
 }
 if(/svg/.test(type)||/^\s*<svg[\s>]/i.test(text))return 'svg';
 if(/html/.test(type)||/^\s*<(!doctype html|html)/i.test(text))return 'html';
 if(/xml/.test(type)||/^\s*<\?xml/i.test(text))return 'xml';
 return 'text';
}
const pathKey=k=>ID.test(k)?`.${k}`:`[${JSON.stringify(k)}]`;
/** quantos objetos/listas não vazios há no valor (pára de contar ao passar de `limit`) */
function countContainers(value,limit){
 let n=0;const stack=[value];
 while(stack.length&&n<=limit){const v=stack.pop();if(v&&typeof v==='object'){const kids=Array.isArray(v)?v:Object.values(v);if(kids.length){n++;for(const k of kids)if(k&&typeof k==='object')stack.push(k);}}}
 return n;
}

export function createBodyView({h,t,fmtSize}){
 /* ---------- JSON como árvore ---------- */
 function tree(value,rootPath,onCopyPath,openDepth=2){ // ramos com profundidade >= openDepth começam recolhidos
  const ctx={count:0};
  const punct=s=>h('span',{class:'jv-punct'},s);
  const prim=v=>{
   if(v===null)return h('span',{class:'jv-null'},'null');
   if(typeof v==='string'){
    if(v.length<=MAX_STR)return h('span',{class:'jv-str'},JSON.stringify(v));
    const holder=h('span',{class:'jv-str'},JSON.stringify(v.slice(0,MAX_STR)).slice(0,-1)+'…"');
    const more=h('button',{type:'button',class:'jv-more',onClick:()=>{holder.textContent=JSON.stringify(v);more.remove();}},t('apiBodyShowAll',v.length));
    return h('span',{},holder,' ',more);
   }
   return h('span',{class:typeof v==='number'?'jv-num':'jv-bool'},String(v));
  };
  const keyNode=(label,path)=>h('button',{type:'button',class:'jv-key',title:`${path} — ${t('apiBodyCopyPath')}`,onClick:()=>onCopyPath(path)},label);
  function node(v,label,path,depth,last){
   const comma=last?null:punct(',');
   const head=[];
   if(label!==null)head.push(keyNode(label,path),punct(': '));
   if(v===null||typeof v!=='object')return h('div',{class:'jv-row'},...head,prim(v),comma);
   const isArr=Array.isArray(v),entries=isArr?v.map((x,i)=>[i,x]):Object.entries(v),[open,close]=isArr?['[',']']:['{','}'];
   if(!entries.length)return h('div',{class:'jv-row'},...head,punct(open+close),comma);
   ctx.count++;
   const box=h('div',{class:`jv-node${depth>=openDepth?' is-collapsed':''}`}),summary=` ${isArr?t('apiBodyItems',entries.length):t('apiBodyKeys',entries.length)} ${close}${last?'':','}`;
   const toggle=h('button',{type:'button',class:'jv-toggle','aria-expanded':String(depth<openDepth),'aria-label':t('apiBodyToggle'),onClick:()=>{
    const collapsed=box.classList.toggle('is-collapsed');toggle.setAttribute('aria-expanded',String(!collapsed));fill();
   }});
   const children=h('div',{class:'jv-children'});
   let filled=false,shown=0;
   const childPath=k=>isArr?`${path}[${k}]`:`${path}${pathKey(k)}`;
   const addPage=()=>{
    const end=Math.min(entries.length,shown+PAGE);
    children.querySelector(':scope>.jv-more-row')?.remove();
    for(;shown<end;shown++){const [k,x]=entries[shown];children.append(node(x,isArr?null:JSON.stringify(k),childPath(k),depth+1,shown===entries.length-1));}
    if(shown<entries.length)children.append(h('div',{class:'jv-more-row'},h('button',{type:'button',class:'jv-more',onClick:addPage},t('apiBodyMoreItems',entries.length-shown))));
   };
   // além do orçamento de nós, os filhos de ramos recolhidos só são criados quando o ramo abre
   const lazy=ctx.count>TREE_BUDGET&&depth>=openDepth;
   const fill=()=>{if(filled)return;filled=true;addPage();};
   if(!lazy)fill();
   box.append(h('div',{class:'jv-row',dataset:{summary}},toggle,...head,punct(open)),children,h('div',{class:'jv-close'},punct(close),comma));
   return box;
  }
  const root=h('div',{class:'jv'});
  root.append(node(value,null,rootPath,0,true));
  return root;
 }

 /* ---------- XML / HTML com cores ---------- */
 function markup(text){
  const frag=document.createDocumentFragment(),span=(cls,s)=>h('span',{class:cls},s);
  const re=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[\w:.-]+(?:\s[^<>]*)?\/?>/g;
  let last=0,m;
  while((m=re.exec(text))){
   if(m.index>last)frag.append(text.slice(last,m.index));
   const tag=m[0];
   if(tag.startsWith('<!--'))frag.append(span('hl-comment',tag));
   else if(/^<(!|\?)/.test(tag))frag.append(span('hl-meta',tag));
   else{
    const parts=/^(<\/?)([\w:.-]+)([\s\S]*?)(\/?>)$/.exec(tag);
    frag.append(span('hl-punct',parts[1]),span('hl-tag',parts[2]));
    const attrs=/(\s+)([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)?|\s+|[\s\S]/g;let a;
    while((a=attrs.exec(parts[3]))){
     if(a[2]){frag.append(a[1],span('hl-attr',a[2]));if(a[3])frag.append(span('hl-punct',a[3]));if(a[4])frag.append(span('hl-str',a[4]));}
     else frag.append(a[0]);
    }
    frag.append(span('hl-punct',parts[4]));
   }
   last=m.index+tag.length;
  }
  if(last<text.length)frag.append(text.slice(last));
  return frag;
 }

 /* ---------- preview isolado ---------- */
 function preview(res,kind){
  const wrap=h('div',{class:'api-preview'});
  if(kind==='image'){
   const type=String(res.contentType).split(';')[0];
   wrap.append(h('img',{src:`data:${type};base64,${res.bodyBase64}`,alt:t('apiBodyPreview')}));
   if(res.size>1024*1024)wrap.append(h('p',{class:'api-hint'},t('apiBodyPreviewCut')));
  }else if(kind==='svg')wrap.append(h('img',{src:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(res.bodyText||'')}`,alt:t('apiBodyPreview')}));
  else wrap.append(h('iframe',{class:'api-preview-frame',sandbox:'',csp:"default-src 'none'; img-src data:; style-src 'unsafe-inline'",srcdoc:res.bodyText||'',title:t('apiBodyPreview'),referrerpolicy:'no-referrer'}));
  return wrap;
 }

 /* ---------- busca dentro do corpo ---------- */
 function makeFinder(content){
  let marks=[],current=-1;
  const clear=()=>{for(const m of marks)m.replaceWith(document.createTextNode(m.textContent));if(marks.length)content.normalize();marks=[];current=-1;};
  const go=n=>{
   if(!marks.length)return 0;
   marks[current]?.classList.remove('is-current');
   current=(n+marks.length)%marks.length;
   const mark=marks[current];mark.classList.add('is-current');
   for(let node=mark.closest('.jv-node.is-collapsed');node;node=node.parentElement?.closest('.jv-node.is-collapsed')){node.classList.remove('is-collapsed');node.querySelector(':scope>.jv-row>.jv-toggle')?.setAttribute('aria-expanded','true');}
   mark.scrollIntoView({block:'center',inline:'nearest'});return current+1;
  };
  const run=term=>{
   clear();if(!term)return {total:0,index:0};
   const needle=term.toLowerCase(),walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),nodes=[];
   for(let n=walker.nextNode();n;n=walker.nextNode())if(n.nodeValue.toLowerCase().includes(needle))nodes.push(n);
   for(const node of nodes){
    if(marks.length>=MAX_MATCHES)break;
    const text=node.nodeValue,lower=text.toLowerCase(),frag=document.createDocumentFragment();let at=0,i;
    while((i=lower.indexOf(needle,at))>=0&&marks.length<MAX_MATCHES){
     if(i>at)frag.append(text.slice(at,i));
     const mark=h('mark',{class:'api-find-hit'},text.slice(i,i+needle.length));marks.push(mark);frag.append(mark);at=i+needle.length;
    }
    if(at<text.length)frag.append(text.slice(at));
    node.replaceWith(frag);
   }
   return {total:marks.length,index:marks.length?go(0):0};
  };
  return {run,next:()=>go(current+1),prev:()=>go(current-1),clear,total:()=>marks.length};
 }

 /* ---------- montagem ---------- */
 function mount(res){
  const kind=bodyKind(res),ui=uiOf.get(res)||{mode:kind==='image'?'preview':'pretty',path:'',find:''};uiOf.set(res,ui);
  const canPreview=['image','svg','html'].includes(kind),canRaw=['json','xml','html','svg','text'].includes(kind);
  const modes=[...(kind==='image'?[]:['pretty']),...(canRaw&&kind!=='text'?['raw']:[]),...(canPreview?['preview']:[])];
  if(!modes.includes(ui.mode))ui.mode=modes[0]||'pretty';
  const data=kind==='json'?parsedOf.get(res).value:undefined;
  const scope=kind==='json'?parseScope(res,data):null;
  const root=h('div',{class:'api-body-view'});
  const content=h('div',{class:'api-resp-body api-pre',tabindex:'0'});
  let finder=null,filtered=data,filterError=false,basePath='res.body';

  const text=()=>{
   if(ui.mode==='raw'||kind!=='json')return res.binary?'':(res.bodyText||'');
   const v=filtered;return typeof v==='string'?v:JSON.stringify(v,null,2);
  };
  const copyPath=async path=>{try{await navigator.clipboard.writeText(path);status.textContent=t('apiBodyPathCopied',path);setTimeout(()=>{if(status.textContent.includes(path))status.textContent='';},1800);}catch{}};

  function draw(){
   finder?.clear();
   content.classList.toggle('is-tree',kind==='json'&&ui.mode==='pretty'&&!filterError);
   if(res.binary&&kind==='binary'){content.replaceChildren(t('apiBinary',fmtSize(res.size||0)));}
   else if(ui.mode==='preview')content.replaceChildren(preview(res,kind));
   else if(kind==='json'&&ui.mode==='pretty'){
    if(filterError)content.replaceChildren(h('span',{class:'api-hint'},t('apiBodyNoValue')));
    else content.replaceChildren(tree(filtered,basePath,copyPath,openDepth()));
   }else if((kind==='xml'||kind==='html'||kind==='svg')&&ui.mode==='pretty'&&(res.bodyText||'').length<=MAX_HIGHLIGHT)content.replaceChildren(markup(res.bodyText||''));
   else content.replaceChildren(text());
   finder=ui.mode==='preview'?null:makeFinder(content);
   if(ui.find&&finder)updateFind();
  }
  // por padrão tudo aberto (se não for grande demais); Expandir/Recolher tudo vale para esta resposta
  function openDepth(){return ui.expand==='all'?Infinity:ui.expand==='collapsed'?1:countContainers(filtered,OPEN_ALL)<=OPEN_ALL?Infinity:2;}
  function updateFind(){const r=finder.run(ui.find);count.textContent=ui.find?(r.total?`${r.index}/${r.total}`:t('apiBodyNoMatches')):'';}
  function applyPath(){
   filterError=false;filtered=data;basePath='res.body';
   const expr=ui.path.trim();
   if(expr){
    const full=/^res(\.|\[|$)/.test(expr)?expr:`res.body${/^\[/.test(expr)?'':'.'}${expr}`,v=getPath(scope,full);
    if(v===undefined)filterError=true;else{filtered=v;basePath=full;}
   }
  }

  const modeBtns=modes.length>1?h('div',{class:'api-body-modes',role:'group','aria-label':t('apiBodyView')},...modes.map(m=>h('button',{type:'button',class:`api-btn${ui.mode===m?' is-active':''}`,'aria-pressed':String(ui.mode===m),onClick:()=>{ui.mode=m;modeBtns.querySelectorAll('button').forEach((b,i)=>{const on=modes[i]===m;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));});pathInput?.toggleAttribute('hidden',m!=='pretty');findBox.toggleAttribute('hidden',m==='preview');draw();}},t(`apiBodyMode_${m}`)))):null;
  const pathInput=kind==='json'?h('input',{type:'text',class:'api-filter api-body-path',value:ui.path,placeholder:t('apiBodyPath'),'aria-label':t('apiBodyPath'),spellcheck:'false',onInput:e=>{ui.path=e.target.value;applyPath();draw();}}):null;
  const setExpand=v=>{ui.expand=v;draw();};
  const expandBtns=kind==='json'?h('div',{class:'api-body-expand',role:'group','aria-label':t('apiBodyExpandGroup')},
   h('button',{type:'button',class:'api-icon-btn',title:t('apiBodyExpandAll'),'aria-label':t('apiBodyExpandAll'),onClick:()=>setExpand('all')},'⊞'),
   h('button',{type:'button',class:'api-icon-btn',title:t('apiBodyCollapseAll'),'aria-label':t('apiBodyCollapseAll'),onClick:()=>setExpand('collapsed')},'⊟')):null;
  const count=h('span',{class:'api-find-count','aria-live':'polite'});
  const status=h('span',{class:'api-find-count',role:'status'});
  const input=h('input',{type:'search',class:'api-filter api-body-find',value:ui.find,placeholder:t('apiBodyFind'),'aria-label':t('apiBodyFind'),spellcheck:'false',onInput:e=>{ui.find=e.target.value;if(finder)updateFind();}});
  const step=dir=>{if(!finder||!finder.total())return;const n=dir>0?finder.next():finder.prev();count.textContent=`${n}/${finder.total()}`;};
  input.addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1);}
   else if(e.key==='Escape'&&input.value){e.preventDefault();e.stopPropagation();input.value='';ui.find='';if(finder)updateFind();}
  });
  const findBox=h('div',{class:'api-body-findbox'},input,count,
   h('button',{type:'button',class:'api-icon-btn',title:t('apiBodyPrev'),'aria-label':t('apiBodyPrev'),onClick:()=>step(-1)},'↑'),
   h('button',{type:'button',class:'api-icon-btn',title:t('apiBodyNext'),'aria-label':t('apiBodyNext'),onClick:()=>step(1)},'↓'));
  root.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&ui.mode!=='preview'){e.preventDefault();e.stopPropagation();input.focus();input.select();}});
  if(ui.mode==='preview')findBox.hidden=true;
  if(pathInput&&ui.mode!=='pretty')pathInput.hidden=true;
  if(expandBtns&&ui.mode!=='pretty')expandBtns.hidden=true;
  applyPath();
  root.append(h('div',{class:'api-body-bar'},modeBtns,expandBtns,pathInput,kind==='binary'?null:findBox,status),content);
  draw();
  return {el:root,text};
 }
 function parseScope(res,body){
  return {res:{status:res.status,statusText:res.statusText||'',headers:Object.fromEntries((res.headers||[]).map(([k,v])=>[String(k).toLowerCase(),v])),body}};
 }
 return {mount};
}
