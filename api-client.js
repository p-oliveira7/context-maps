/* Cliente de API (estilo Postman/Bruno): painel à direita, coleções no formato Bruno, variáveis de ambiente e envio pelo servidor local. */
import {t,lang} from './i18n.js?v=1';
import {activeEntries,resolveVars,buildRaw,resolveRaw,buildRequest,toScriptReq,applyScriptReq,makeScope} from './pipeline.js?v=1';
import {runAssertions,evalValueExpression} from './assertions.js?v=1';
import {runScript,sandboxSupported} from './sandbox.js?v=1';
import {createVarFields} from './var-field.js?v=1';
import {collectRequests,runSequence,reportJson,reportText} from './runner.js?v=1';
import {createRunReport} from './run-report.js?v=1';
import {createBodyView} from './response-view.js?v=1';
import {parseCurl,toCurl,toFetch} from './curl.js?v=1';
import {normalizeMocks,emptyMocks,effectiveMock,mockBadge,mockCounts,scenarioResponse,scenarioFromPreset,newScenarioId,statusText,PRESETS} from './mocks.js?v=1';
export {resolveVars,buildRequest};

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
const state={open:false,collections:[],coll:null,env:null,envVars:new Map(),envMeta:new Map(),runtime:new Map(),scripts:store.get('cm-api-scripts')!=='0',request:null,reqPath:'',saveTimer:0,saving:Promise.resolve(),response:null,sending:false,abort:null,tab:'params',respTab:'body',pretty:true,expanded:new Set(),filter:'',attach:null,run:null,view:'request',report:null,tabs:[],layout:'',split:0,maxResp:false,mocks:emptyMocks(),mockMode:false,mocksDirty:false,mockSel:{}};
let panel,els={},hooks={};

/* ---------- variáveis {{nome}}: de onde vêm, como salvar, e os campos que as destacam ---------- */
function varInfo(name){ // precedência igual à do envio: sessão > request > ambiente > coleção
 if(name.startsWith('$'))return {scope:'dynamic',value:resolveVars(`{{${name}}}`,new Map())};
 if(state.runtime.has(name))return {scope:'runtime',value:state.runtime.get(name)};
 const own=activeEntries(state.request?.varsPre).find(e=>e.name===name);
 if(own)return {scope:'request',value:own.value};
 if(state.envVars.has(name))return {scope:'env',value:state.envVars.get(name),secret:!!state.envMeta?.get(name)?.secret};
 const coll=(state.coll?.defaults?.vars||[]).find(v=>v.enabled!==false&&v.name===name);
 if(coll)return {scope:'collection',value:coll.value};
 return {scope:'none',value:''};
}
function scopeOptions(){
 const list=[];
 if(state.env)list.push({id:'env',label:t('apiScopeEnv',state.env)});
 list.push({id:'request',label:t('apiScopeRequest')},{id:'runtime',label:t('apiScopeRuntime')});
 return list;
}
async function saveVar(name,value,{scope,secret}){
 if(scope==='runtime'){state.runtime.set(name,value);syncVarsUi();}
 else if(scope==='request'&&state.request){
  const list=(state.request.varsPre||=[]),found=list.find(e=>e.name===name);
  if(found){found.value=value;found.enabled=true;}else list.push({name,value,enabled:true});
  markDirty();if(state.tab==='vars')renderTab();
 }else if(scope==='env'&&state.env){
  const route=`/collections/${state.coll.id}/environments/${encodeURIComponent(state.env)}`,env=await api('GET',route),found=env.vars.find(v=>v.name===name);
  if(found){found.value=value;found.enabled=true;}else env.vars.push({name,value,enabled:true,secret:!!secret});
  await api('PUT',route,{vars:env.vars});await loadEnv();
 }else throw new Error(t('apiVarNoValue'));
}
const vf=createVarFields({info:varInfo,save:saveVar,scopes:scopeOptions,t});
const refreshVars=()=>vf.refresh();

/* ---------- carregamento ---------- */
async function loadCollections(){state.collections=await api('GET','/collections');}
async function loadCollection(id){
 if(!id){state.coll=null;state.tabs=[];clearActive();return;}
 const detail=await api('GET',`/collections/${id}`);
 if(state.coll?.id!==id)state.runtime=new Map(); // variáveis de execução valem por coleção
 state.coll=detail;store.set('cm-api-coll',id);
 state.mocks=normalizeMocks(detail.mocks);state.mockMode=store.get(`cm-api-mockmode:${id}`)==='1';state.mocksDirty=false;state.mockSel={};
 const saved=store.get(`cm-api-env:${id}`);
 state.env=detail.environments.includes(saved)?saved:detail.environments[0]||null;
 state.envVars=new Map();
 if(state.env)await loadEnv();
 state.expanded=new Set([''].concat(detail.tree.filter(i=>i.type==='folder').map(i=>i.path)));
}
async function loadEnv(){
 state.envVars=new Map();state.envMeta=new Map();
 if(!state.env){refreshVars();return;}
 try{const env=await api('GET',`/collections/${state.coll.id}/environments/${encodeURIComponent(state.env)}`);for(const v of env.vars)if(v.enabled!==false&&v.name){state.envVars.set(v.name,v.value);state.envMeta.set(v.name,{secret:!!v.secret});}}catch{}
 refreshVars();
}
/* ---------- abas de requests ----------
   state.request/reqPath/response/tab/respTab são os da aba ativa; cada aba guarda os seus em state.tabs. */
const tabEntry=path=>state.tabs.find(x=>x.path===path);
const newEntry=(path,request)=>({path,request,dirty:false,response:null,tab:'params',respTab:'body',sending:false,abort:null});
function stashActive(){const e=tabEntry(state.reqPath);if(e){e.request=state.request;e.response=state.response;e.tab=state.tab;e.respTab=state.respTab;}}
function loadEntry(e){state.request=e.request;state.reqPath=e.path;state.response=e.response;state.tab=e.tab;state.respTab=e.respTab;state.sending=!!e.sending;state.abort=e.abort||null;}
function clearActive(){state.request=null;state.reqPath='';state.response=null;state.sending=false;state.abort=null;}
function persistTabs(){if(state.coll)store.set(`cm-api-tabs:${state.coll.id}`,JSON.stringify({paths:state.tabs.map(x=>x.path),active:state.reqPath}));}
async function restoreTabs(){
 const id=state.coll?.id;if(!id||state.tabs.length)return;
 let saved=null;try{saved=JSON.parse(store.get(`cm-api-tabs:${id}`)||'null');}catch{}
 if(!Array.isArray(saved?.paths)||!saved.paths.length)return;
 const loaded=await Promise.all(saved.paths.map(p=>api('GET',`/collections/${id}/request?path=${encodeURIComponent(p)}`).then(request=>newEntry(p,request),()=>null)));
 if(state.coll?.id!==id||state.tabs.length)return;
 state.tabs=loaded.filter(Boolean);
 const active=state.tabs.find(x=>x.path===saved.active)||state.tabs.at(-1);
 if(active)loadEntry(active);
}
let openSeq=0;
async function openRequest(path){
 const seq=++openSeq; // cliques em sequência: vale o último
 await flushSave();
 if(seq!==openSeq)return;
 state.view='request';stashActive();hideTree();
 if(!path){clearActive();renderMain();renderTree();return;}
 let entry=tabEntry(path);
 if(!entry){
  let request=null;try{request=await api('GET',`/collections/${state.coll.id}/request?path=${encodeURIComponent(path)}`);}catch{}
  if(seq!==openSeq)return;
  if(!request){clearActive();renderMain();renderTree();return;}
  entry=newEntry(path,request);state.tabs.push(entry);
 }
 loadEntry(entry);renderMain();renderTree();persistTabs();
}
async function closeTab(path){
 stashActive();
 const entry0=tabEntry(path);if(!entry0)return;
 if(entry0.dirty&&!(await guardUnsaved([entry0])))return;
 if(entry0.dirty&&state.mocksDirty&&!state.tabs.some(x=>x!==entry0&&x.dirty))await reloadMocks(); // descartou: os mocks voltam ao que está no arquivo
 const i=state.tabs.findIndex(x=>x.path===path);if(i<0)return;
 const wasActive=state.reqPath===path;
 state.tabs[i].abort?.abort();state.tabs.splice(i,1);
 if(wasActive){const next=state.tabs[i]||state.tabs[i-1];if(next)loadEntry(next);else clearActive();}
 persistTabs();renderMain();renderTree();
}
function dropTabs(prefix){ // o item (ou a pasta) foi apagado ou renomeado: as abas dele deixam de valer
 const gone=state.tabs.filter(x=>x.path===prefix||x.path.startsWith(`${prefix}/`));
 if(!gone.length)return;
 gone.forEach(x=>x.abort?.abort());
 const activeGone=gone.some(x=>x.path===state.reqPath);
 state.tabs=state.tabs.filter(x=>!gone.includes(x));
 if(activeGone){const next=state.tabs.at(-1);if(next)loadEntry(next);else clearActive();}
 persistTabs();
}
function renderTabbar(){
 const bar=els.tabbar;if(!bar)return;
 const running=state.run?.status==='running';
 const tabs=state.tabs.map(e=>{
  const active=state.view==='request'&&e.path===state.reqPath,name=e.request?.name||e.path;
  return h('div',{class:`api-tab${active?' is-active':''}`,role:'presentation',dataset:{path:e.path}},
   h('button',{type:'button',role:'tab',class:'api-tab-main','aria-selected':String(active),tabindex:active?'0':'-1',title:e.path,'aria-keyshortcuts':'Delete',onClick:()=>openRequest(e.path),onAuxclick:ev=>{if(ev.button===1){ev.preventDefault();closeTab(e.path);}}},
    methodBadge(e.request?.method||'get'),h('span',{class:'api-tab-name'},name),effectiveMock(state.mocks,e.path,state.mockMode)?h('span',{class:'api-mock-pill is-on is-tiny',title:t('apiMockActiveTitle')},'M'):null,e.dirty?h('span',{class:'api-tab-dirty',role:'img','aria-label':t('unsaved'),title:t('unsaved')},'●'):null),
   h('button',{type:'button',class:'api-tab-close',tabindex:'-1',title:t('apiTabClose',name),'aria-label':t('apiTabClose',name),onClick:()=>closeTab(e.path)},'×'));
 });
 if(state.run){
  const active=state.view==='run',name=t('apiRunTabTitle',state.run.title);
  tabs.push(h('div',{class:`api-tab api-tab-report${active?' is-active':''}${running?' is-running':''}`,role:'presentation'},
   h('button',{type:'button',role:'tab',class:'api-tab-main','aria-selected':String(active),tabindex:active?'0':'-1',title:name,onClick:showReport},
    h('span',{class:'api-tab-icon','aria-hidden':'true'},running?'↻':'▶'),h('span',{class:'api-tab-name'},name)),
   h('button',{type:'button',class:'api-tab-close',tabindex:'-1',title:t('apiTabClose',name),'aria-label':t('apiTabClose',name),onClick:()=>reportActions.close()},'×')));
 }
 const hadFocus=bar.contains(document.activeElement);
 bar.hidden=!tabs.length;bar.replaceChildren(...tabs);
 const current=bar.querySelector('.is-active .api-tab-main');
 if(hadFocus)current?.focus({preventScroll:true});
 current?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function onTabbarKey(e){
 const mains=[...els.tabbar.querySelectorAll('.api-tab-main')],i=mains.indexOf(document.activeElement);if(i<0)return;
 const go=n=>{e.preventDefault();mains[n]?.click();}; // o foco acompanha a aba ativa (renderTabbar)
 if(e.key==='ArrowRight')go((i+1)%mains.length);
 else if(e.key==='ArrowLeft')go((i-1+mains.length)%mains.length);
 else if(e.key==='Home')go(0);else if(e.key==='End')go(mains.length-1);
 else if(e.key==='Delete'||e.key==='Backspace'){
  e.preventDefault();const tab=mains[i].closest('.api-tab');
  if(tab.classList.contains('api-tab-report'))reportActions.close();else closeTab(tab.dataset.path);
 }
}

/* ---------- salvar ---------- */
/* ---------- salvar: só com Ctrl+S (ou o botão Salvar); nada é gravado sozinho ---------- */
const modelOf=entry=>{const {path:_p,...model}=entry.request;return model;};
function setSaveState(text,kind=''){const el=els.save;if(el){el.textContent=text;el.dataset.state=kind;}}
function syncSaveUi(){ // rótulo e botão Salvar da aba ativa
 const e=tabEntry(state.reqPath),dirty=!!e?.dirty;
 if(dirty)setSaveState(t('unsaved'),'dirty');
 else if(e?.saveError)setSaveState(t('saveError'),'error');
 else if(e?.savedAt)setSaveState(t('saved'),'saved');
 else setSaveState('');
 if(els.saveBtn)els.saveBtn.disabled=!dirty;
}
function markDirty(){
 const e=tabEntry(state.reqPath);if(!e||!state.request)return;
 refreshVars();
 e.saveError=false;
 if(!e.dirty){e.dirty=true;renderTabbar();}
 syncSaveUi();
}
/* grava a aba e diz se deu certo; o que foi digitado durante a gravação continua marcado como não salvo */
function saveEntry(e){
 if(!e||!state.coll)return Promise.resolve(true);
 const id=state.coll.id,model=modelOf(e),snapshot=JSON.stringify(model);
 if(e.path===state.reqPath)setSaveState(t('saving'),'saving');
 const job=state.saving.then(()=>api('PUT',`/collections/${id}/request?path=${encodeURIComponent(e.path)}`,model)).then(async()=>{
  if(state.mocksDirty){try{state.mocks=normalizeMocks(await api('PUT',`/collections/${id}/mocks`,state.mocks));state.mocksDirty=false;}catch{return false;}} // os mocks vão junto com a request
  return true;
 },()=>false);
 state.saving=job;
 return job.then(ok=>{
  if(ok){e.dirty=JSON.stringify(modelOf(e))!==snapshot;e.saveError=false;e.savedAt=Date.now();}else e.saveError=true;
  renderTabbar();renderTree();if(e.path===state.reqPath)syncSaveUi();
  return ok;
 });
}
const saveActive=()=>{const e=tabEntry(state.reqPath);return e?.dirty?saveEntry(e):Promise.resolve(true);};
const dirtyTabs=(prefix=null)=>state.tabs.filter(x=>x.dirty&&(prefix===null||x.path===prefix||x.path.startsWith(`${prefix}/`)));
async function saveAll(list){for(const e of list)if(!(await saveEntry(e)))return false;return true;}
const flushSave=()=>state.saving; // só espera uma gravação em andamento
function confirmUnsaved(list){ // 'save' | 'discard' | 'cancel'
 return new Promise(resolve=>{
  const back=document.activeElement,names=list.map(x=>x.request?.name||x.path);
  const overlay=h('div',{class:'api-modal',role:'alertdialog','aria-modal':'true','aria-labelledby':'api-unsaved-title','aria-describedby':'api-unsaved-desc'});
  const done=choice=>{overlay.remove();document.removeEventListener('keydown',onKey,true);if(back?.isConnected)back.focus({preventScroll:true});resolve(choice);};
  const saveBtn=h('button',{type:'button',class:'api-btn primary',onClick:()=>done('save')},list.length>1?t('apiSaveAll'):t('save'));
  const discard=h('button',{type:'button',class:'api-btn danger',onClick:()=>done('discard')},t('apiDontSave'));
  const cancel=h('button',{type:'button',class:'api-btn',onClick:()=>done('cancel')},t('cancel'));
  function onKey(e){
   if(!overlay.isConnected)return;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done('cancel');}
   else if(e.key==='Tab'){
    const items=[discard,cancel,saveBtn],i=items.indexOf(document.activeElement);
    e.preventDefault();items[(i+(e.shiftKey?-1:1)+items.length)%items.length].focus();
   }
  }
  document.addEventListener('keydown',onKey,true);
  overlay.append(h('div',{class:'api-modal-card api-unsaved-card'},
   h('header',{},h('h3',{id:'api-unsaved-title'},t('apiUnsavedTitle'))),
   h('p',{id:'api-unsaved-desc'},list.length===1?t('apiUnsavedOne',names[0]):t('apiUnsavedMany',list.length,names.slice(0,5).join(', '))),
   h('footer',{},discard,cancel,saveBtn)));
  panel.append(overlay);saveBtn.focus();
 });
}
async function guardUnsaved(list){ // true = pode seguir (salvou ou descartou)
 if(!list.length)return true;
 const choice=await confirmUnsaved(list);
 if(choice==='cancel')return false;
 if(choice==='save'){if(await saveAll(list))return true;toast(t('apiSaveFailed'));return false;}
 return true;
}

/* ---------- envio ---------- */
function collectionVars(){return new Map((state.coll?.defaults?.vars||[]).filter(v=>v.enabled!==false).map(v=>[v.name,v.value]));}
function allVars(model=state.request){const vars=collectionVars();for(const [k,v] of state.envVars)vars.set(k,v);for(const e of activeEntries(model?.varsPre))vars.set(e.name,e.value);for(const [k,v] of state.runtime)vars.set(k,v);return vars;}
const SCRIPT_MS=5000;
const requestVarsObject=model=>Object.fromEntries(activeEntries(model?.varsPre).map(e=>[e.name,e.value]));
async function scriptStep(model,kind,code,input,extra){
 if(!state.scripts||!String(code||'').trim())return null;
 if(!sandboxSupported()){extra.errors.push({where:kind,message:t('apiSandboxUnavailable')});return null;}
 const out=await runScript({code,timeoutMs:SCRIPT_MS,input:{vars:Object.fromEntries(state.runtime),envVars:Object.fromEntries(state.envVars),requestVars:requestVarsObject(model),envName:state.env||'',name:model?.name||'',authMode:model?.authMode||'none',...input}});
 if(!out.ok){extra.errors.push({where:kind,message:/timeout/.test(out.error)?t('apiScriptTimeout'):out.error});return null;}
 for(const log of out.logs)extra.logs.push({...log,where:kind});
 if(out.error)extra.errors.push({where:kind,message:out.error});
 for(const test of out.tests)extra.tests.push(test);
 state.runtime=new Map(Object.entries(out.vars));state.envVars=new Map(Object.entries(out.envVars)); // só na memória: o arquivo do ambiente não muda
 return out;
}
/* Uma request do começo ao fim (pré-script, envio, variáveis, asserts, testes). Serve ao botão Enviar e à execução de pastas;
   as variáveis de sessão (state.runtime) passam de uma request para a seguinte. */
async function execute(model,signal,relPath=''){
 const started=performance.now(),extra={logs:[],tests:[],asserts:[],errors:[]},took=()=>Math.round(performance.now()-started);
 let sent,unresolved=[];
 try{
  // 1) pré-requisição: o script vê o request com as {{variáveis}} ainda por resolver e pode mudar variáveis, URL, cabeçalhos e corpo
  const raw=buildRaw(model,state.coll?.defaults?.headers);
  const pre=await scriptStep(model,'pre-request',model.scriptPre,{req:toScriptReq(raw)},extra);
  if(pre)applyScriptReq(raw,pre.req);
  // 2) resolver variáveis e enviar pelo servidor
  const vars=allVars(model),req=resolveRaw(raw,vars);
  sent={method:req.method,url:req.url,headers:req.headers.map(h=>[h.name,h.value]),body:req.body};
  unresolved=findUnresolved(req);
  const mock=effectiveMock(state.mocks,relPath,state.mockMode),tag=mock?{id:mock.id,name:mock.name}:undefined;
  let data;
  if(mock){ // mock: nenhuma chamada de rede; o cenário ativo responde (com o atraso configurado)
   unresolved=[];await mockDelay(mock.delayMs,signal);
   data=scenarioResponse(mock,text=>resolveVars(text,allVars(model)),{url:req.url});
   if(data.error)return {error:data.error,detail:data.detail,timeMs:took(),extra,sent,unresolved,mock:tag};
  }else{
   const res=await fetch('api/send',{method:'POST',headers:{'x-context-maps':'1','x-lang':lang,'content-type':'application/json'},body:JSON.stringify({...req,timeoutMs:req.timeout}),signal});
   data=await res.json();
   if(!res.ok)return {error:'request',detail:data.error||String(res.status),timeMs:took(),extra,sent,unresolved};
  }
  const response={...data,...(tag?{mock:tag}:{})};
  const scope=makeScope(response,req),interpolate=text=>resolveVars(text,allVars(model));
  // 3) variáveis pós-resposta, script pós-resposta, asserts e testes
  for(const e of activeEntries(model.varsPost)){const v=evalValueExpression(e.value,scope,interpolate);state.runtime.set(e.name,v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v));}
  await scriptStep(model,'post-response',model.scriptPost,{req:toScriptReq({method:req.method,url:req.url,headers:req.headers,body:req.body}),res:{...scope.res}},extra);
  extra.asserts=runAssertions(model.assertions,scope,interpolate);
  await scriptStep(model,'tests',model.tests,{req:toScriptReq({method:req.method,url:req.url,headers:req.headers,body:req.body}),res:{...scope.res}},extra);
  return {...response,extra,sent,unresolved};
 }catch(error){
  return error?.name==='AbortError'?{error:'cancelled',timeMs:took(),extra,sent,unresolved}:{error:'network',detail:String(error?.message||error),timeMs:took(),extra,sent,unresolved};
 }
}
async function send(){
 const entry=tabEntry(state.reqPath);
 if(!state.request||!entry||entry.sending)return;
 entry.sending=true;entry.abort=new AbortController();entry.response=null;
 state.sending=true;state.abort=entry.abort;state.response=null;renderResponse();
 const result=await execute(entry.request,entry.abort.signal,entry.path); // a aba pode mudar enquanto espera: a resposta fica na aba de origem
 entry.sending=false;entry.abort=null;entry.response=result;syncVarsUi();
 if(state.reqPath===entry.path){state.sending=false;state.abort=null;state.response=result;renderResponse();if(state.tab==='vars')renderTab();}
}

/* ---------- tabelas chave/valor ---------- */
function kvTable(list,{onChange,toggle=true,namePlaceholder=t('apiName'),valuePlaceholder=t('apiValue'),addLabel=t('apiAdd'),lockedNames=false}){
 const body=h('div',{class:'api-kv'});
 const draw=()=>{
  body.replaceChildren(...[...list.map((entry,i)=>h('div',{class:'api-kv-row'},
   toggle?h('input',{type:'checkbox','aria-label':t('apiEnabled'),checked:entry.enabled!==false,onChange:e=>{entry.enabled=e.target.checked;onChange();}}):null,
   h('input',{type:'text',value:entry.name,placeholder:namePlaceholder,'aria-label':namePlaceholder,spellcheck:'false',readonly:lockedNames||null,onInput:e=>{entry.name=e.target.value;onChange();}}),
   vf.varField(h('input',{type:'text',value:entry.value,placeholder:valuePlaceholder,'aria-label':valuePlaceholder,spellcheck:'false',onInput:e=>{entry.value=e.target.value;onChange();}})),
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
   h('button',{type:'button',class:'api-row-main',draggable:'true',onClick:()=>{if(isFolder){state.expanded.has(it.path)?state.expanded.delete(it.path):state.expanded.add(it.path);renderTree();}else openRequest(it.path);}},
    isFolder?h('span',{class:'api-caret','aria-hidden':'true'},open?'▾':'▸'):methodBadge(it.method),
    h('span',{class:'api-row-name'},isFolder?`📁 ${it.name}`:it.name),mockPill(it)),
   h('span',{class:'api-row-actions'},
    isFolder?h('button',{type:'button',class:'api-icon-btn api-run-btn',title:t('apiRunFolder'),'aria-label':`${t('apiRunFolder')}: ${it.name}`,onClick:()=>startRun({path:it.path,recursive:false})},'▶'):null,
    isFolder?h('button',{type:'button',class:'api-icon-btn api-run-btn',title:t('apiRunFolderAll'),'aria-label':`${t('apiRunFolderAll')}: ${it.name}`,onClick:()=>startRun({path:it.path,recursive:true})},'▶▶'):null,
    isFolder?h('button',{type:'button',class:'api-icon-btn',title:t('apiNewRequest'),'aria-label':`${t('apiNewRequest')}: ${it.name}`,onClick:()=>newItem('request',it.path)},'+'):null,
    isFolder?h('button',{type:'button',class:'api-icon-btn',title:t('apiNewFolder'),'aria-label':`${t('apiNewFolder')}: ${it.name}`,onClick:()=>newItem('folder',it.path)},'▤'):null,
    hooks.attach?h('button',{type:'button',class:'api-icon-btn api-attach',title:t('apiAttach'),'aria-label':`${t('apiAttach')}: ${it.name}`,onClick:()=>attachTo({path:it.path,name:it.name,type:it.type})},'⤓'):null,
    h('button',{type:'button',class:'api-icon-btn',title:t('apiRename'),'aria-label':`${t('apiRename')}: ${it.name}`,onClick:()=>renameItem(it)},'✎'),
    h('button',{type:'button',class:'api-icon-btn danger',title:t('apiDelete'),'aria-label':`${t('apiDelete')}: ${it.name}`,onClick:()=>deleteItem(it)},'✕')));
  row.addEventListener('dragstart',e=>{dragged=it;dragData({path:it.path,name:it.name,type:it.type})(e);});
  row.addEventListener('contextmenu',e=>openCtx(e,itemMenu(it)));
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
  mockToggle(),
  h('button',{type:'button',class:'api-icon-btn api-run-btn',title:t('apiRunCollection'),'aria-label':`${t('apiRunCollection')}: ${state.coll.name}`,onClick:()=>startRun({path:'',recursive:true})},'▶▶'),
  hooks.attach?h('button',{type:'button',class:'api-icon-btn api-attach',title:t('apiAttach'),'aria-label':`${t('apiAttach')}: ${state.coll.name}`,onClick:()=>attachTo({path:'',name:state.coll.name,type:'collection'})},'⤓'):null);
 head.addEventListener('dragstart',dragData({path:'',name:state.coll.name,type:'collection'}));
 head.addEventListener('contextmenu',e=>openCtx(e,collectionMenu()));
 els.tree.replaceChildren(head,...treeRows(state.coll.tree,0,q));
 if(!state.coll.tree.length)els.tree.append(h('li',{class:'api-empty-small',role:'presentation'},t('apiEmptyCollection')));
}
async function newItem(type,parent=''){
 if(type==='request'){openNewRequest(parent);return;}
 const name=prompt(t(type==='folder'?'apiPromptFolder':'apiPromptRequest'));if(!name||!name.trim())return;
 try{
  const made=await api('POST',`/collections/${state.coll.id}/items`,{type,parent,name:name.trim(),method:'get',url:''});
  if(parent)state.expanded.add(parent);
  await reloadTree();if(type==='request')await openRequest(made.path);
 }catch(e){toast(e.message);}
}
async function renameItem(item){
 const name=prompt(t('apiPromptRename'),item.name);if(!name||!name.trim()||name.trim()===item.name)return;
 const affected=dirtyTabs(item.path);if(affected.length&&!(await guardUnsaved(affected)))return;
 try{await api('PATCH',`/collections/${state.coll.id}/items`,{path:item.path,name:name.trim()});dropTabs(item.path);await reloadTree();renderMain();}catch(e){toast(e.message);}
}
async function deleteItem(item){
 if(!confirm(t('apiConfirmDelete',item.name)))return;
 try{
  await api('DELETE',`/collections/${state.coll.id}/items?path=${encodeURIComponent(item.path)}`);
  dropTabs(item.path);
  await reloadTree();renderMain();
 }catch(e){toast(e.message);}
}
function toast(message){hooks.toast?.(message);}

/* ---------- editor de request ---------- */
const TABS=['params','headers','body','auth','vars','assert','scripts','mock','docs'];
function renderMain(){
 const main=els.content;if(!main)return;
 renderTabbar();main.classList.remove('is-request');
 if(state.view==='run'&&state.run){mountReport();return;}
 const m=state.request;
 if(!m){
  main.replaceChildren(h('div',{class:'api-empty'},h('p',{},state.coll?t('apiPickRequest'):t('apiNoCollections')),
   !state.coll?h('div',{class:'api-empty-actions'},h('button',{type:'button',class:'api-btn',onClick:createCollection},t('apiNewCollection')),h('button',{type:'button',class:'api-btn',onClick:()=>els.importInput.click()},t('apiImport')),h('button',{type:'button',class:'api-btn',onClick:()=>els.folderInput.click()},t('apiImportFolder'))):null));
  return;
 }
 const urlInput=h('input',{type:'text',class:'api-url',value:m.url||'',placeholder:'https://…  {{host}}/path','aria-label':'URL',spellcheck:'false',onInput:e=>{m.url=e.target.value;syncParamsFromUrl(m);markDirty();if(state.tab==='params')renderTab();}});
 urlInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const curl=CURL_RE.test(urlInput.value)&&parseCurl(urlInput.value);if(curl)applyCurl(curl);else send();}});
 urlInput.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text')||'',curl=CURL_RE.test(text)&&parseCurl(text);if(curl){e.preventDefault();applyCurl(curl);}});
 const methodSel=h('select',{class:'api-method-select api-m-'+m.method,'aria-label':t('apiMethod'),onChange:e=>{m.method=e.target.value;e.target.className=`api-method-select api-m-${m.method}`;markDirty();renderTabbar();}},...METHODS.map(x=>h('option',{value:x,selected:x===m.method},x.toUpperCase())));
 const nameInput=h('div',{class:'api-req-title'},h('strong',{},m.name),h('span',{class:'api-req-tools'},els.save,els.saveBtn=h('button',{type:'button',class:'api-btn api-save-btn',title:t('apiSaveTitle'),onClick:()=>saveActive()},t('save')),copyAsMenu()));
 els.sendBtn=h('button',{type:'button',class:'api-send',onClick:()=>state.sending?state.abort?.abort():send()},state.sending?t('apiCancel'):t('apiSend'));
 els.scriptsToggle=h('label',{class:'api-scripts-toggle',title:t('apiScriptsOnTitle')},h('input',{type:'checkbox',checked:state.scripts,onChange:e=>{state.scripts=e.target.checked;store.set('cm-api-scripts',state.scripts?'1':'0');}}),h('span',{},t('apiScriptsOn')));
 els.urlInput=urlInput;
 els.tabs=h('div',{class:'api-tabs',role:'tablist'},...TABS.map(id=>h('button',{type:'button',role:'tab',id:`api-tab-${id}`,'aria-selected':String(state.tab===id),'aria-controls':'api-tabpanel',class:state.tab===id?'is-active':'',onClick:()=>{state.tab=id;els.tabs.querySelectorAll('[role=tab]').forEach(b=>{const on=b.id===`api-tab-${id}`;b.setAttribute('aria-selected',String(on));b.classList.toggle('is-active',on);});renderTab();}},t(`apiTab_${id}`))));
 els.tabpanel=h('div',{class:'api-tabpanel',id:'api-tabpanel',role:'tabpanel'});
 els.response=h('div',{class:'api-response','aria-live':'polite'});
 const editor=h('div',{class:'api-pane api-pane-editor'},els.tabs,els.tabpanel);
 const respPane=h('div',{class:'api-pane api-pane-response'},h('div',{class:'api-pane-tools'},layoutButton(),maxButton()),els.response);
 els.split=h('div',{class:'api-split'});
 els.split.append(editor,splitHandle(),respPane);
 applyLayout();
 main.classList.add('is-request');
 main.replaceChildren(nameInput,h('div',{class:'api-urlbar'},methodSel,vf.varField(urlInput),els.sendBtn),els.scriptsToggle,els.split);
 syncSaveUi();renderTab();renderResponse();
}
/* editor e resposta: empilhados ou lado a lado, com divisor arrastável (e por teclado) e a resposta em destaque */
const layoutNow=()=>state.layout||(state.layout=store.get('cm-api-layout')||((panel?.offsetWidth||0)>=900?'side':'stack'));
function applyLayout(){
 const split=els.split;if(!split)return;
 const layout=layoutNow();
 state.split||=Math.min(80,Math.max(20,Number(store.get('cm-api-split'))||45));
 split.className=`api-split is-${layout}${state.maxResp?' is-max':''}`;split.style.setProperty('--split',`${state.split}%`);
 const handle=split.querySelector('.api-split-handle');
 if(handle){handle.setAttribute('aria-orientation',layout==='side'?'vertical':'horizontal');handle.setAttribute('aria-valuenow',String(Math.round(state.split)));}
}
function layoutButton(){
 const side=layoutNow()==='side';
 return h('button',{type:'button',class:'api-icon-btn api-layout-btn',title:t(side?'apiLayoutStack':'apiLayoutSide'),'aria-label':t(side?'apiLayoutStack':'apiLayoutSide'),onClick:e=>{
  const btn=e.currentTarget;
  state.layout=layoutNow()==='side'?'stack':'side';store.set('cm-api-layout',state.layout);applyLayout();
  const now=state.layout==='side',label=t(now?'apiLayoutStack':'apiLayoutSide');btn.title=label;btn.setAttribute('aria-label',label);btn.textContent=now?'⬒':'◫';
 }},side?'⬒':'◫');
}
function maxButton(){
 return h('button',{type:'button',class:'api-icon-btn api-max-btn','aria-pressed':String(state.maxResp),title:t('apiMaximize'),'aria-label':t('apiMaximize'),onClick:e=>{state.maxResp=!state.maxResp;e.currentTarget.setAttribute('aria-pressed',String(state.maxResp));applyLayout();}},'⤢');
}
function splitHandle(){
 const handle=h('div',{class:'api-split-handle',role:'separator',tabindex:'0','aria-label':t('apiSplitResize'),'aria-valuemin':'20','aria-valuemax':'80'});
 const setPct=p=>{state.split=Math.min(80,Math.max(20,p));store.set('cm-api-split',String(Math.round(state.split)));applyLayout();};
 handle.addEventListener('pointerdown',e=>{e.preventDefault();handle.setPointerCapture(e.pointerId);els.split.classList.add('is-dragging');});
 handle.addEventListener('pointermove',e=>{
  if(!handle.hasPointerCapture(e.pointerId))return;
  const r=els.split.getBoundingClientRect();setPct(layoutNow()==='side'?(e.clientX-r.left)/r.width*100:(e.clientY-r.top)/r.height*100);
 });
 const end=e=>{if(handle.hasPointerCapture?.(e.pointerId))handle.releasePointerCapture(e.pointerId);els.split?.classList.remove('is-dragging');};
 handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
 handle.addEventListener('keydown',e=>{
  const side=layoutNow()==='side',less=side?'ArrowLeft':'ArrowUp',more=side?'ArrowRight':'ArrowDown';
  if(e.key===less||e.key===more){e.preventDefault();setPct(state.split+(e.key===more?5:-5));}
  else if(e.key==='Home'){e.preventDefault();setPct(20);}else if(e.key==='End'){e.preventDefault();setPct(80);}
 });
 return handle;
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
  if(mode==='json'||mode==='text'||mode==='xml'){m.body||={};box.append(vf.varField(textArea(m.body[mode],v=>{m.body[mode]=v;changed();},mode==='json'?'{ "key": "value" }':'',{rows:12})));
   if(mode==='json')box.append(h('button',{type:'button',class:'api-btn',onClick:()=>{try{m.body.json=JSON.stringify(JSON.parse(resolveVars(m.body.json||'',new Map())),null,2);changed();renderTab();}catch{toast(t('apiInvalidJson'));}}},t('apiPrettify')));}
  else if(mode==='formUrlEncoded'){m.formUrlEncoded||=[];box.append(kvTable(m.formUrlEncoded,{onChange:changed}));}
  else if(mode==='multipartForm')box.append(h('p',{class:'api-hint'},t('apiMultipartNote')));
 }else if(state.tab==='auth'){
  const sel=h('select',{'aria-label':t('apiTab_auth'),onChange:e=>{m.authMode=e.target.value;changed();renderTab();}},...[['none',t('apiAuthNone')],['bearer',t('apiAuthBearer')],['basic',t('apiAuthBasic')],['inherit',t('apiAuthInherit')]].map(([v,l])=>h('option',{value:v,selected:v===(m.authMode||'none')},l)));
  box.replaceChildren(h('div',{class:'api-field-row'},sel));
  if(m.authMode==='bearer'){m.bearer||={token:''};box.append(labelled(t('apiToken'),vf.varField(h('input',{type:'text',value:m.bearer.token,spellcheck:'false',onInput:e=>{m.bearer.token=e.target.value;changed();}}))));}
  else if(m.authMode==='basic'){m.basic||={username:'',password:''};box.append(labelled(t('apiUsername'),vf.varField(h('input',{type:'text',value:m.basic.username,onInput:e=>{m.basic.username=e.target.value;changed();}}))),labelled(t('apiPassword'),h('input',{type:'password',value:m.basic.password,onInput:e=>{m.basic.password=e.target.value;changed();}})));}
  else if(m.authMode==='inherit')box.append(h('p',{class:'api-hint'},t('apiAuthInheritNote')));
 }else if(state.tab==='vars'){
  m.varsPre||=[];m.varsPost||=[];
  const runtime=[...state.runtime].map(([k,v])=>`${k} = ${v}`).join('\n');
  box.replaceChildren(h('p',{class:'api-hint'},t('apiVarsNote')),kvTable(m.varsPre,{onChange:changed}),
   h('h4',{},t('apiVarsPost')),h('p',{class:'api-hint'},t('apiVarsPostNote')),kvTable(m.varsPost,{onChange:changed}),
   h('h4',{},t('apiRuntimeVars')),h('pre',{class:'api-pre'},runtime||t('apiNoRuntimeVars')),
   state.runtime.size?h('button',{type:'button',class:'api-btn',onClick:()=>{state.runtime=new Map();syncVarsUi();renderTab();}},t('apiClearVars')):null,
   h('h4',{},t('apiResolved')),resolvedPreview());
 }else if(state.tab==='assert'){
  m.assertions||=[];
  box.replaceChildren(h('p',{class:'api-hint'},t('apiAssertNote')),kvTable(m.assertions,{onChange:changed,namePlaceholder:t('apiAssertName'),valuePlaceholder:t('apiAssertValue')}));
 }else if(state.tab==='mock'){
  renderMockTab(box);
 }else if(state.tab==='docs'){
  box.replaceChildren(textArea(m.docs||'',v=>{m.docs=v;changed();},t('apiDocsPlaceholder'),{rows:12}));
 }else{
  const editor=(label,key,placeholder)=>[h('h4',{},label),textArea(m[key]||'',v=>{if(v.trim())m[key]=v;else delete m[key];changed();},placeholder,{rows:7})];
  box.replaceChildren(h('p',{class:'api-hint'},`${t('apiScriptsSandboxNote')} ${t('apiScriptsNote')}`),
   ...editor(t('apiScriptPre'),'scriptPre',"req.setHeader('X-Run', Date.now());\nbru.setVar('token', 'abc');"),
   ...editor(t('apiScriptPost'),'scriptPost',"bru.setVar('id', res.body.id);"),
   ...editor(t('apiTests'),'tests',"test('status is 200', () => {\n  expect(res.status).to.equal(200);\n});"));
 }
}
function resolvedPreview(){
 const vars=allVars(),req=buildRequest(state.request,vars,state.coll?.defaults?.headers);
 return h('pre',{class:'api-pre'},`${req.method} ${req.url}\n${req.headers.map(x=>`${x.name}: ${x.value}`).join('\n')}${req.body?`\n\n${req.body}`:''}`);
}

/* ---------- resposta ---------- */
const fmtSize=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
let bodyUi=null;
function renderResponse(){
 const box=els.response;if(!box)return;
 refreshVars();
 if(els.sendBtn)els.sendBtn.textContent=state.sending?t('apiCancel'):t('apiSend');
 const r=state.response;
 if(state.sending){box.replaceChildren(h('p',{class:'api-hint'},t('apiSending')));return;}
 if(!r){box.replaceChildren(h('p',{class:'api-hint'},t('apiNoResponse')));return;}
 const extra=r.extra||{logs:[],tests:[],asserts:[],errors:[]};
 const summary=extraSummary(extra);
 if(r.error){
  const text=r.error==='timeout'?t('apiTimeout',r.detail):r.error==='cancelled'?t('apiCancelled'):`${t('apiFailed')}: ${r.detail||r.error}`;
  box.replaceChildren(...[unresolvedBanner(r.unresolved)].filter(Boolean),h('div',{class:'api-status is-error',role:'alert'},text,r.mock?mockResponsePill(r.mock):null,h('span',{},`${r.timeMs} ms`)),...(extra.errors.length?[consoleView(extra)]:[]));return;
 }
 const kind=r.status>=500?'is-error':r.status>=400?'is-warn':r.status>=300?'is-redirect':'is-ok';
 const tabs=[['body',t('apiRespBody')],['headers',t('apiRespHeaders')]];
 if(summary.total)tabs.push(['tests',`${t('apiRespTests')} ${summary.passed}/${summary.total}`]);
 if(extra.logs.length||extra.errors.length)tabs.push(['console',`${t('apiRespConsole')}${extra.errors.length?' !':''}`]);
 if(!tabs.some(([id])=>id===state.respTab))state.respTab='body';
 const view=state.respTab==='body'?(bodyUi||=createBodyView({h,t,fmtSize})).mount(r):null;
 const body=state.respTab==='tests'?testsView(extra):state.respTab==='console'?consoleView(extra):view?view.el:h('pre',{class:'api-pre api-resp-body',tabindex:'0'},r.headers.map(([k,v])=>`${k}: ${v}`).join('\n'));
 box.replaceChildren(
  ...[unresolvedBanner(r.unresolved)].filter(Boolean),
  h('div',{class:`api-status ${kind}`},h('strong',{},`${r.status} ${r.statusText||''}`),r.mock?mockResponsePill(r.mock):null,h('span',{},`${r.timeMs} ms`),h('span',{},fmtSize(r.size)),r.truncated?h('span',{},t('apiTruncated')):null,
   summary.total?h('span',{class:summary.failed?'api-tests-bad':'api-tests-ok'},`${summary.failed?'✗':'✓'} ${t('apiTestsSummary',summary.passed,summary.total)}`):null),
  h('div',{class:'api-resp-tabs',role:'tablist'},
   ...tabs.map(([id,label])=>h('button',{type:'button',role:'tab','aria-selected':String(state.respTab===id),class:state.respTab===id?'is-active':'',onClick:()=>{state.respTab=id;renderResponse();}},label)),
   h('button',{type:'button',class:'api-btn',onClick:async e=>{try{await navigator.clipboard.writeText(view?view.text():body.textContent);e.target.textContent=t('apiCopied');setTimeout(()=>{e.target.textContent=t('apiCopy');},1200);}catch{}}},t('apiCopy'))),
  body);
}
function extraSummary(extra){
 const all=[...extra.asserts,...extra.tests],passed=all.filter(x=>x.passed).length;
 return {total:all.length,passed,failed:all.length-passed};
}
function testsView(extra){
 const row=x=>h('li',{class:x.passed?'is-pass':'is-fail'},h('span',{class:'api-mark','aria-hidden':'true'},x.passed?'✓':'✗'),h('span',{},x.name||`${x.expression} ${x.assertion}`),x.error?h('small',{},x.error):null);
 return h('div',{class:'api-tests'},
  ...(extra.asserts.length?[h('h4',{},t('apiAssertionsTitle')),h('ul',{},...extra.asserts.map(row))]:[]),
  ...(extra.tests.length?[h('h4',{},t('apiTestsTitle')),h('ul',{},...extra.tests.map(row))]:[]),
  ...(!extra.asserts.length&&!extra.tests.length?[h('p',{class:'api-hint'},t('apiNoTests'))]:[]));
}
function consoleView(extra){
 const lines=[...extra.errors.map(e=>({level:'error',text:`${t('apiScriptError')} (${e.where}): ${e.message}`})),...extra.logs.map(l=>({level:l.level,text:`[${l.where}] ${l.text}`}))];
 return h('div',{class:'api-console',role:'log'},...lines.map(l=>h('div',{class:`api-log is-${l.level}`},l.text)));
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
 if(state.coll?.id!==id&&!(await guardUnsaved(dirtyTabs())))return false;
 await flushSave();if(state.coll?.id!==id){state.tabs.forEach(x=>x.abort?.abort());state.tabs=[];}clearActive();
 if(state.run&&state.run.collection!==id){state.run.abort?.abort();state.run=null;state.view='request';state.report=null;}
 await loadCollection(id);await restoreTabs();renderAll();
}
async function importZip(file){
 try{const made=await api('POST','/collections/import',file);await loadCollections();await selectCollection(made.id);toast(t('apiImported',made.name));}catch(e){toast(e.message&&!/^\d+$/.test(e.message)?e.message:t('importError'));}
}
/* ---------- importar pasta (formato Bruno) ---------- */
const IMPORT_EXT=/\.(bru|json|md)$/i,MAX_IMPORT_FILE=2*1024*1024,MAX_IMPORT_FILES=3000;
const skipImportPath=path=>path.split('/').some(p=>p.startsWith('.')||p==='node_modules');
async function readInputFolder(files){ // <input webkitdirectory>
 const out=[];
 for(const f of files){
  const path=f.webkitRelativePath||f.name;
  if(out.length>=MAX_IMPORT_FILES||skipImportPath(path)||!IMPORT_EXT.test(path)||f.size>MAX_IMPORT_FILE)continue;
  out.push({path,content:await f.text()});
 }
 return out;
}
async function readEntry(entry,prefix,out){ // pasta arrastada para o painel
 const path=prefix?`${prefix}/${entry.name}`:entry.name;
 if(out.length>=MAX_IMPORT_FILES||skipImportPath(path))return;
 if(entry.isFile){
  if(!IMPORT_EXT.test(path))return;
  const file=await new Promise((ok,no)=>entry.file(ok,no));
  if(file.size<=MAX_IMPORT_FILE)out.push({path,content:await file.text()});
 }else if(entry.isDirectory){
  const reader=entry.createReader();
  for(;;){
   const batch=await new Promise((ok,no)=>reader.readEntries(ok,no));
   if(!batch.length)break;
   for(const child of batch)await readEntry(child,path,out);
  }
 }
}
/* Uma pasta com bruno.json vira uma coleção nova; sem ele, as requests entram na coleção aberta (ou numa coleção nova, se não houver). */
async function importFolder(files){
 if(!files.length){toast(t('apiImportFolderEmpty'));return;}
 try{
  await flushSave();
  const made=await api('POST','/collections/import-folder',{files,into:state.coll?{collection:state.coll.id,parent:''}:undefined});
  await loadCollections();
  if(made.folder){
   const keep=state.reqPath;await loadCollection(state.coll.id);state.reqPath=keep;state.expanded.add(made.folder);renderAll(false);
   toast(t('apiImportedFolder',made.files,state.coll.name));
  }else{await selectCollection(made.id);toast(t('apiImported',made.name));}
 }catch(e){toast(e.message&&!/^\d+$/.test(e.message)?e.message:t('importError'));}
}

/* ---------- executar pasta (run e run recursivo) com relatório ---------- */
const BODY_KEEP=20000;
const runPrefs=()=>{try{return {stopOnFail:false,delayMs:0,...JSON.parse(store.get('cm-api-run')||'{}')};}catch{return {stopOnFail:false,delayMs:0};}};
let reportUi=null,drawQueued=0;
function mountReport(){
 reportUi||=createRunReport({h,t,fmtSize});
 state.report=reportUi.mount(els.content,state.run,reportActions);
}
function showReport(){if(!state.run)return;state.view='run';hideTree();renderMain();renderTree();}
function drawReport(){ // vários resultados seguidos viram um redesenho só
 if(drawQueued)return;
 drawQueued=requestAnimationFrame(()=>{drawQueued=0;if(state.view==='run'&&state.run)state.report?.update();});
}
async function runOne(item,run){
 let model;
 try{model=tabEntry(item.path)?.request||await api('GET',`/collections/${run.collection}/request?path=${encodeURIComponent(item.path)}`);}
 catch(e){return {error:'request',detail:e.message,timeMs:0,extra:{logs:[],tests:[],asserts:[],errors:[]}};}
 const out=await execute(model,run.abort.signal,item.path);
 if(out.bodyText&&out.bodyText.length>BODY_KEEP)out.bodyText=out.bodyText.slice(0,BODY_KEEP);
 if(out.sent?.body&&out.sent.body.length>BODY_KEEP)out.sent={...out.sent,body:out.sent.body.slice(0,BODY_KEEP)};
 return out;
}
async function runItems(run,subset){
 run.abort=new AbortController();run.status='running';run.finishedAt=null;
 for(const item of subset){item.status='pending';delete item.out;}
 renderTabbar();
 if(state.view==='run'){state.report?.update();state.report?.focusFirst();}
 run.status=await runSequence(subset,{signal:run.abort.signal,stopOnFail:run.options.stopOnFail,delayMs:run.options.delayMs,onChange:()=>{drawReport();syncVarsUi();},execute:item=>runOne(item,run)});
 run.finishedAt=new Date().toISOString();
 renderTabbar();
 if(state.view==='run'&&state.run===run)state.report?.update();
}
/* path: pasta a executar ('' = a coleção); recursive: inclui as subpastas, na ordem da árvore */
async function startRun({path='',recursive=true}={}){
 if(!state.coll)return;
 if(state.run?.status==='running'){toast(t('apiRunBusy'));showReport();return;}
 await flushSave();
 const base=path?findItem(state.coll.tree,path):null;
 const items=collectRequests(base?base.children:state.coll.tree,{recursive,base:path}).map(r=>({...r,status:'pending'}));
 if(!items.length){toast(t('apiRunEmpty'));return;}
 const run={collection:state.coll.id,path,recursive,title:base?.name||state.coll.name,env:state.env,items,status:'running',options:runPrefs(),startedAt:new Date().toISOString(),finishedAt:null,abort:null,view:{filter:'all',q:'',open:new Set()}};
 state.run=run;state.view='run';hideTree();renderMain();renderTree();
 await runItems(run,items);
}
const reportActions={
 stop:()=>state.run?.abort?.abort(),
 again:()=>{const r=state.run;if(r)startRun({path:r.path,recursive:r.recursive});},
 againFailed:()=>{const r=state.run;if(r)runItems(r,r.items.filter(i=>i.status==='failed'||i.status==='error'));},
 rerunOne:path=>{const r=state.run;if(r)runItems(r,r.items.filter(i=>i.path===path));},
 openRequest:path=>openRequest(path),
 close:()=>{ // fechar a aba do relatório descarta a execução (e a interrompe, se ainda estiver rodando)
  state.run?.abort?.abort();state.run=null;state.report=null;state.view='request';renderMain();renderTree();
 },
 options:()=>store.set('cm-api-run',JSON.stringify(state.run.options)),
 exportJson:()=>{
  const run=state.run,blob=new Blob([JSON.stringify(reportJson(run),null,2)],{type:'application/json'});
  const a=h('a',{href:URL.createObjectURL(blob),download:`${slugOf(run.title)||'run'}-report.json`});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 },
 copy:async()=>{try{await navigator.clipboard.writeText(reportText(state.run,t));return true;}catch{return false;}}
};
const slugOf=text=>String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

async function deleteCollection(){
 if(!state.coll||!confirm(t('apiConfirmDeleteCollection',state.coll.name)))return;
 try{await api('DELETE',`/collections/${state.coll.id}`);await loadCollections();await selectCollection(state.collections[0]?.id||null);}catch(e){toast(e.message);}
}
function attachTo(target){hooks.attach?.({collection:state.coll.id,collectionName:state.coll.name,...target});}

/* ---------- cabeçalho ---------- */
function renderHeader(){
 if(!els.head)return;
 const collSel=h('select',{class:'api-select','aria-label':t('apiCollection'),onChange:async e=>{if((await selectCollection(e.target.value))===false)renderHeader();}},...(state.collections.length?state.collections.map(c=>h('option',{value:c.id,selected:c.id===state.coll?.id},c.name)):[h('option',{value:''},t('apiNoCollectionsShort'))]));
 const envSel=h('select',{class:'api-select','aria-label':t('apiEnvironment'),disabled:state.coll?null:true,onChange:async e=>{state.env=e.target.value||null;store.set(`cm-api-env:${state.coll.id}`,state.env||'');await loadEnv();if(state.tab==='vars')renderTab();}},h('option',{value:''},t('apiNoEnv')),...(state.coll?.environments||[]).map(n=>h('option',{value:n,selected:n===state.env},n)));
 const menu=h('div',{class:'api-menu',role:'menu',hidden:true},
  ...[[t('apiNewCollection'),createCollection],[t('apiRunCollection'),()=>startRun({path:'',recursive:true})],[t('apiImport'),()=>els.importInput.click()],[t('apiImportFolder'),()=>els.folderInput.click()],[t('apiExport'),()=>{if(state.coll)location.href=`api/collections/${state.coll.id}/export`;}],[t('apiDeleteCollection'),deleteCollection,true]].map(([label,fn,danger])=>h('button',{type:'button',role:'menuitem',class:danger?'danger':'',onClick:()=>{menu.hidden=true;fn();}},label)));
 els.menu=menu;
 els.head.replaceChildren(treeToggle(),h('strong',{class:'api-title'},t('apiTitle')),collSel,envSel,
  h('button',{type:'button',class:'api-icon-btn',title:t('apiEditEnv'),'aria-label':t('apiEditEnv'),disabled:state.coll?null:true,onClick:openEnvEditor},'⚙'),
  h('span',{class:'api-spacer'}),
  varsButton(),
  h('div',{class:'api-menu-wrap'},h('button',{type:'button',class:'api-icon-btn','aria-haspopup':'menu',title:t('apiMore'),'aria-label':t('apiMore'),onClick:()=>{menu.hidden=!menu.hidden;}},'⋯'),menu),
  h('button',{type:'button',class:'api-icon-btn',title:t('apiClose'),'aria-label':t('apiClose'),onClick:closeApiPanel},'×'));
}
function renderAll(withMain=true){renderHeader();renderTree();if(withMain)renderMain();}

/* ---------- cURL, copiar como, variáveis sem valor, menu de contexto e variáveis de sessão ---------- */
const CURL_RE=/^\s*curl(\.exe)?\s/i;
function applyCurl(model){ // um comando curl colado na URL vira a request inteira
 const m=state.request;if(!m)return;
 mergeCurl(m,model);markDirty();renderMain();renderTabbar();
 els.urlInput?.focus({preventScroll:true});
 toast(t(model.notes?.includes('multipart')?'apiCurlMultipart':'apiCurlImported'));
}
function findUnresolved(req){ // {{nome}} que continuam sem valor depois de resolver (os $dinâmicos sempre têm)
 const names=new Set(),scan=s=>{for(const m of String(s??'').matchAll(/\{\{\s*([\w$.-]+)\s*\}\}/g))if(!m[1].startsWith('$'))names.add(m[1]);};
 scan(req.url);for(const x of req.headers||[]){scan(x.name);scan(x.value);}scan(req.body);
 return [...names];
}
function unresolvedBanner(names){
 if(!names?.length)return null;
 const envs=state.coll?.environments||[];
 return h('div',{class:'api-unresolved',role:'alert'},
  h('strong',{},t('apiUnresolvedTitle')),h('p',{},t('apiUnresolvedBody',names.map(n=>`{{${n}}}`).join(', '))),
  h('div',{class:'api-unresolved-actions'},
   !state.env&&envs.length?h('select',{class:'api-select','aria-label':t('apiEnvironment'),onChange:async e=>{
    state.env=e.target.value||null;store.set(`cm-api-env:${state.coll.id}`,state.env||'');await loadEnv();renderHeader();renderResponse();
   }},h('option',{value:''},t('apiUnresolvedPick')),...envs.map(n=>h('option',{value:n},n))):null,
   h('button',{type:'button',class:'api-btn',onClick:openEnvEditor},t('apiEditEnv'))));
}
const COPY_AS={curl:{label:'apiCopyCurl',make:toCurl},fetch:{label:'apiCopyFetch',make:toFetch}};
function copyAs(kind,model){ // mostra o texto inteiro antes de copiar
 if(!state.coll||panel.querySelector('.api-modal'))return;
 const back=document.activeElement;
 let fmt=kind,resolved=true,current='';
 const overlay=h('div',{class:'api-modal api-copyas-modal',role:'dialog','aria-modal':'true','aria-labelledby':'api-copyas-title'});
 const out=h('pre',{class:'api-pre api-copyas-text',tabindex:'0','aria-label':t('apiCopyAsPreview')});
 const note=h('p',{class:'api-unresolved',role:'status',hidden:true});
 const draw=()=>{
  const req=buildRequest(model,resolved?allVars(model):new Map(),state.coll?.defaults?.headers),names=resolved?findUnresolved(req):[];
  current=COPY_AS[fmt].make(req);out.textContent=current;
  note.hidden=!names.length;note.textContent=names.length?t('apiUnresolvedBody',names.map(n=>`{{${n}}}`).join(', ')):'';
 };
 const copyBtn=h('button',{type:'button',class:'api-btn primary',onClick:async()=>{
  try{await navigator.clipboard.writeText(current);copyBtn.textContent=t('apiCopied');setTimeout(()=>{copyBtn.textContent=t('apiCopy');},1500);}
  catch{toast(t('apiCopyFailed'));}
 }},t('apiCopy'));
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey,true);if(back?.isConnected)back.focus({preventScroll:true});};
 function onKey(e){
  if(!overlay.isConnected)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if(e.key==='Tab'){
   const items=[...overlay.querySelectorAll('input,button,pre')].filter(x=>!x.disabled&&!x.closest('[hidden]'));
   const first=items[0],last=items.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
 }
 document.addEventListener('keydown',onKey,true);
 overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();});
 const radio=key=>h('label',{class:'api-newreq-mode'},h('input',{type:'radio',name:'api-copyas-fmt',value:key,checked:key===fmt||null,onChange:()=>{fmt=key;draw();}}),h('span',{},t(COPY_AS[key].label)));
 overlay.append(h('div',{class:'api-modal-card api-copyas-card'},
  h('header',{},h('h3',{id:'api-copyas-title'},t('apiCopyAsTitle',model.name||'')),h('button',{type:'button',class:'api-icon-btn','aria-label':t('close'),onClick:close},'×')),
  h('div',{class:'api-copyas-options'},
   h('fieldset',{class:'api-newreq-modes'},h('legend',{class:'sr-only'},t('apiCopyAsFormat')),...Object.keys(COPY_AS).map(radio)),
   h('label',{class:'api-copyas-resolve'},h('input',{type:'checkbox',checked:true,onChange:e=>{resolved=e.target.checked;draw();}}),h('span',{},t('apiCopyAsResolve')))),
  note,out,
  h('footer',{},h('button',{type:'button',class:'api-btn',onClick:close},t('close')),copyBtn)));
 panel.append(overlay);draw();copyBtn.focus();
}
async function copyRowAs(kind,item){
 try{await copyAs(kind,tabEntry(item.path)?.request||await api('GET',`/collections/${state.coll.id}/request?path=${encodeURIComponent(item.path)}`));}catch(e){toast(e.message);}
}
function copyAsMenu(){
 const menu=h('div',{class:'api-menu',role:'menu',hidden:true},...Object.keys(COPY_AS).map(kind=>h('button',{type:'button',role:'menuitem',onClick:()=>{menu.hidden=true;copyAs(kind,state.request);}},t(COPY_AS[kind].label))));
 return h('div',{class:'api-menu-wrap api-copyas'},h('button',{type:'button',class:'api-btn','aria-haspopup':'menu',onClick:()=>{menu.hidden=!menu.hidden;}},t('apiCopyAsButton')),menu);
}
async function duplicateItem(item){
 try{
  const id=state.coll.id,open=tabEntry(item.path),model=open?modelOf(open):await api('GET',`/collections/${id}/request?path=${encodeURIComponent(item.path)}`);
  const name=`${item.name} ${t('apiCopySuffix')}`;
  const made=await api('POST',`/collections/${id}/items`,{type:'request',parent:parentOf(item.path),name,method:model.method,url:model.url});
  const {path:_path,...rest}=model;
  await api('PUT',`/collections/${id}/request?path=${encodeURIComponent(made.path)}`,{...rest,name});
  await reloadTree();await openRequest(made.path);
 }catch(e){toast(e.message);}
}

/* menu de contexto (botão direito, tecla de menu ou toque longo) */
let ctxMenu=null;
function closeCtx(restore=true){
 if(!ctxMenu)return;
 const {el,back}=ctxMenu;ctxMenu=null;el.remove();document.removeEventListener('pointerdown',ctxOutside,true);
 if(restore&&back?.isConnected)back.focus({preventScroll:true});
}
function ctxOutside(e){if(ctxMenu&&!ctxMenu.el.contains(e.target))closeCtx(false);}
function openCtx(e,items){
 e.preventDefault();e.stopPropagation();closeCtx(false);
 const back=document.activeElement;
 const el=h('div',{class:'api-ctx',role:'menu','aria-label':t('apiMore')},...items.filter(Boolean).map(([label,fn,danger])=>h('button',{type:'button',role:'menuitem',class:danger?'danger':'',onClick:()=>{closeCtx();fn();}},label)));
 panel.append(el);
 const box=panel.getBoundingClientRect();
 el.style.left=`${Math.max(4,Math.min(e.clientX-box.left,box.width-el.offsetWidth-4))}px`;
 el.style.top=`${Math.max(4,Math.min(e.clientY-box.top,box.height-el.offsetHeight-4))}px`;
 ctxMenu={el,back};document.addEventListener('pointerdown',ctxOutside,true);
 el.addEventListener('keydown',ev=>{
  const btns=[...el.querySelectorAll('button')],i=btns.indexOf(document.activeElement);
  if(ev.key==='ArrowDown'){ev.preventDefault();btns[(i+1)%btns.length].focus();}
  else if(ev.key==='ArrowUp'){ev.preventDefault();btns[(i-1+btns.length)%btns.length].focus();}
  else if(ev.key==='Escape'||ev.key==='Tab'){ev.preventDefault();ev.stopPropagation();closeCtx();}
 });
 el.querySelector('button')?.focus();
}
function itemMenu(it){
 const attach=hooks.attach?[t('apiAttach'),()=>attachTo({path:it.path,name:it.name,type:it.type})]:null;
 if(it.type==='folder')return [[t('apiRunFolder'),()=>startRun({path:it.path,recursive:false})],[t('apiRunFolderAll'),()=>startRun({path:it.path,recursive:true})],[t('apiNewRequest'),()=>newItem('request',it.path)],[t('apiNewFolder'),()=>newItem('folder',it.path)],attach,[t('apiRename'),()=>renameItem(it)],[t('apiDelete'),()=>deleteItem(it),true]];
 return [[t('apiCtxOpen'),()=>openRequest(it.path)],[t('apiDuplicate'),()=>duplicateItem(it)],[`${t('apiCopyAs')} ${t('apiCopyCurl')}`,()=>copyRowAs('curl',it)],[`${t('apiCopyAs')} ${t('apiCopyFetch')}`,()=>copyRowAs('fetch',it)],attach,[t('apiRename'),()=>renameItem(it)],[t('apiDelete'),()=>deleteItem(it),true]];
}
const collectionMenu=()=>[[t('apiRunCollection'),()=>startRun({path:'',recursive:true})],[t('apiNewRequest'),()=>newItem('request','')],[t('apiNewFolder'),()=>newItem('folder','')],hooks.attach?[t('apiAttach'),()=>attachTo({path:'',name:state.coll.name,type:'collection'})]:null,[t('apiExport'),()=>{location.href=`api/collections/${state.coll.id}/export`;}]];

/* variáveis de sessão: o que os scripts e as "Vars post-response" guardaram, num lugar só */
function syncVarsUi(){
 const b=els.varsBtn;
 if(b){const n=state.runtime.size;b.hidden=!n;b.textContent=`{x} ${n}`;b.setAttribute('aria-label',t('apiSessionVarsCount',n));b.title=t('apiSessionVarsCount',n);}
 if(els.varsPop)drawVarsPop();
}
function closeVarsPop(){els.varsPop?.remove();els.varsPop=null;document.removeEventListener('pointerdown',varsOutside,true);}
function varsOutside(e){if(els.varsPop&&!els.varsPop.contains(e.target)&&!e.target.closest('.api-vars-btn'))closeVarsPop();}
function drawVarsPop(){
 const pop=els.varsPop;if(!pop)return;
 if(!state.runtime.size){closeVarsPop();return;}
 pop.replaceChildren(h('header',{},h('strong',{},t('apiSessionVarsTitle')),h('button',{type:'button',class:'api-icon-btn','aria-label':t('close'),onClick:closeVarsPop},'×')),
  h('p',{class:'api-hint'},t('apiSessionVarsNote')),
  ...[...state.runtime].map(([name,value])=>h('div',{class:'api-vars-row'},h('code',{},name),
   h('input',{type:'text',value,'aria-label':name,spellcheck:'false',onChange:e=>{state.runtime.set(name,e.target.value);refreshVars();if(state.view==='request'&&state.tab==='vars')renderTab();}}),
   h('button',{type:'button',class:'api-icon-btn','aria-label':`${t('apiRemove')}: ${name}`,title:t('apiRemove'),onClick:()=>{state.runtime.delete(name);refreshVars();if(state.view==='request'&&state.tab==='vars')renderTab();syncVarsUi();}},'×'))),
  h('button',{type:'button',class:'api-btn',onClick:()=>{state.runtime=new Map();refreshVars();if(state.view==='request'&&state.tab==='vars')renderTab();syncVarsUi();}},t('apiClearVars')));
}
function toggleVarsPop(){
 if(els.varsPop){closeVarsPop();return;}
 if(!state.runtime.size)return;
 els.varsPop=h('div',{class:'api-vars-pop',role:'dialog','aria-label':t('apiSessionVarsTitle'),onKeydown:e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeVarsPop();els.varsBtn?.focus();}}});
 panel.append(els.varsPop);document.addEventListener('pointerdown',varsOutside,true);drawVarsPop();
 els.varsPop.querySelector('input')?.focus();
}
function hideTree(){panel?.classList.remove('show-tree');syncTreeToggle();}

function varsButton(){els.varsBtn=h('button',{type:'button',class:'api-btn api-vars-btn','aria-haspopup':'dialog',onClick:toggleVarsPop});syncVarsUi();return els.varsBtn;}
function treeToggle(){
 return h('button',{type:'button',class:'api-icon-btn api-tree-toggle',title:t('apiTreeToggle'),'aria-label':t('apiTreeToggle'),'aria-controls':'api-tree-col','aria-expanded':String(treeExpanded()),onClick:()=>{
  if(NARROW())panel.classList.toggle('show-tree');else setTreeCollapsed(!panel.classList.contains('tree-collapsed'));
  syncTreeToggle();
 }},'☰');
}

/* ---------- lista de requests (coleções e pastas): largura ajustável por arrasto ou teclado, e recolher ---------- */
const NARROW=()=>window.matchMedia('(max-width:760px)').matches;
const TREE_MIN=140,MAIN_MIN=320;
let treeW=0; // px; 0 = largura padrão (36% do painel)
function treeBounds(){
 const total=panel?.querySelector('.api-body')?.clientWidth||600;
 return {min:TREE_MIN,max:Math.max(TREE_MIN,total-MAIN_MIN),total};
}
function applyTreeWidth(px){
 const col=panel?.querySelector('.api-tree-col'),handle=panel?.querySelector('.api-tree-resizer');if(!col)return;
 const {min,max,total}=treeBounds();
 if(px){px=Math.round(Math.min(max,Math.max(min,px)));panel.style.setProperty('--api-tree-w',`${px}px`);}
 else panel.style.removeProperty('--api-tree-w');
 treeW=px||0;
 if(handle){
  const now=col.offsetWidth||(px||Math.round(total*.36));
  handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(Math.round(max)));handle.setAttribute('aria-valuenow',String(Math.round(now)));
 }
}
const saveTreeWidth=()=>store.set('cm-api-tree-w',treeW?String(treeW):'');
function treeExpanded(){return NARROW()?panel.classList.contains('show-tree'):!panel.classList.contains('tree-collapsed');}
function syncTreeToggle(){els.head?.querySelector('.api-tree-toggle')?.setAttribute('aria-expanded',String(treeExpanded()));}
function setTreeCollapsed(on){panel.classList.toggle('tree-collapsed',on);store.set('cm-api-tree-collapsed',on?'1':'0');syncTreeToggle();}
function restoreTreeUi(){
 const saved=Number(store.get('cm-api-tree-w'));
 panel.classList.toggle('tree-collapsed',store.get('cm-api-tree-collapsed')==='1');
 applyTreeWidth(saved>0?saved:0);syncTreeToggle();
}
function treeResizer(){
 const handle=h('div',{class:'api-tree-resizer',role:'separator','aria-orientation':'vertical','aria-label':t('apiTreeResize'),tabindex:'0'});
 handle.addEventListener('pointerdown',e=>{e.preventDefault();handle.setPointerCapture(e.pointerId);panel.classList.add('is-resizing-tree');});
 handle.addEventListener('pointermove',e=>{
  if(!handle.hasPointerCapture(e.pointerId))return;
  applyTreeWidth(e.clientX-panel.querySelector('.api-body').getBoundingClientRect().left);
 });
 const end=e=>{if(handle.hasPointerCapture?.(e.pointerId))handle.releasePointerCapture(e.pointerId);panel.classList.remove('is-resizing-tree');saveTreeWidth();};
 handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
 handle.addEventListener('dblclick',()=>{applyTreeWidth(0);saveTreeWidth();}); // volta ao padrão
 handle.addEventListener('keydown',e=>{
  const cur=panel.querySelector('.api-tree-col').offsetWidth,step=e.shiftKey?48:16,{min,max}=treeBounds();
  let next=null;
  if(e.key==='ArrowLeft')next=cur-step;else if(e.key==='ArrowRight')next=cur+step;
  else if(e.key==='Home')next=min;else if(e.key==='End')next=max;
  else if(e.key==='Enter'){e.preventDefault();applyTreeWidth(0);saveTreeWidth();return;}
  if(next===null)return;
  e.preventDefault();applyTreeWidth(next);saveTreeWidth();
 });
 return handle;
}

/* ---------- nova request: do zero ou importando um cURL (janela de criação) ---------- */
const pathOf=url=>{ // "/users" de "https://host/users?x=1" ou "{{host}}/users"
 const p=String(url||'').trim().replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i,'').replace(/^\{\{[^}]*\}\}/,'').split(/[?#]/)[0];
 return p&&p!=='/'?p:'';
};
const suggestName=(method,url)=>pathOf(url)?`${String(method).toUpperCase()} ${pathOf(url)}`:'';
function openNewRequest(parent=''){
 if(!state.coll||panel.querySelector('.api-modal'))return;
 const back=document.activeElement,coll=state.coll;
 const where=parent?`📁 ${findItem(coll.tree,parent)?.name||parent}`:`🗂 ${coll.name}`;
 let mode='scratch',parsed=null;
 const overlay=h('div',{class:'api-modal api-newreq',role:'dialog','aria-modal':'true','aria-labelledby':'api-newreq-title'});
 const field=(label,control)=>h('label',{class:'api-field'},h('span',{},label),control);
 const name=h('input',{type:'text',id:'api-newreq-name',spellcheck:'false',autocomplete:'off','aria-describedby':'api-newreq-error'});
 const method=h('select',{class:'api-method-select api-m-get','aria-label':t('apiMethod'),onChange:()=>{method.className=`api-method-select api-m-${method.value}`;refresh();}},...METHODS.map(x=>h('option',{value:x},x.toUpperCase())));
 const url=h('input',{type:'text',class:'api-url',placeholder:'{{host}}/path','aria-label':'URL',spellcheck:'false',onInput:()=>refresh()});
 const curl=h('textarea',{class:'api-textarea',id:'api-newreq-curl',rows:6,spellcheck:'false',placeholder:t('apiNewReqCurlPlaceholder'),'aria-label':t('apiNewReqCurlLabel'),onInput:()=>refresh()});
 const summary=h('p',{class:'api-hint',id:'api-newreq-summary','aria-live':'polite'});
 const error=h('p',{class:'api-newreq-error',id:'api-newreq-error',role:'alert'});
 const scratchBox=h('div',{class:'api-newreq-row'},method,url);
 const curlBox=h('div',{class:'api-newreq-curl',hidden:true},field(t('apiNewReqCurlLabel'),curl),summary);
 const create=h('button',{type:'button',class:'api-btn primary',onClick:()=>submit()},t('apiNewReqCreate'));
 const radio=(value,label)=>h('label',{class:'api-newreq-mode'},h('input',{type:'radio',name:'api-newreq-mode',value,checked:value==='scratch'||null,onChange:()=>{
  mode=value;scratchBox.hidden=value!=='scratch';curlBox.hidden=value!=='curl';refresh();(value==='curl'?curl:url).focus();
 }}),h('span',{},label));
 const close=(restore=true)=>{
  overlay.remove();document.removeEventListener('keydown',onKey,true);
  if(restore&&back?.isConnected)back.focus({preventScroll:true});
 };
 function refresh(){
  if(mode==='curl'){
   const text=curl.value.trim();parsed=text?parseCurl(text):null;
   summary.textContent=parsed?t('apiNewReqCurlSummary',parsed.method.toUpperCase(),parsed.url,parsed.headers.length,parsed.bodyMode==='none'?t('apiNewReqNoBody'):t('apiNewReqBody',parsed.bodyMode)):'';
   error.textContent=text&&!parsed?t('apiNewReqCurlInvalid'):'';
   create.disabled=!parsed;
   name.placeholder=parsed&&suggestName(parsed.method,parsed.url)||t('apiNewReqNamePh');
  }else{
   error.textContent='';create.disabled=false;
   name.placeholder=suggestName(method.value,url.value)||t('apiNewReqNamePh');
  }
 }
 async function submit(){
  if(mode==='curl'&&!parsed)return;
  const method0=mode==='curl'?parsed.method:method.value,url0=mode==='curl'?parsed.url:url.value.trim();
  const finalName=name.value.trim()||suggestName(method0,url0);
  if(!finalName){error.textContent=t('apiNewReqNameRequired');name.focus();return;}
  create.disabled=true;
  try{
   await flushSave();
   const id=coll.id,made=await api('POST',`/collections/${id}/items`,{type:'request',parent,name:finalName.slice(0,100),method:METHODS.includes(method0)?method0:'get',url:url0});
   if(mode==='curl'){ // o resto do comando (cabeçalhos, corpo, autenticação) entra no arquivo recém-criado
    const {path:_p,...model}=await api('GET',`/collections/${id}/request?path=${encodeURIComponent(made.path)}`);
    mergeCurl(model,parsed);
    await api('PUT',`/collections/${id}/request?path=${encodeURIComponent(made.path)}`,model);
   }
   close(false);
   if(parent)state.expanded.add(parent);
   await reloadTree();await openRequest(made.path);
   if(mode==='curl'&&parsed?.notes?.includes('multipart'))toast(t('apiCurlMultipart'));
  }catch(e){error.textContent=e.message;create.disabled=false;}
 }
 function onKey(e){
  if(!overlay.isConnected)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if(e.key==='Tab'){
   const items=[...overlay.querySelectorAll('input,select,textarea,button')].filter(x=>!x.disabled&&!x.closest('[hidden]'));
   if(!items.length)return;
   const first=items[0],last=items.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   return;
  }
  if(e.key!=='Enter'||!overlay.contains(e.target))return;
  const tag=e.target.tagName;
  if(e.target===curl?(e.ctrlKey||e.metaKey):(tag==='INPUT'&&e.target.type==='text')){e.preventDefault();e.stopPropagation();submit();}
 }
 document.addEventListener('keydown',onKey,true);
 overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();});
 overlay.append(h('div',{class:'api-modal-card api-newreq-card'},
  h('header',{},h('h3',{id:'api-newreq-title'},t('apiNewReqTitle')),h('button',{type:'button',class:'api-icon-btn','aria-label':t('close'),onClick:()=>close()},'×')),
  h('p',{class:'api-hint'},t('apiNewReqIn',where)),
  h('fieldset',{class:'api-newreq-modes'},h('legend',{class:'sr-only'},t('apiNewReqMode')),radio('scratch',t('apiNewReqScratch')),radio('curl',t('apiNewReqCurl'))),
  field(t('apiNewReqName'),name),scratchBox,curlBox,error,
  h('footer',{},h('button',{type:'button',class:'api-btn',onClick:()=>close()},t('cancel')),create)));
 panel.append(overlay);refresh();name.focus();
}
function mergeCurl(m,parsed){ // aplica um curl lido (parseCurl) sobre um modelo de request
 m.method=METHODS.includes(parsed.method)?parsed.method:'get';
 m.url=parsed.url;m.headers=parsed.headers;
 m.bodyMode=parsed.bodyMode;m.body=parsed.body||{};m.formUrlEncoded=parsed.formUrlEncoded||[];
 m.authMode=parsed.authMode;if(parsed.basic)m.basic=parsed.basic;
 syncParamsFromUrl(m);
}

/* ---------- mocks: respostas simuladas por request (cenários) ---------- */
const mockDelay=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Object.assign(new Error('aborted'),{name:'AbortError'}));
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},Math.max(0,ms||0));
 function onAbort(){clearTimeout(timer);reject(Object.assign(new Error('aborted'),{name:'AbortError'}));}
 signal?.addEventListener('abort',onAbort,{once:true});
});
const mockEntry=(rel,create=false)=>{
 const all=state.mocks.requests;
 if(!all[rel]&&create)all[rel]={mode:'auto',active:'',scenarios:[]};
 return all[rel]||null;
};
const modeKey=id=>`cm-api-mockmode:${id}`;
function setMockMode(on){state.mockMode=on;if(state.coll)store.set(modeKey(state.coll.id),on?'1':'0');renderTree();renderTabbar();if(state.tab==='mock'&&state.view==='request')renderTab();}
async function reloadMocks(){
 try{state.mocks=normalizeMocks(await api('GET',`/collections/${state.coll.id}/mocks`));}catch{state.mocks=emptyMocks();}
 state.mocksDirty=false;renderTree();renderTabbar();if(state.tab==='mock'&&state.view==='request')renderTab();
}
/* "MOCK" ligado (responde com mock) ou apagado (tem cenários, mas está desligado) */
function mockPill(item){
 const wrap=document.createDocumentFragment();
 if(item.type==='request'){
  const badge=mockBadge(state.mocks,item.path,state.mockMode);if(!badge)return wrap;
  const entry=state.mocks.requests[item.path],sc=effectiveMock(state.mocks,item.path,state.mockMode)||entry.scenarios.find(s=>s.id===entry.active)||entry.scenarios[0];
  const on=badge==='on',label=sc.kind==='response'?`${sc.status} ${sc.name}`:sc.name;
  wrap.append(h('span',{class:`api-mock-pill ${on?'is-on':'is-ready'}`,title:t(on?'apiMockOnTitle':'apiMockReadyTitle',label)},on?'MOCK':'mock'));
  return wrap;
 }
 const counts=mockCounts(item.children,state.mocks,state.mockMode);
 if(counts.on)wrap.append(h('span',{class:'api-mock-pill is-on',title:t('apiMockFolderTitle',counts.on,counts.ready)},`MOCK ${counts.on}`));
 else if(counts.ready)wrap.append(h('span',{class:'api-mock-pill is-ready',title:t('apiMockFolderTitle',0,counts.ready)},`mock ${counts.ready}`));
 return wrap;
}
function mockToggle(){
 const counts=mockCounts(state.coll.tree,state.mocks,state.mockMode),total=counts.on+counts.ready;
 const btn=h('button',{type:'button',class:`api-mock-toggle${state.mockMode?' is-on':''}`,'aria-pressed':String(state.mockMode),title:t('apiMockModeTitle'),'aria-label':`${t('apiMockModeLabel')}: ${t(state.mockMode?'apiOn':'apiOff')}`,onClick:()=>setMockMode(!state.mockMode)},
  h('span',{class:'api-mock-dot','aria-hidden':'true'}),h('span',{},t('apiMockMode')),h('span',{class:'api-mock-count'},state.mockMode?String(counts.on):String(total)));
 return btn;
}
const mockResponsePill=m=>h('span',{class:'api-mock-pill is-on',title:t('apiMockResponseTitle',m.name)},`MOCK · ${m.name}`);
function mockChanged(){state.mocksDirty=true;markDirty();renderTree();renderTabbar();updateMockTabLabel();}
function updateMockTabLabel(){
 const b=document.getElementById('api-tab-mock');if(!b)return;
 const entry=mockEntry(state.reqPath),n=entry?.scenarios.length||0;
 b.textContent=n?`${t('apiTab_mock')} (${n})`:t('apiTab_mock');
}
const statusClass=s=>s.kind!=='response'?'is-warn':s.status>=500?'is-error':s.status>=400?'is-warn':s.status>=300?'is-redirect':'is-ok';
function renderMockTab(box){
 const rel=state.reqPath,entry=mockEntry(rel);
 const sel=()=>{const e=mockEntry(rel);return e?.scenarios.find(s=>s.id===state.mockSel[rel])||e?.scenarios.find(s=>s.id===e.active)||e?.scenarios[0]||null;};
 const redraw=()=>renderMockTab(box);
 const will=h('p',{class:'api-hint api-mock-will',role:'status'});
 const describeWill=()=>{
  const sc=effectiveMock(state.mocks,rel,state.mockMode);
  will.textContent=sc?t('apiMockWillMock',sc.kind==='response'?`${sc.status} ${sc.name}`:sc.name):t('apiMockWillReal');
  will.classList.toggle('is-on',!!sc);
 };
 const e0=mockEntry(rel);
 const modeSel=h('select',{'aria-label':t('apiMockWhen'),onChange:ev=>{mockEntry(rel,true).mode=ev.target.value;mockChanged();describeWill();}},
  ...[['auto',t('apiMockAuto',t(state.mockMode?'apiOn':'apiOff'))],['on',t('apiMockAlways')],['off',t('apiMockNever')]].map(([v,l])=>h('option',{value:v,selected:v===(e0?.mode||'auto')||null},l)));
 const addPreset=preset=>{
  const e=mockEntry(rel,true),sc=scenarioFromPreset(preset,e.scenarios,t(`apiMockPreset_${preset.key}`));
  e.scenarios.push(sc);if(!e.active)e.active=sc.id;state.mockSel[rel]=sc.id;mockChanged();redraw();box.querySelector('.api-mock-editor input')?.focus();
 };
 const addMenu=h('div',{class:'api-menu-wrap'},
  h('button',{type:'button',class:'api-btn','aria-haspopup':'menu',onClick:()=>{menu.hidden=!menu.hidden;}},`+ ${t('apiMockAdd')}`),
  h('div',{class:'api-menu',role:'menu',hidden:true},...PRESETS.map(p=>h('button',{type:'button',role:'menuitem',onClick:()=>{menu.hidden=true;addPreset(p);}},`${p.kind==='response'?`${p.status} · `:''}${t(`apiMockPreset_${p.key}`)}`))));
 const menu=addMenu.querySelector('.api-menu');
 const rows=(entry?.scenarios||[]).map(s=>{
  const active=entry.active===s.id,editing=sel()?.id===s.id;
  return h('li',{class:`api-mock-sc${editing?' is-editing':''}${active?' is-active':''}`},
   h('input',{type:'radio',name:'api-mock-active','aria-label':`${t('apiMockUse')}: ${s.name}`,title:t('apiMockUse'),checked:active||null,onChange:()=>{mockEntry(rel).active=s.id;mockChanged();describeWill();redraw();}}),
   h('button',{type:'button',class:'api-mock-sc-main','aria-pressed':String(editing),onClick:()=>{state.mockSel[rel]=s.id;redraw();}},
    h('span',{class:`api-mock-code ${statusClass(s)}`},s.kind==='response'?String(s.status):s.kind==='timeout'?'TIME':'ERR'),
    h('span',{class:'api-mock-sc-name'},s.name),h('span',{class:'api-mock-sc-delay'},s.delayMs?`${s.delayMs} ms`:'')),
   h('button',{type:'button',class:'api-icon-btn','aria-label':`${t('apiDuplicate')}: ${s.name}`,title:t('apiDuplicate'),onClick:()=>{const e=mockEntry(rel),copy={...JSON.parse(JSON.stringify(s)),id:newScenarioId(e.scenarios),name:`${s.name} ${t('apiCopySuffix')}`};e.scenarios.splice(e.scenarios.indexOf(s)+1,0,copy);state.mockSel[rel]=copy.id;mockChanged();redraw();}},'⧉'),
   h('button',{type:'button',class:'api-icon-btn danger','aria-label':`${t('apiRemove')}: ${s.name}`,title:t('apiRemove'),onClick:()=>{
    const e=mockEntry(rel);e.scenarios=e.scenarios.filter(x=>x!==s);
    if(!e.scenarios.length)delete state.mocks.requests[rel];else if(e.active===s.id)e.active=e.scenarios[0].id;
    mockChanged();describeWill();redraw();}},'×'));
 });
 const cur=sel();
 const editor=cur?h('div',{class:'api-mock-editor'},
  h('h4',{},t('apiMockEdit')),
  h('div',{class:'api-field-row'},
   h('label',{class:'api-field'},h('span',{},t('apiName')),h('input',{type:'text',value:cur.name,spellcheck:'false',onInput:ev=>{cur.name=ev.target.value;mockChanged();const li=box.querySelector('.api-mock-sc.is-editing .api-mock-sc-name');if(li)li.textContent=cur.name;describeWill();}})),
   h('label',{class:'api-field'},h('span',{},t('apiMockKind')),h('select',{onChange:ev=>{cur.kind=ev.target.value;if(cur.kind!=='response')cur.status=0;else if(!cur.status)cur.status=200;if(cur.kind==='timeout'&&!cur.delayMs)cur.delayMs=5000;mockChanged();redraw();}},...[['response',t('apiMockKindResponse')],['timeout',t('apiMockKindTimeout')],['network',t('apiMockKindNetwork')]].map(([v,l])=>h('option',{value:v,selected:v===cur.kind||null},l))))),
  h('div',{class:'api-field-row'},
   cur.kind==='response'?h('label',{class:'api-field'},h('span',{},t('apiMockStatus')),h('input',{type:'number',min:'100',max:'599',value:String(cur.status),onInput:ev=>{cur.status=Math.min(599,Math.max(100,Number(ev.target.value)||200));mockChanged();const c=box.querySelector('.api-mock-sc.is-editing .api-mock-code');if(c){c.textContent=String(cur.status);c.className=`api-mock-code ${statusClass(cur)}`;}hint.textContent=statusText(cur.status);describeWill();}})):null,
   cur.kind==='response'?h('span',{class:'api-hint api-mock-status-text'},statusText(cur.status)):null,
   h('label',{class:'api-field'},h('span',{},t('apiMockDelay')),h('input',{type:'number',min:'0',max:'60000',step:'50',value:String(cur.delayMs||0),onInput:ev=>{cur.delayMs=Math.min(60000,Math.max(0,Number(ev.target.value)||0));mockChanged();const d=box.querySelector('.api-mock-sc.is-editing .api-mock-sc-delay');if(d)d.textContent=cur.delayMs?`${cur.delayMs} ms`:'';}}))),
  ...(cur.kind==='response'?[
   h('h4',{},t('apiRespHeaders')),kvTable(cur.headers,{onChange:()=>mockChanged(),toggle:false}),
   h('h4',{},t('apiRespBody')),h('p',{class:'api-hint'},t('apiMockBodyNote')),
   vf.varField(textArea(cur.body,v=>{cur.body=v;mockChanged();},'{ "ok": true }',{rows:9}))]:[h('p',{class:'api-hint'},t(cur.kind==='timeout'?'apiMockTimeoutNote':'apiMockNetworkNote'))])
 ):null;
 const hint=editor?.querySelector('.api-mock-status-text')||h('span');
 const capture=state.response&&!state.response.mock&&!state.response.error&&state.response.status?h('button',{type:'button',class:'api-btn',title:t('apiMockCaptureTitle'),onClick:()=>{
  const r=state.response,e=mockEntry(rel,true);
  const headers=(r.headers||[]).filter(([k])=>/^content-type$/i.test(k)).map(([k,v])=>({name:k,value:v}));
  const sc={id:newScenarioId(e.scenarios),name:`${r.status} ${t('apiMockCaptured')}`,kind:'response',status:r.status,headers,body:r.bodyText||'',delayMs:Math.min(r.timeMs||0,5000)};
  e.scenarios.push(sc);if(!e.active)e.active=sc.id;state.mockSel[rel]=sc.id;mockChanged();describeWill();redraw();
 }},t('apiMockCapture')):null;
 box.replaceChildren(
  h('p',{class:'api-hint'},t('apiMockIntro')),
  h('div',{class:'api-field-row api-mock-top'},h('label',{class:'api-field'},h('span',{},t('apiMockWhen')),modeSel),addMenu,capture),
  will,
  h('ul',{class:'api-mock-list','aria-label':t('apiMockScenarios')},...rows),
  rows.length?null:h('p',{class:'api-hint'},t('apiMockNone')),
  editor);
 describeWill();
}

/* ---------- abrir request pelo teclado (Ctrl+K no painel) ---------- */
function openQuickOpen(){
 if(!state.coll||panel.querySelector('.api-modal'))return;
 const all=[],walk=(items,trail)=>{for(const it of items){if(it.type==='request')all.push({...it,trail});else walk(it.children,[...trail,it.name]);}};
 walk(state.coll.tree,[]);
 const back=document.activeElement,overlay=h('div',{class:'api-modal api-quick',role:'dialog','aria-modal':'true','aria-label':t('apiQuickOpen')});
 const input=h('input',{type:'text',class:'api-filter',placeholder:t('apiQuickOpen'),'aria-label':t('apiQuickOpen'),role:'combobox','aria-expanded':'true','aria-controls':'api-quick-list','aria-autocomplete':'list',autocomplete:'off',spellcheck:'false'});
 const list=h('ul',{id:'api-quick-list',role:'listbox',class:'api-quick-list'});
 let shown=[],sel=0;
 const close=()=>{overlay.remove();if(back?.isConnected)back.focus({preventScroll:true});};
 const pick=r=>{if(!r)return;overlay.remove();openRequest(r.path).then(()=>els.urlInput?.focus({preventScroll:true}));};
 const draw=()=>{
  const words=input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  shown=all.filter(r=>words.every(w=>`${r.name} ${r.method} ${r.url||''} ${r.trail.join('/')}`.toLowerCase().includes(w))).slice(0,50);
  sel=Math.min(sel,Math.max(0,shown.length-1));
  list.replaceChildren(...shown.map((r,i)=>h('li',{role:'option',id:`api-quick-${i}`,class:i===sel?'is-sel':'','aria-selected':String(i===sel),onPointerdown:e=>{e.preventDefault();pick(r);}},methodBadge(r.method),h('span',{class:'api-quick-name'},r.name),h('small',{},r.trail.join(' / ')))));
  if(!shown.length)list.append(h('li',{class:'api-empty-small',role:'presentation'},t('apiQuickNone')));
  input.setAttribute('aria-activedescendant',shown.length?`api-quick-${sel}`:'');
  list.querySelector('.is-sel')?.scrollIntoView({block:'nearest'});
 };
 input.addEventListener('input',()=>{sel=0;draw();});
 input.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(shown.length){sel=(sel+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length;draw();}}
  else if(e.key==='Enter'){e.preventDefault();pick(shown[sel]);}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
 });
 overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();});
 overlay.append(h('div',{class:'api-modal-card api-quick-card'},input,list));
 panel.append(overlay);draw();input.focus();
}

/* ---------- painel ---------- */
function build(){
 els.save=h('span',{class:'api-save',role:'status','aria-live':'polite'});
 els.head=h('header',{class:'api-head'});
 els.tree=h('ul',{class:'api-tree',role:'tree','aria-label':t('apiTitle')});
 els.tabbar=h('div',{class:'api-tabbar',role:'tablist','aria-label':t('apiOpenRequests'),hidden:true,onKeydown:onTabbarKey});
 els.content=h('div',{class:'api-content'});
 els.main=h('section',{class:'api-main'},els.tabbar,els.content);
 els.importInput=h('input',{type:'file',accept:'.zip,application/zip',hidden:true,onChange:e=>{const f=e.target.files[0];e.target.value='';if(f)importZip(f);}});
 els.folderInput=h('input',{type:'file',webkitdirectory:true,multiple:true,hidden:true,'aria-label':t('apiImportFolder'),onChange:async e=>{const files=[...e.target.files];e.target.value='';if(files.length)importFolder(await readInputFolder(files));}});
 const filter=h('input',{type:'search',class:'api-filter',placeholder:t('apiFilter'),'aria-label':t('apiFilter'),onInput:e=>{state.filter=e.target.value;renderTree();}});
 const treeCol=h('nav',{class:'api-tree-col',id:'api-tree-col','aria-label':t('apiTitle')},
  h('div',{class:'api-tree-tools'},filter,h('button',{type:'button',class:'api-icon-btn',title:t('apiNewRequest'),'aria-label':t('apiNewRequest'),onClick:()=>state.coll&&newItem('request','')},'+'),h('button',{type:'button',class:'api-icon-btn',title:t('apiNewFolder'),'aria-label':t('apiNewFolder'),onClick:()=>state.coll&&newItem('folder','')},'▤')),
  els.tree);
 const resizer=h('div',{class:'api-resizer',role:'separator','aria-orientation':'vertical','aria-label':t('apiResize'),tabindex:'0'});
 const resizerV=h('div',{class:'api-resizer-v',role:'separator','aria-orientation':'horizontal','aria-label':t('apiResizeHeight'),title:t('apiResizeHeightHint'),tabindex:'0'});
 els.banner=h('div',{class:'api-attach-banner',role:'status',hidden:true},h('span',{}),h('button',{type:'button',class:'api-btn',onClick:()=>{setAttachTarget(null);hooks.attachCancel?.();}},t('apiAttachCancel')));
 panel=h('aside',{id:'api-panel',class:'api-panel',role:'complementary','aria-label':t('apiTitle'),hidden:true},resizer,resizerV,els.head,els.banner,h('div',{class:'api-body'},treeCol,treeResizer(),els.main),els.importInput,els.folderInput);
 document.addEventListener('keydown',e=>{ // Ctrl+S com o painel aberto grava a request da aba ativa (e evita o "salvar página" do navegador)
  if(state.open&&!e.shiftKey&&!e.altKey&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveActive();}
 });
 window.addEventListener('beforeunload',e=>{if(state.tabs.some(x=>x.dirty)){e.preventDefault();e.returnValue='';}}); // recarregar a página perderia o que não foi salvo
 document.body.append(panel);panel.classList.add('show-tree');
 new ResizeObserver(()=>applyTreeWidth(treeW)).observe(panel.querySelector('.api-body')); // o painel mudou de largura: mantém a lista dentro dos limites
 // em tela estreita a lista de requests aparece primeiro
 // largura: arrastar a borda ou usar as setas
 const setWidth=px=>{const w=Math.min(Math.max(px,420),window.innerWidth-260);document.documentElement.style.setProperty('--api-w',`${w}px`);store.set('cm-api-width',String(Math.round(w)));};
 resizer.addEventListener('pointerdown',e=>{e.preventDefault();resizer.setPointerCapture(e.pointerId);document.body.classList.add('api-resizing');});
 resizer.addEventListener('pointermove',e=>{if(resizer.hasPointerCapture(e.pointerId))setWidth(window.innerWidth-e.clientX);});
 const endResize=e=>{if(resizer.hasPointerCapture?.(e.pointerId))resizer.releasePointerCapture(e.pointerId);document.body.classList.remove('api-resizing');hooks.layout?.();};
 resizer.addEventListener('pointerup',endResize);resizer.addEventListener('pointercancel',endResize);
 resizer.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setWidth(panel.offsetWidth+(e.key==='ArrowLeft'?40:-40));hooks.layout?.();}});
 // altura: arrastar a borda de CIMA (a barra de cima da tela fica livre, ex.: o menu de compartilhamento do Teams); duplo clique volta à altura toda; mais baixo que a janela, o painel fica ancorado embaixo e o mapa ocupa a largura toda
 // por padrão o painel abre um pouco abaixo do topo (TOP_GAP livres: o menu de compartilhamento do Teams fica ali)
 const MIN_H=220,TOP_GAP=56;
 const applyHeight=px=>{
  const max=window.innerHeight;
  if(px>=max-4){document.documentElement.style.removeProperty('--api-h');document.body.classList.remove('api-short');return;}
  document.documentElement.style.setProperty('--api-h',`${Math.min(Math.max(px,MIN_H),max)}px`);document.body.classList.add('api-short');
 };
 // pref: número = altura escolhida; 'full' = altura toda; vazio = padrão (janela menos TOP_GAP)
 const heightPref=()=>store.get('cm-api-height')||'';
 const applyPref=()=>{const p=heightPref();applyHeight(p==='full'?window.innerHeight:Number(p)||window.innerHeight-TOP_GAP);};
 const setHeight=px=>{ // arrasto e teclado
  const max=window.innerHeight;
  if(px===null||px>=max-12){store.set('cm-api-height','full');applyHeight(max);return;}
  const h2=Math.min(Math.max(px,MIN_H),max);store.set('cm-api-height',String(Math.round(h2)));applyHeight(h2);
 };
 resizerV.addEventListener('pointerdown',e=>{e.preventDefault();resizerV.setPointerCapture(e.pointerId);document.body.classList.add('api-resizing-v');});
 resizerV.addEventListener('pointermove',e=>{if(resizerV.hasPointerCapture(e.pointerId))setHeight(window.innerHeight-e.clientY);});
 const endResizeV=e=>{if(resizerV.hasPointerCapture?.(e.pointerId))resizerV.releasePointerCapture(e.pointerId);document.body.classList.remove('api-resizing-v');hooks.layout?.();};
 resizerV.addEventListener('pointerup',endResizeV);resizerV.addEventListener('pointercancel',endResizeV);
 resizerV.addEventListener('dblclick',()=>{store.set('cm-api-height','');applyPref();hooks.layout?.();}); // volta ao padrão
 resizerV.addEventListener('keydown',e=>{
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(panel.offsetHeight+(e.key==='ArrowUp'?40:-40));hooks.layout?.();} // a borda sobe (painel maior) ou desce (menor)
  else if(e.key==='Home'||e.key==='End'){e.preventDefault();setHeight(e.key==='Home'?null:MIN_H);hooks.layout?.();}
 });
 window.addEventListener('resize',()=>applyPref());
 applyPref();
 const saved=Number(store.get('cm-api-width'));
 document.documentElement.style.setProperty('--api-w',saved>=420?`${Math.min(saved,window.innerWidth-260)}px`:'50vw');
 panel.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!panel.querySelector('.api-modal')){
   if(els.varsPop){closeVarsPop();els.varsBtn?.focus();return;}
   const openMenu=panel.querySelector('.api-menu:not([hidden])');if(openMenu){openMenu.hidden=true;return;}
   closeApiPanel();
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();send();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopPropagation();openQuickOpen();}
 });
 const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
 panel.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';panel.classList.add('is-file-over');});
 panel.addEventListener('dragleave',e=>{if(!panel.contains(e.relatedTarget))panel.classList.remove('is-file-over');});
 panel.addEventListener('drop',async e=>{
  if(!hasFiles(e))return;e.preventDefault();panel.classList.remove('is-file-over');
  const entries=[...e.dataTransfer.items].map(i=>i.webkitGetAsEntry?.()).filter(Boolean),zip=[...e.dataTransfer.files].find(f=>/.zip$/i.test(f.name));
  const files=[];for(const entry of entries)if(entry.isDirectory)await readEntry(entry,'',files);
  if(files.length)importFolder(files);else if(zip)importZip(zip);else toast(t('apiImportFolderEmpty'));
 });
 document.addEventListener('pointerdown',e=>{for(const menu of panel.querySelectorAll('.api-menu:not([hidden])'))if(!menu.parentElement.contains(e.target))menu.hidden=true;});
}

/* ---------- interface pública ---------- */
export function initApiClient(options={}){hooks=options;}
export const isApiOpen=()=>state.open;
export function setAttachTarget(label){ // faixa no topo do painel: aviso de que o próximo ⤓ vai para este card
 if(!panel)build();
 els.banner.hidden=!label;if(label)els.banner.firstChild.textContent=t('apiAttachBanner',label);
}
function flashRow(path){ // pequeno destaque na pasta, request ou coleção que o card apontou
 const row=path?els.tree.querySelector(`.api-row[data-path="${CSS.escape(path)}"]`):els.tree.querySelector('.api-collection-row');
 if(!row)return;
 row.scrollIntoView({block:'nearest'});row.classList.remove('is-flash');void row.offsetWidth;row.classList.add('is-flash');
 setTimeout(()=>row.classList.remove('is-flash'),2000);
}
/* focus: aberto a partir de um card. Só o que o card aponta fica expandido (a pasta, ou a pasta da request) e leva um destaque. */
export async function openApiPanel({collection,path,focus=false}={}){
 if(!panel)build();
 const wasOpen=state.open;
 state.open=true;panel.hidden=false;document.body.classList.add('api-open');restoreTreeUi();
 if(!wasOpen)hooks.layout?.(); // o mapa mantém o zoom e o foco (sem enquadrar de novo)
 try{
  await loadCollections();
  const wanted=collection&&state.collections.some(c=>c.id===collection)?collection:state.collections.some(c=>c.id===store.get('cm-api-coll'))?store.get('cm-api-coll'):state.collections[0]?.id;
  if(wanted){if(state.coll?.id!==wanted){state.tabs=[];clearActive();}await loadCollection(wanted);await restoreTabs();}else{state.coll=null;state.tabs=[];clearActive();}
  let item=null;
  if(focus&&path&&state.coll){
   item=findItem(state.coll.tree,path);
   if(item){state.expanded=new Set(['']);let p=parentOf(path);while(p){state.expanded.add(p);p=parentOf(p);}if(item.type==='folder')state.expanded.add(path);}
  }
  renderAll();
  if(focus&&item?.type==='request')await openRequest(path);
  if(focus&&state.coll&&(item||!path))flashRow(path||'');
  else if(path&&!focus){ // abertura simples por caminho (sem destaque)
   const it=findItem(state.coll?.tree||[],path);
   if(it?.type==='request')await openRequest(path);
   else if(it?.type==='folder'){state.expanded.add(path);let p=parentOf(path);while(p){state.expanded.add(p);p=parentOf(p);}renderTree();}
  }
 }catch(e){toast(e.message);}
 panel.querySelector('.api-url,.api-select')?.focus({preventScroll:true});
}
export async function closeApiPanel(){
 if(!panel||!state.open)return;
 await flushSave();vf.closePopover();state.open=false;panel.hidden=true;document.body.classList.remove('api-open');
 hooks.layout?.();hooks.onClose?.();
}
export const API_DRAG_TYPE=API_TYPE;
const TREE_CAP=60;
/* Lista plana (com recuo) de uma coleção ou pasta, na ordem da árvore, para o dropdown do card. */
export async function summarizeTree({collection,path=''}){
 const detail=await api('GET',`/collections/${collection}`);
 const base=path?findItem(detail.tree,path):{children:detail.tree,name:detail.name,type:'collection'};
 if(!base)return null;
 const items=[];let total=0;
 const walk=(list,depth)=>{for(const it of list){total++;if(items.length<TREE_CAP)items.push({type:it.type,name:it.name,path:it.path,method:it.method,depth});if(it.type==='folder')walk(it.children||[],depth+1);}};
 if(base.type!=='request')walk(base.children||[],0);
 return {name:path?base.name:detail.name,type:path?base.type:'collection',path,method:base.method,items,total};
}
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
