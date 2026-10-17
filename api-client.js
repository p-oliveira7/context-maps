/* Cliente de API (estilo Postman/Bruno): painel à direita, coleções no formato Bruno, variáveis de ambiente e envio pelo servidor local. */
import {t,lang} from './i18n.js?v=1';

const $=(s,root=document)=>root.querySelector(s);
function h(tag,props={},...children){
 const el=document.createElement(tag);
 for(const [k,v] of Object.entries(props||{})){
  if(v===undefined||v===null||v===false)continue;
  if(k==='class')el.className=v;
  else if(k==='dataset')Object.assign(el.dataset,v);
  else if(k.startsWith('on'))el.addEventListener(k.slice(2).toLowerCase(),v);
  else if(k==='value')el.value=v;
  else if(k==='checked')el.checked=!!v;
  else el.setAttribute(k,v===true?'':v);
 }
 el.append(...children.flat().filter(c=>c!==undefined&&c!==null&&c!==false));
 return el;
}
const API_TYPE='application/x-context-maps-api';
const METHODS=['get','post','put','patch','delete','options','head'];
const store={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};

async function api(method,route,body){
 const raw=body instanceof Blob||body instanceof ArrayBuffer;
 const res=await fetch(`api${route}`,{method,headers:{'x-context-maps':'1','x-lang':lang,...(body&&!raw?{'content-type':'application/json'}:{})},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
 if(!res.ok){let message=`${res.status}`;try{message=(await res.json()).error||message;}catch{}throw Object.assign(new Error(message),{status:res.status});}
 return res.headers.get('content-type')?.includes('json')?res.json():res;
}

/* ---------- variáveis {{nome}} ---------- */
export function resolveVars(text,vars){
 return String(text??'').replace(/\{\{\s*([\w$.-]+)\s*\}\}/g,(whole,key)=>{
  if(key==='$timestamp')return String(Math.floor(Date.now()/1000));
  if(key==='$isoTimestamp')return new Date().toISOString();
  if(key==='$guid')return crypto.randomUUID();
  if(key==='$randomInt')return String(Math.floor(Math.random()*1000));
  return vars.has(key)?vars.get(key):whole;
 });
}
const activeEntries=list=>(list||[]).filter(e=>e.enabled!==false&&e.name);

/* ---------- URL <-> parâmetros ---------- */
const splitUrl=url=>{const at=url.indexOf('?');return at<0?[url,'']:[url.slice(0,at),url.slice(at+1)];};
export function syncParamsFromUrl(model){
 const [base,qs]=splitUrl(model.url||''),kept=(model.query||[]).filter(e=>e.enabled===false);
 const fresh=qs?qs.split('&').filter(Boolean).map(pair=>{const i=pair.indexOf('=');return i<0?{name:pair,value:'',enabled:true}:{name:pair.slice(0,i),value:pair.slice(i+1),enabled:true};}):[];
 model.query=[...fresh,...kept];if(!model.query.length)delete model.query;
 const names=[...base.matchAll(/\/:([A-Za-z_]\w*)/g)].map(m=>m[1]),old=new Map((model.pathParams||[]).map(p=>[p.name,p.value]));
 model.pathParams=names.map(name=>({name,value:old.get(name)??'',enabled:true}));if(!model.pathParams.length)delete model.pathParams;
}
export function syncUrlFromParams(model){
 const [base]=splitUrl(model.url||''),qs=activeEntries(model.query).map(e=>`${e.name}=${e.value}`).join('&');
 model.url=qs?`${base}?${qs}`:base;
}

/* ---------- estado ---------- */
const state={open:false,collections:[],coll:null,env:null,envVars:new Map(),request:null,reqPath:'',saveTimer:0,saving:Promise.resolve(),response:null,sending:false,abort:null,tab:'params',respTab:'body',pretty:true,expanded:new Set(),filter:'',attach:null};
let panel,els={},hooks={};

/* ---------- carregamento ---------- */
async function loadCollections(){state.collections=await api('GET','/collections');}
async function loadCollection(id){
 if(!id){state.coll=null;state.request=null;state.reqPath='';return;}
 const detail=await api('GET',`/collections/${id}`);
 state.coll=detail;store.set('cm-api-coll',id);
 const saved=store.get(`cm-api-env:${id}`);
 state.env=detail.environments.includes(saved)?saved:detail.environments[0]||null;
 state.envVars=new Map();
 if(state.env)await loadEnv();
 state.expanded=new Set([''].concat(detail.tree.filter(i=>i.type==='folder').map(i=>i.path)));
}
async function loadEnv(){
 state.envVars=new Map();
 if(!state.env)return;
 try{const env=await api('GET',`/collections/${state.coll.id}/environments/${encodeURIComponent(state.env)}`);for(const v of env.vars)if(v.enabled!==false&&v.name)state.envVars.set(v.name,v.value);}catch{}
}
async function openRequest(path){
 await flushSave();
 if(!path){state.request=null;state.reqPath='';state.response=null;renderMain();renderTree();return;}
 try{state.request=await api('GET',`/collections/${state.coll.id}/request?path=${encodeURIComponent(path)}`);}catch{state.request=null;}
 state.reqPath=path;state.response=null;state.tab='params';renderMain();renderTree();
}

/* ---------- salvar ---------- */
function markDirty(){
 if(!state.request)return;
 setSaveState(t('unsaved'),'dirty');clearTimeout(state.saveTimer);state.saveTimer=setTimeout(flushSave,600);
}
function setSaveState(text,kind=''){const el=els.save;if(el){el.textContent=text;el.dataset.state=kind;}}
function flushSave(){
 clearTimeout(state.saveTimer);state.saveTimer=0;
 if(!state.request||!state.coll)return state.saving;
 const {path,...model}=state.request,id=state.coll.id,rel=state.reqPath;
 setSaveState(t('saving'),'saving');
 state.saving=state.saving.then(()=>api('PUT',`/collections/${id}/request?path=${encodeURIComponent(rel)}`,model)).then(()=>{if(!state.saveTimer)setSaveState(t('saved'),'saved');},()=>setSaveState(t('saveError'),'error'));
 return state.saving;
}

/* ---------- envio ---------- */
function collectionVars(){return new Map((state.coll?.defaults?.vars||[]).filter(v=>v.enabled!==false).map(v=>[v.name,v.value]));}
function allVars(){const vars=collectionVars();for(const [k,v] of state.envVars)vars.set(k,v);for(const e of activeEntries(state.request?.varsPre))vars.set(e.name,e.value);return vars;}
export function buildRequest(model,vars,collHeaders=[]){
 const r=text=>resolveVars(text,vars);
 let url=r(model.url||'');
 for(const p of activeEntries(model.pathParams))url=url.replace(new RegExp(`/:${p.name}(?=[/?#]|$)`),`/${encodeURIComponent(r(p.value))}`);
 const headers=new Map();
 for(const e of [...activeEntries(collHeaders),...activeEntries(model.headers)])headers.set(e.name.toLowerCase(),{name:e.name,value:r(e.value)});
 if(model.authMode==='bearer'&&model.bearer?.token)headers.set('authorization',{name:'Authorization',value:`Bearer ${r(model.bearer.token)}`});
 if(model.authMode==='basic'&&model.basic)headers.set('authorization',{name:'Authorization',value:`Basic ${btoa(unescape(encodeURIComponent(`${r(model.basic.username)}:${r(model.basic.password)}`)))}`});
 let body;
 const mode=model.bodyMode||'none',setType=type=>{if(!headers.has('content-type'))headers.set('content-type',{name:'Content-Type',value:type});};
 if(mode==='json'){body=r(model.body?.json||'');setType('application/json');}
 else if(mode==='text'){body=r(model.body?.text||'');setType('text/plain');}
 else if(mode==='xml'){body=r(model.body?.xml||'');setType('application/xml');}
 else if(mode==='formUrlEncoded'){body=activeEntries(model.formUrlEncoded).map(e=>`${encodeURIComponent(r(e.name))}=${encodeURIComponent(r(e.value))}`).join('&');setType('application/x-www-form-urlencoded');}
 return {method:String(model.method||'get').toUpperCase(),url,headers:[...headers.values()],body};
}
async function send(){
 if(!state.request||state.sending)return;
 state.sending=true;state.response=null;state.abort=new AbortController();renderResponse();
 const started=performance.now();
 try{
  const req=buildRequest(state.request,allVars(),state.coll?.defaults?.headers);
  const res=await fetch('api/send',{method:'POST',headers:{'x-context-maps':'1','x-lang':lang,'content-type':'application/json'},body:JSON.stringify(req),signal:state.abort.signal});
  const data=await res.json();
  state.response=res.ok?data:{error:'request',detail:data.error||String(res.status),timeMs:Math.round(performance.now()-started)};
 }catch(error){
  state.response=error?.name==='AbortError'?{error:'cancelled',timeMs:Math.round(performance.now()-started)}:{error:'network',detail:String(error?.message||error),timeMs:Math.round(performance.now()-started)};
 }
 state.sending=false;state.abort=null;renderResponse();
}

/* ---------- tabelas chave/valor ---------- */
function kvTable(list,{onChange,toggle=true,namePlaceholder=t('apiName'),valuePlaceholder=t('apiValue'),addLabel=t('apiAdd'),lockedNames=false}){
 const body=h('div',{class:'api-kv'});
 const draw=()=>{
  body.replaceChildren(...[...list.map((entry,i)=>h('div',{class:'api-kv-row'},
   toggle?h('input',{type:'checkbox','aria-label':t('apiEnabled'),checked:entry.enabled!==false,onChange:e=>{entry.enabled=e.target.checked;onChange();}}):null,
   h('input',{type:'text',value:entry.name,placeholder:namePlaceholder,'aria-label':namePlaceholder,spellcheck:'false',readonly:lockedNames||null,onInput:e=>{entry.name=e.target.value;onChange();}}),
   h('input',{type:'text',value:entry.value,placeholder:valuePlaceholder,'aria-label':valuePlaceholder,spellcheck:'false',onInput:e=>{entry.value=e.target.value;onChange();}}),
   lockedNames?null:h('button',{type:'button',class:'api-icon-btn','aria-label':t('apiRemove'),title:t('apiRemove'),onClick:()=>{list.splice(i,1);draw();onChange();}},'×')
  )),lockedNames?null:h('button',{type:'button',class:'api-add',onClick:()=>{list.push({name:'',value:'',enabled:true});draw();body.querySelector('.api-kv-row:last-of-type input[type=text]')?.focus();onChange();}},`+ ${addLabel}`)].filter(Boolean));
 };
 draw();return body;
}

/* ---------- árvore ---------- */
const methodBadge=m=>h('span',{class:`api-method api-m-${m}`},String(m).toUpperCase().slice(0,7));
function parentOf(path){return path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';}
function findItem(items,path){for(const it of items){if(it.path===path)return it;if(it.children){const f=findItem(it.children,path);if(f)return f;}}return null;}
function matches(item,q){return !q||item.name.toLowerCase().includes(q)||(item.url||'').toLowerCase().includes(q)||(item.children||[]).some(c=>matches(c,q));}
let dragged=null;
function dragData(extra){return e=>{e.dataTransfer.setData(API_TYPE,JSON.stringify({collection:state.coll.id,collectionName:state.coll.name,...extra}));e.dataTransfer.setData('text/plain',extra.name||state.coll.name);e.dataTransfer.effectAllowed='copyMove';};}
function treeRows(items,depth,q){
 return items.filter(it=>matches(it,q)).flatMap(it=>{
  const isFolder=it.type==='folder',open=q?true:state.expanded.has(it.path);
  const row=h('li',{role:'treeitem','aria-level':String(depth+1),'aria-expanded':isFolder?String(open):null,'aria-selected':String(!isFolder&&it.path===state.reqPath),class:`api-row${!isFolder&&it.path===state.reqPath?' is-active':''}`,style:`--depth:${depth}`,draggable:'true',dataset:{path:it.path}},
   h('button',{type:'button',class:'api-row-main',onClick:()=>{if(isFolder){state.expanded.has(it.path)?state.expanded.delete(it.path):state.expanded.add(it.path);renderTree();}else openRequest(it.path);}},
    isFolder?h('span',{class:'api-caret','aria-hidden':'true'},open?'▾':'▸'):methodBadge(it.method),
    h('span',{class:'api-row-name'},isFolder?`📁 ${it.name}`:it.name)),
   h('span',{class:'api-row-actions'},
    isFolder?h('button',{type:'button',class:'api-icon-btn',title:t('apiNewRequest'),'aria-label':`${t('apiNewRequest')}: ${it.name}`,onClick:()=>newItem('request',it.path)},'+'):null,
    isFolder?h('button',{type:'button',class:'api-icon-btn',title:t('apiNewFolder'),'aria-label':`${t('apiNewFolder')}: ${it.name}`,onClick:()=>newItem('folder',it.path)},'▤'):null,
    hooks.attach&&isFolder?h('button',{type:'button',class:'api-icon-btn api-attach',title:t('apiAttach'),'aria-label':`${t('apiAttach')}: ${it.name}`,onClick:()=>attachTo({path:it.path,name:it.name,type:'folder'})},'⤓'):null,
    h('button',{type:'button',class:'api-icon-btn',title:t('apiRename'),'aria-label':`${t('apiRename')}: ${it.name}`,onClick:()=>renameItem(it)},'✎'),
    h('button',{type:'button',class:'api-icon-btn danger',title:t('apiDelete'),'aria-label':`${t('apiDelete')}: ${it.name}`,onClick:()=>deleteItem(it)},'✕')));
  row.addEventListener('dragstart',e=>{dragged=it;dragData({path:it.path,name:it.name,type:it.type})(e);});
  row.addEventListener('dragend',()=>{dragged=null;els.tree.querySelectorAll('.drop-before,.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));});
  row.addEventListener('dragover',e=>{
   if(!dragged||dragged===it||parentOf(dragged.path)!==parentOf(it.path))return;
   e.preventDefault();const r=row.getBoundingClientRect(),after=e.clientY>r.top+r.height/2;row.classList.toggle('drop-after',after);row.classList.toggle('drop-before',!after);
  });
  row.addEventListener('dragleave',()=>row.classList.remove('drop-before','drop-after'));
  row.addEventListener('drop',async e=>{
   if(!dragged||dragged===it||parentOf(dragged.path)!==parentOf(it.path))return;
   e.preventDefault();const after=row.classList.contains('drop-after');row.classList.remove('drop-before','drop-after');
   const parent=parentOf(it.path),siblings=(parent?findItem(state.coll.tree,parent).children:state.coll.tree).map(s=>s.path).filter(p=>p!==dragged.path);
   siblings.splice(siblings.indexOf(it.path)+(after?1:0),0,dragged.path);
   try{await api('POST',`/collections/${state.coll.id}/reorder`,{parent,order:siblings});await reloadTree();}catch{}
  });
  return [row,...(isFolder&&open?treeRows(it.children,depth+1,q):[])];
 });
}
async function reloadTree(){const keep=state.reqPath;await loadCollection(state.coll.id);if(keep)state.reqPath=keep;renderAll(false);}
function renderTree(){
 if(!els.tree)return;
 const q=state.filter.trim().toLowerCase();
 if(!state.coll){els.tree.replaceChildren();return;}
 const head=h('li',{role:'presentation',class:'api-collection-row',draggable:'true'},
  h('span',{class:'api-collection-name'},`🗂 ${state.coll.name}`),
  hooks.attach?h('button',{type:'button',class:'api-icon-btn api-attach',title:t('apiAttach'),'aria-label':`${t('apiAttach')}: ${state.coll.name}`,onClick:()=>attachTo({path:'',name:state.coll.name,type:'collection'})},'⤓'):null);
 head.addEventListener('dragstart',dragData({path:'',name:state.coll.name,type:'collection'}));
 els.tree.replaceChildren(head,...treeRows(state.coll.tree,0,q));
 if(!state.coll.tree.length)els.tree.append(h('li',{class:'api-empty-small',role:'presentation'},t('apiEmptyCollection')));
}
async function newItem(type,parent=''){
 const name=prompt(t(type==='folder'?'apiPromptFolder':'apiPromptRequest'));if(!name||!name.trim())return;
 try{
  const made=await api('POST',`/collections/${state.coll.id}/items`,{type,parent,name:name.trim(),method:'get',url:''});
  if(parent)state.expanded.add(parent);
  await reloadTree();if(type==='request')await openRequest(made.path);
 }catch(e){toast(e.message);}
}
async function renameItem(item){
 const name=prompt(t('apiPromptRename'),item.name);if(!name||!name.trim()||name.trim()===item.name)return;
 try{await flushSave();await api('PATCH',`/collections/${state.coll.id}/items`,{path:item.path,name:name.trim()});const keep=state.reqPath;await reloadTree();if(keep===item.path)await openRequest(keep);}catch(e){toast(e.message);}
}
async function deleteItem(item){
 if(!confirm(t('apiConfirmDelete',item.name)))return;
 try{
  await api('DELETE',`/collections/${state.coll.id}/items?path=${encodeURIComponent(item.path)}`);
  if(state.reqPath===item.path||state.reqPath.startsWith(`${item.path}/`)){state.request=null;state.reqPath='';state.response=null;}
  await reloadTree();renderMain();
 }catch(e){toast(e.message);}
}
function toast(message){hooks.toast?.(message);}

/* ---------- editor de request ---------- */
const TABS=['params','headers','body','auth','vars','docs','scripts'];
function renderMain(){
 const main=els.main;if(!main)return;
 const m=state.request;
 if(!m){
  main.replaceChildren(h('div',{class:'api-empty'},h('p',{},state.coll?t('apiPickRequest'):t('apiNoCollections')),
   !state.coll?h('div',{class:'api-empty-actions'},h('button',{type:'button',class:'api-btn',onClick:createCollection},t('apiNewCollection')),h('button',{type:'button',class:'api-btn',onClick:()=>els.importInput.click()},t('apiImport'))):null));
  return;
 }
 const urlInput=h('input',{type:'text',class:'api-url',value:m.url||'',placeholder:'https://…  {{host}}/path','aria-label':'URL',spellcheck:'false',onInput:e=>{m.url=e.target.value;syncParamsFromUrl(m);markDirty();if(state.tab==='params')renderTab();}});
 urlInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();send();}});
 const methodSel=h('select',{class:'api-method-select api-m-'+m.method,'aria-label':t('apiMethod'),onChange:e=>{m.method=e.target.value;e.target.className=`api-method-select api-m-${m.method}`;markDirty();}},...METHODS.map(x=>h('option',{value:x,selected:x===m.method},x.toUpperCase())));
 const nameInput=h('div',{class:'api-req-title'},h('strong',{},m.name),els.save);
 els.sendBtn=h('button',{type:'button',class:'api-send',onClick:()=>state.sending?state.abort?.abort():send()},state.sending?t('apiCancel'):t('apiSend'));
 els.urlInput=urlInput;
 els.tabs=h('div',{class:'api-tabs',role:'tablist'},...TABS.map(id=>h('button',{type:'button',role:'tab',id:`api-tab-${id}`,'aria-selected':String(state.tab===id),'aria-controls':'api-tabpanel',class:state.tab===id?'is-active':'',onClick:()=>{state.tab=id;els.tabs.querySelectorAll('[role=tab]').forEach(b=>{const on=b.id===`api-tab-${id}`;b.setAttribute('aria-selected',String(on));b.classList.toggle('is-active',on);});renderTab();}},t(`apiTab_${id}`))));
 els.tabpanel=h('div',{class:'api-tabpanel',id:'api-tabpanel',role:'tabpanel'});
 els.response=h('div',{class:'api-response','aria-live':'polite'});
 main.replaceChildren(nameInput,h('div',{class:'api-urlbar'},methodSel,urlInput,els.sendBtn),els.tabs,els.tabpanel,els.response);
 renderTab();renderResponse();
}
function textArea(value,onInput,placeholder,{readonly=false,rows=8}={}){
 const ta=h('textarea',{class:'api-textarea',spellcheck:'false',placeholder,rows,readonly:readonly||null,'aria-label':placeholder||''});
 ta.value=value||'';if(!readonly)ta.addEventListener('input',()=>onInput(ta.value));return ta;
}
function renderTab(){
 const m=state.request,box=els.tabpanel;if(!m||!box)return;
 const changed=()=>markDirty();
 const labelled=(label,node)=>h('label',{class:'api-field'},h('span',{},label),node);
 if(state.tab==='params'){
  m.query||=[];m.pathParams||=[];
  const q=kvTable(m.query,{onChange:()=>{syncUrlFromParams(m);if(els.urlInput)els.urlInput.value=m.url;changed();}});
  box.replaceChildren(h('h4',{},t('apiQuery')),q,...(m.pathParams.length?[h('h4',{},t('apiPathParams')),kvTable(m.pathParams,{onChange:changed,toggle:false,lockedNames:true})]:[]));
 }else if(state.tab==='headers'){
  m.headers||=[];box.replaceChildren(kvTable(m.headers,{onChange:changed}));
  if(state.coll?.defaults?.headers?.length)box.append(h('p',{class:'api-hint'},`${t('apiInherited')}: ${state.coll.defaults.headers.map(x=>x.name).join(', ')}`));
 }else if(state.tab==='body'){
  const modes=[['none',t('apiBodyNone')],['json','JSON'],['text',t('apiBodyText')],['xml','XML'],['formUrlEncoded',t('apiBodyForm')],['multipartForm',t('apiBodyMultipart')]];
  const sel=h('select',{'aria-label':t('apiTab_body'),onChange:e=>{m.bodyMode=e.target.value;changed();renderTab();}},...modes.map(([v,l])=>h('option',{value:v,selected:v===(m.bodyMode||'none')},l)));
  const mode=m.bodyMode||'none';
  box.replaceChildren(h('div',{class:'api-field-row'},sel));
  if(mode==='json'||mode==='text'||mode==='xml'){m.body||={};box.append(textArea(m.body[mode],v=>{m.body[mode]=v;changed();},mode==='json'?'{ "key": "value" }':'',{rows:12}));
   if(mode==='json')box.append(h('button',{type:'button',class:'api-btn',onClick:()=>{try{m.body.json=JSON.stringify(JSON.parse(resolveVars(m.body.json||'',new Map())),null,2);changed();renderTab();}catch{toast(t('apiInvalidJson'));}}},t('apiPrettify')));}
  else if(mode==='formUrlEncoded'){m.formUrlEncoded||=[];box.append(kvTable(m.formUrlEncoded,{onChange:changed}));}
  else if(mode==='multipartForm')box.append(h('p',{class:'api-hint'},t('apiMultipartNote')));
 }else if(state.tab==='auth'){
  const sel=h('select',{'aria-label':t('apiTab_auth'),onChange:e=>{m.authMode=e.target.value;changed();renderTab();}},...[['none',t('apiAuthNone')],['bearer',t('apiAuthBearer')],['basic',t('apiAuthBasic')],['inherit',t('apiAuthInherit')]].map(([v,l])=>h('option',{value:v,selected:v===(m.authMode||'none')},l)));
  box.replaceChildren(h('div',{class:'api-field-row'},sel));
  if(m.authMode==='bearer'){m.bearer||={token:''};box.append(labelled(t('apiToken'),h('input',{type:'text',value:m.bearer.token,spellcheck:'false',onInput:e=>{m.bearer.token=e.target.value;changed();}})));}
  else if(m.authMode==='basic'){m.basic||={username:'',password:''};box.append(labelled(t('apiUsername'),h('input',{type:'text',value:m.basic.username,onInput:e=>{m.basic.username=e.target.value;changed();}})),labelled(t('apiPassword'),h('input',{type:'password',value:m.basic.password,onInput:e=>{m.basic.password=e.target.value;changed();}})));}
  else if(m.authMode==='inherit')box.append(h('p',{class:'api-hint'},t('apiAuthInheritNote')));
 }else if(state.tab==='vars'){
  m.varsPre||=[];box.replaceChildren(h('p',{class:'api-hint'},t('apiVarsNote')),kvTable(m.varsPre,{onChange:changed}),h('h4',{},t('apiResolved')),resolvedPreview());
 }else if(state.tab==='docs'){
  box.replaceChildren(textArea(m.docs||'',v=>{m.docs=v;changed();},t('apiDocsPlaceholder'),{rows:12}));
 }else{
  const parts=[[t('apiScriptPre'),m.scriptPre],[t('apiScriptPost'),m.scriptPost],[t('apiTests'),m.tests]].filter(([,v])=>v);
  box.replaceChildren(h('p',{class:'api-hint'},t('apiScriptsNote')),...(parts.length?parts.flatMap(([label,value])=>[h('h4',{},label),textArea(value,()=>{},'',{readonly:true,rows:6})]):[h('p',{class:'api-hint'},t('apiNoScripts'))]));
 }
}
function resolvedPreview(){
 const vars=allVars(),req=buildRequest(state.request,vars,state.coll?.defaults?.headers);
 return h('pre',{class:'api-pre'},`${req.method} ${req.url}\n${req.headers.map(x=>`${x.name}: ${x.value}`).join('\n')}${req.body?`\n\n${req.body}`:''}`);
}

/* ---------- resposta ---------- */
const fmtSize=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
function prettyBody(res){
 if(res.binary)return t('apiBinary',fmtSize(res.size));
 const text=res.bodyText||'';
 if(state.pretty&&/json/i.test(res.contentType)||state.pretty&&/^\s*[\[{]/.test(text)){try{return JSON.stringify(JSON.parse(text),null,2);}catch{}}
 return text;
}
function renderResponse(){
 const box=els.response;if(!box)return;
 if(els.sendBtn)els.sendBtn.textContent=state.sending?t('apiCancel'):t('apiSend');
 const r=state.response;
 if(state.sending){box.replaceChildren(h('p',{class:'api-hint'},t('apiSending')));return;}
 if(!r){box.replaceChildren(h('p',{class:'api-hint'},t('apiNoResponse')));return;}
 if(r.error){
  const text=r.error==='timeout'?t('apiTimeout',r.detail):r.error==='cancelled'?t('apiCancelled'):`${t('apiFailed')}: ${r.detail||r.error}`;
  box.replaceChildren(h('div',{class:'api-status is-error',role:'alert'},text,h('span',{},`${r.timeMs} ms`)));return;
 }
 const kind=r.status>=500?'is-error':r.status>=400?'is-warn':r.status>=300?'is-redirect':'is-ok';
 const body=h('pre',{class:'api-pre api-resp-body',tabindex:'0'},state.respTab==='headers'?r.headers.map(([k,v])=>`${k}: ${v}`).join('\n'):prettyBody(r));
 box.replaceChildren(
  h('div',{class:`api-status ${kind}`},h('strong',{},`${r.status} ${r.statusText||''}`),h('span',{},`${r.timeMs} ms`),h('span',{},fmtSize(r.size)),r.truncated?h('span',{},t('apiTruncated')):null),
  h('div',{class:'api-resp-tabs',role:'tablist'},
   ...['body','headers'].map(id=>h('button',{type:'button',role:'tab','aria-selected':String(state.respTab===id),class:state.respTab===id?'is-active':'',onClick:()=>{state.respTab=id;renderResponse();}},t(id==='body'?'apiRespBody':'apiRespHeaders'))),
   state.respTab==='body'?h('button',{type:'button',class:'api-btn',onClick:()=>{state.pretty=!state.pretty;renderResponse();}},state.pretty?t('apiRaw'):t('apiPretty')):null,
   h('button',{type:'button',class:'api-btn',onClick:async e=>{try{await navigator.clipboard.writeText(body.textContent);e.target.textContent=t('apiCopied');setTimeout(()=>{e.target.textContent=t('apiCopy');},1200);}catch{}}},t('apiCopy'))),
  body);
}

/* ---------- ambientes ---------- */
async function openEnvEditor(){
 if(!state.coll)return;
 const names=await api('GET',`/collections/${state.coll.id}/environments`);
 let current=state.env&&names.includes(state.env)?state.env:names[0]||null,vars=[];
 const overlay=h('div',{class:'api-modal',role:'dialog','aria-modal':'true','aria-label':t('apiEnvironments')});
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey,true);};
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
 document.addEventListener('keydown',onKey,true);
 const draw=async()=>{
  if(current){try{vars=(await api('GET',`/collections/${state.coll.id}/environments/${encodeURIComponent(current)}`)).vars;}catch{vars=[];}}
  const sel=h('select',{'aria-label':t('apiEnvironment'),onChange:async e=>{current=e.target.value;await draw();}},...names.map(n=>h('option',{value:n,selected:n===current},n)));
  const table=h('div',{class:'api-kv api-env-table'},h('div',{class:'api-kv-row api-kv-head'},h('span',{}),h('span',{},t('apiName')),h('span',{},t('apiValue')),h('span',{},t('apiSecret')),h('span',{})));
  const rows=()=>vars.forEach((v,i)=>{
   const value=h('input',{type:v.secret?'password':'text',value:v.value,spellcheck:'false','aria-label':t('apiValue'),onInput:e=>{v.value=e.target.value;}});
   table.append(h('div',{class:'api-kv-row'},
    h('input',{type:'checkbox',checked:v.enabled!==false,'aria-label':t('apiEnabled'),onChange:e=>{v.enabled=e.target.checked;}}),
    h('input',{type:'text',value:v.name,placeholder:t('apiName'),'aria-label':t('apiName'),spellcheck:'false',onInput:e=>{v.name=e.target.value;}}),value,
    h('input',{type:'checkbox',checked:!!v.secret,'aria-label':t('apiSecret'),onChange:e=>{v.secret=e.target.checked;value.type=v.secret?'password':'text';}}),
    h('button',{type:'button',class:'api-icon-btn','aria-label':t('apiRemove'),onClick:()=>{vars.splice(i,1);table.replaceChildren(table.firstChild);rows();}},'×')));
  });
  rows();
  const save=async()=>{
   if(!current)return;
   try{await api('PUT',`/collections/${state.coll.id}/environments/${encodeURIComponent(current)}`,{vars});state.env=current;store.set(`cm-api-env:${state.coll.id}`,current);state.coll.environments=await api('GET',`/collections/${state.coll.id}/environments`);await loadEnv();renderHeader();renderTab();close();}catch(e){toast(e.message);}
  };
  overlay.replaceChildren(h('div',{class:'api-modal-card'},
   h('header',{},h('h3',{},t('apiEnvironments')),h('button',{type:'button',class:'api-icon-btn','aria-label':t('close'),onClick:close},'×')),
   h('div',{class:'api-field-row'},names.length?sel:h('span',{class:'api-hint'},t('apiNoEnvYet')),
    h('button',{type:'button',class:'api-btn',onClick:async()=>{const n=prompt(t('apiPromptEnv'));if(!n||!n.trim())return;current=n.trim();if(!names.includes(current))names.push(current);vars=[];try{await api('PUT',`/collections/${state.coll.id}/environments/${encodeURIComponent(current)}`,{vars:[]});}catch(e){toast(e.message);}await draw();}},t('apiNewEnv')),
    current?h('button',{type:'button',class:'api-btn danger',onClick:async()=>{if(!confirm(t('apiConfirmDelete',current)))return;try{await api('DELETE',`/collections/${state.coll.id}/environments/${encodeURIComponent(current)}`);names.splice(names.indexOf(current),1);current=names[0]||null;state.coll.environments=names.slice();if(state.env&&!names.includes(state.env)){state.env=current;}await loadEnv();await draw();renderHeader();}catch(e){toast(e.message);}}},t('apiDeleteEnv')):null),
   current?table:null,
   current?h('button',{type:'button',class:'api-btn',onClick:()=>{vars.push({name:'',value:'',enabled:true,secret:false});table.replaceChildren(table.firstChild);rows();}},`+ ${t('apiAddVariable')}`):null,
   h('p',{class:'api-hint'},t('apiSecretNote')),
   h('footer',{},h('button',{type:'button',class:'api-btn',onClick:close},t('cancel')),h('button',{type:'button',class:'api-btn primary',disabled:current?null:true,onClick:save},t('save')))));
 };
 panel.append(overlay);await draw();overlay.querySelector('select,input,button')?.focus();
}

/* ---------- coleções ---------- */
async function createCollection(){
 const name=prompt(t('apiPromptCollection'));if(!name||!name.trim())return;
 try{const made=await api('POST','/collections',{name:name.trim()});await loadCollections();await selectCollection(made.id);}catch(e){toast(e.message);}
}
async function selectCollection(id){
 await flushSave();state.request=null;state.reqPath='';state.response=null;
 await loadCollection(id);renderAll();
}
async function importZip(file){
 try{const made=await api('POST','/collections/import',file);await loadCollections();await selectCollection(made.id);toast(t('apiImported',made.name));}catch(e){toast(e.message&&!/^\d+$/.test(e.message)?e.message:t('importError'));}
}
async function deleteCollection(){
 if(!state.coll||!confirm(t('apiConfirmDeleteCollection',state.coll.name)))return;
 try{await api('DELETE',`/collections/${state.coll.id}`);await loadCollections();await selectCollection(state.collections[0]?.id||null);}catch(e){toast(e.message);}
}
function attachTo(target){hooks.attach?.({collection:state.coll.id,collectionName:state.coll.name,...target});}

/* ---------- cabeçalho ---------- */
function renderHeader(){
 if(!els.head)return;
 const collSel=h('select',{class:'api-select','aria-label':t('apiCollection'),onChange:e=>selectCollection(e.target.value)},...(state.collections.length?state.collections.map(c=>h('option',{value:c.id,selected:c.id===state.coll?.id},c.name)):[h('option',{value:''},t('apiNoCollectionsShort'))]));
 const envSel=h('select',{class:'api-select','aria-label':t('apiEnvironment'),disabled:state.coll?null:true,onChange:async e=>{state.env=e.target.value||null;store.set(`cm-api-env:${state.coll.id}`,state.env||'');await loadEnv();if(state.tab==='vars')renderTab();}},h('option',{value:''},t('apiNoEnv')),...(state.coll?.environments||[]).map(n=>h('option',{value:n,selected:n===state.env},n)));
 const menu=h('div',{class:'api-menu',role:'menu',hidden:true},
  ...[[t('apiNewCollection'),createCollection],[t('apiImport'),()=>els.importInput.click()],[t('apiExport'),()=>{if(state.coll)location.href=`api/collections/${state.coll.id}/export`;}],[t('apiDeleteCollection'),deleteCollection,true]].map(([label,fn,danger])=>h('button',{type:'button',role:'menuitem',class:danger?'danger':'',onClick:()=>{menu.hidden=true;fn();}},label)));
 els.menu=menu;
 els.head.replaceChildren(h('strong',{class:'api-title'},t('apiTitle')),collSel,envSel,
  h('button',{type:'button',class:'api-icon-btn',title:t('apiEditEnv'),'aria-label':t('apiEditEnv'),disabled:state.coll?null:true,onClick:openEnvEditor},'⚙'),
  h('span',{class:'api-spacer'}),
  h('div',{class:'api-menu-wrap'},h('button',{type:'button',class:'api-icon-btn','aria-haspopup':'menu',title:t('apiMore'),'aria-label':t('apiMore'),onClick:()=>{menu.hidden=!menu.hidden;}},'⋯'),menu),
  h('button',{type:'button',class:'api-icon-btn',title:t('apiClose'),'aria-label':t('apiClose'),onClick:closeApiPanel},'×'));
}
function renderAll(withMain=true){renderHeader();renderTree();if(withMain)renderMain();}

/* ---------- painel ---------- */
function build(){
 els.save=h('span',{class:'api-save',role:'status','aria-live':'polite'});
 els.head=h('header',{class:'api-head'});
 els.tree=h('ul',{class:'api-tree',role:'tree','aria-label':t('apiTitle')});
 els.main=h('section',{class:'api-main'});
 els.importInput=h('input',{type:'file',accept:'.zip,application/zip',hidden:true,onChange:e=>{const f=e.target.files[0];e.target.value='';if(f)importZip(f);}});
 const filter=h('input',{type:'search',class:'api-filter',placeholder:t('apiFilter'),'aria-label':t('apiFilter'),onInput:e=>{state.filter=e.target.value;renderTree();}});
 const treeCol=h('nav',{class:'api-tree-col','aria-label':t('apiTitle')},
  h('div',{class:'api-tree-tools'},filter,h('button',{type:'button',class:'api-icon-btn',title:t('apiNewRequest'),'aria-label':t('apiNewRequest'),onClick:()=>state.coll&&newItem('request','')},'+'),h('button',{type:'button',class:'api-icon-btn',title:t('apiNewFolder'),'aria-label':t('apiNewFolder'),onClick:()=>state.coll&&newItem('folder','')},'▤')),
  els.tree);
 const resizer=h('div',{class:'api-resizer',role:'separator','aria-orientation':'vertical','aria-label':t('apiResize'),tabindex:'0'});
 panel=h('aside',{id:'api-panel',class:'api-panel',role:'complementary','aria-label':t('apiTitle'),hidden:true},resizer,els.head,h('div',{class:'api-body'},treeCol,els.main),els.importInput);
 document.body.append(panel);
 // largura: arrastar a borda ou usar as setas
 const setWidth=px=>{const w=Math.min(Math.max(px,420),window.innerWidth-260);document.documentElement.style.setProperty('--api-w',`${w}px`);store.set('cm-api-width',String(Math.round(w)));};
 resizer.addEventListener('pointerdown',e=>{e.preventDefault();resizer.setPointerCapture(e.pointerId);document.body.classList.add('api-resizing');});
 resizer.addEventListener('pointermove',e=>{if(resizer.hasPointerCapture(e.pointerId))setWidth(window.innerWidth-e.clientX);});
 const endResize=e=>{if(resizer.hasPointerCapture?.(e.pointerId))resizer.releasePointerCapture(e.pointerId);document.body.classList.remove('api-resizing');window.dispatchEvent(new Event('resize'));};
 resizer.addEventListener('pointerup',endResize);resizer.addEventListener('pointercancel',endResize);
 resizer.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setWidth(panel.offsetWidth+(e.key==='ArrowLeft'?40:-40));window.dispatchEvent(new Event('resize'));}});
 const saved=Number(store.get('cm-api-width'));
 document.documentElement.style.setProperty('--api-w',saved>=420?`${Math.min(saved,window.innerWidth-260)}px`:'50vw');
 panel.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!panel.querySelector('.api-modal')){if(!els.menu.hidden){els.menu.hidden=true;return;}closeApiPanel();}
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();send();}
 });
 document.addEventListener('pointerdown',e=>{if(els.menu&&!els.menu.hidden&&!e.target.closest('.api-menu-wrap'))els.menu.hidden=true;});
}

/* ---------- interface pública ---------- */
export function initApiClient(options={}){hooks=options;}
export const isApiOpen=()=>state.open;
export async function openApiPanel({collection,path}={}){
 if(!panel)build();
 state.open=true;panel.hidden=false;document.body.classList.add('api-open');
 try{
  await loadCollections();
  const wanted=collection&&state.collections.some(c=>c.id===collection)?collection:state.collections.some(c=>c.id===store.get('cm-api-coll'))?store.get('cm-api-coll'):state.collections[0]?.id;
  if(wanted)await loadCollection(wanted);else{state.coll=null;state.request=null;state.reqPath='';}
  renderAll();
  if(path){
   const item=findItem(state.coll?.tree||[],path);
   if(item?.type==='request')await openRequest(path);
   else if(item?.type==='folder'){state.expanded.add(path);let p=parentOf(path);while(p){state.expanded.add(p);p=parentOf(p);}renderTree();}
  }
 }catch(e){toast(e.message);}
 window.dispatchEvent(new Event('resize'));
 panel.querySelector('.api-url,.api-select')?.focus({preventScroll:true});
}
export async function closeApiPanel(){
 if(!panel||!state.open)return;
 await flushSave();state.open=false;panel.hidden=true;document.body.classList.remove('api-open');
 window.dispatchEvent(new Event('resize'));hooks.onClose?.();
}
export const API_DRAG_TYPE=API_TYPE;
/* Resumo de uma coleção/pasta para o "cartão" no mapa: nome, quantidade e as primeiras requests. */
export async function summarize({collection,path=''}){
 const detail=await api('GET',`/collections/${collection}`);
 const base=path?findItem(detail.tree,path):{children:detail.tree,name:detail.name,type:'collection'};
 if(!base)return null;
 const requests=[];const walk=items=>{for(const it of items){if(it.type==='request')requests.push({name:it.name,method:it.method,path:it.path});else walk(it.children);}};
 walk(base.children||[]);
 if(base.type==='request')requests.push({name:base.name,method:base.method,path:base.path});
 return {name:path?base.name:detail.name,collectionName:detail.name,type:path?base.type:'collection',count:requests.length,requests:requests.slice(0,4)};
}
