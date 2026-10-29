/* OpenAPI / Swagger nos cards: a especificação (YAML ou JSON) fica guardada na imagem do card, com uma miniatura em SVG
   (título, versão e endpoints). Ao abrir, o Swagger UI (carregado sob demanda de vendor/) mostra a documentação interativa;
   o "Try it out" passa pelo servidor local (/api/send), como o API client: sem CORS e com os mesmos certificados. */

const SWAGGER_JS='vendor/swagger-ui-bundle.js?v=5.33.1',SWAGGER_CSS='vendor/swagger-ui.css?v=5.33.1';
let swaggerReady=null;
export function loadSwaggerUi(){
 if(swaggerReady)return swaggerReady;
 swaggerReady=new Promise((ok,fail)=>{
  if(!document.querySelector('link[data-swagger-ui]')){const l=document.createElement('link');l.rel='stylesheet';l.href=SWAGGER_CSS;l.dataset.swaggerUi='';document.head.append(l);}
  const s=document.createElement('script');s.src=SWAGGER_JS;
  s.onload=()=>window.SwaggerUIBundle?ok(window.SwaggerUIBundle):(swaggerReady=null,fail(new Error('Swagger UI')));
  s.onerror=()=>{swaggerReady=null;fail(new Error('Swagger UI'));};
  document.head.append(s);
 });
 return swaggerReady;
}

const METHODS=['get','post','put','patch','delete','head','options','trace'];
/** endpoints de uma especificação já interpretada: [{method,path,summary}] */
export function endpointsOf(spec){
 const out=[];
 for(const [path,item] of Object.entries(spec?.paths||{}))for(const m of METHODS)if(item&&item[m])out.push({method:m,path,summary:String(item[m].summary||item[m].operationId||'')});
 return out;
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLORS={get:'#61affe',post:'#49cc90',put:'#fca130',patch:'#50e3c2',delete:'#f93e3e',head:'#9012fe',options:'#0d5aa7',trace:'#555'};
/** miniatura do card: título, versão, quantidade e as primeiras rotas, nas cores do Swagger */
export function thumbnailSvg(spec,{more=n=>`+${n}`,endpointsLabel=n=>`${n} endpoints`}={}){
 const info=spec?.info||{},list=endpointsOf(spec),shown=list.slice(0,9),W=440,rowH=26,top=84,H=top+Math.max(1,shown.length)*rowH+(list.length>shown.length?30:14);
 const title=String(info.title||'API').slice(0,46),version=info.version?`v${String(info.version).slice(0,16)}`:'',kind=spec?.openapi?`OpenAPI ${String(spec.openapi).slice(0,8)}`:spec?.swagger?`Swagger ${String(spec.swagger).slice(0,8)}`:'OpenAPI';
 const rows=shown.map((e,i)=>{
  const y=top+i*rowH,c=COLORS[e.method]||'#888',label=e.method.toUpperCase();
  return `<rect x="16" y="${y}" width="64" height="20" rx="4" fill="${c}"/><text x="48" y="${y+14.5}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${label}</text>`+
   `<text x="90" y="${y+14.5}" font-size="12.5" fill="#e8ecef" font-family="ui-monospace,Consolas,monospace">${esc(e.path.length>40?e.path.slice(0,39)+'…':e.path)}</text>`;
 }).join('');
 const extra=list.length>shown.length?`<text x="16" y="${top+shown.length*rowH+18}" font-size="12" fill="#9aa4ad">${esc(more(list.length-shown.length))}</text>`:'';
 const empty=list.length?'':`<text x="16" y="${top+14}" font-size="12" fill="#9aa4ad">—</text>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif">`+
  `<rect width="${W}" height="${H}" rx="12" fill="#1b2027"/><rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" rx="12" fill="none" stroke="#49cc9066"/>`+
  `<rect x="16" y="16" width="26" height="26" rx="6" fill="#49cc90"/><text x="29" y="34" text-anchor="middle" font-size="14" font-weight="800" fill="#173647">{ }</text>`+
  `<text x="52" y="28" font-size="16" font-weight="700" fill="#f5f7f8">${esc(title)}</text>`+
  `<text x="52" y="45" font-size="11.5" fill="#9aa4ad">${esc([kind,version,endpointsLabel(list.length)].filter(Boolean).join(' · '))}</text>`+
  `<line x1="16" x2="${W-16}" y1="62" y2="62" stroke="#ffffff1f"/>`+rows+extra+empty+`</svg>`;
}

/* Proxy do "Try it out": troca a chamada pelo POST em /api/send e devolve a resposta no formato que o Swagger UI espera. */
const PROXIED=Symbol('cm-proxied');
function requestInterceptor(req){
 if(req.loadSpec||!/^https?:/i.test(String(req.url||'')))return req;
 const headers=Object.entries(req.headers||{}).map(([name,value])=>({name,value:String(value)}));
 let body=req.body;
 if(body!==undefined&&body!==null&&typeof body!=='string'){
  if(body instanceof FormData)body=new URLSearchParams([...body.entries()].map(([k,v])=>[k,String(v)])).toString();
  else body=JSON.stringify(body);
 }
 const original={url:req.url,method:String(req.method||'GET').toUpperCase()};
 req.url=new URL('api/send',location.href).href;req.method='POST';
 req.headers={'content-type':'application/json','x-context-maps':'1'};
 req.body=JSON.stringify({method:original.method,url:original.url,headers,body:body??undefined,timeoutMs:30000});
 req[PROXIED]=original;
 return req;
}
function responseInterceptor(res){
 if(!String(res.url||'').endsWith('/api/send'))return res;
 let r;try{r=typeof res.body==='object'&&res.body?res.body:JSON.parse(res.text||res.data||'{}');}catch{return res;}
 if(r.error){
  Object.assign(res,{status:502,statusText:'Context Maps proxy',ok:false,headers:{'content-type':'text/plain'},text:`${r.error}: ${r.detail||''}`,data:`${r.error}: ${r.detail||''}`,body:`${r.error}: ${r.detail||''}`,obj:undefined});
  return res;
 }
 const text=r.bodyText??(r.binary?`[${r.size||0} bytes]`:'');let parsed=text;try{parsed=JSON.parse(text);}catch{}
 Object.assign(res,{url:r.url||res.url,status:r.status,statusText:r.statusText||'',ok:r.status>=200&&r.status<300,headers:Object.fromEntries(r.headers||[]),text,data:text,body:parsed,obj:parsed});
 return res;
}

/** desenha o Swagger UI em `el` a partir do texto da especificação; resolve com a especificação interpretada (objeto) */
export async function mountSwagger(el,source,{tryItOut=true}={}){
 const SwaggerUIBundle=await loadSwaggerUi();
 const blob=URL.createObjectURL(new Blob([source],{type:/^\s*[{[]/.test(source)?'application/json':'text/yaml'}));
 return new Promise((resolve,reject)=>{
  let done=false;
  const ui=SwaggerUIBundle({
   domNode:el,url:blob,deepLinking:false,tryItOutEnabled:tryItOut,displayRequestDuration:true,defaultModelsExpandDepth:1,
   docExpansion:'list',filter:true,showMutatedRequest:false,requestInterceptor,responseInterceptor,
   presets:[SwaggerUIBundle.presets.apis],layout:'BaseLayout',validatorUrl:null,
   onComplete:()=>{
    if(done)return;done=true;URL.revokeObjectURL(blob);
    const spec=ui.specSelectors.specJson().toJS(),errs=ui.errSelectors?.allErrors?.().toJS?.()||[];
    if(!spec||(!spec.openapi&&!spec.swagger))reject(Object.assign(new Error('notOpenApi'),{errors:errs}));else resolve({ui,spec});
   }
  });
  setTimeout(()=>{if(!done){done=true;URL.revokeObjectURL(blob);reject(new Error('timeout'));}},20000);
 });
}

/* Visualizador: janela sem bloqueio (fica ao lado do API client quando ele está aberto, como as imagens) */
let current=null;
export function openApiViewer({source,title,t,onClose}){
 current?.close();
 const host=document.createElement('div');host.className='oa-host swagger-ui-host';
 const status=document.createElement('p');status.className='oa-status';status.textContent=t('openApiLoading');
 const close=()=>{document.removeEventListener('keydown',onKey,true);win.remove();if(current===handle)current=null;onClose?.();};
 const head=document.createElement('header');head.className='oa-head';
 const h=document.createElement('strong');h.id='oa-title';h.textContent=title||'OpenAPI';
 const x=document.createElement('button');x.type='button';x.className='oa-close';x.textContent='×';x.setAttribute('aria-label',t('openApiClose'));x.onclick=close;
 head.append(h,x);
 const win=document.createElement('section');win.className='oa-viewer';win.setAttribute('role','dialog');win.setAttribute('aria-labelledby','oa-title');
 win.append(head,status,host);
 const onKey=e=>{if(e.key==='Escape'&&!e.target.closest?.('#api-panel')&&!e.target.closest?.('.oa-host input,.oa-host textarea,.oa-host select')){e.stopPropagation();close();}};
 document.addEventListener('keydown',onKey,true);
 document.body.append(win);x.focus();
 mountSwagger(host,source).then(()=>{status.hidden=true;},e=>{status.textContent=e.message==='notOpenApi'?t('openApiInvalid'):t('openApiLoadError');status.classList.add('is-error');});
 const handle={close,el:win};current=handle;
 return handle;
}
