/* Montagem e resolução de requests do cliente de API (sem DOM, testável em Node):
   modelo .bru -> request "crua" (com {{variáveis}}) -> scripts podem alterar -> request resolvida -> envio. */

export const activeEntries=list=>(list||[]).filter(e=>e.enabled!==false&&e.name);

export function resolveVars(text,vars){
 return String(text??'').replace(/\{\{\s*([\w$.-]+)\s*\}\}/g,(whole,key)=>{
  if(key==='$timestamp')return String(Math.floor(Date.now()/1000));
  if(key==='$isoTimestamp')return new Date().toISOString();
  if(key==='$guid')return crypto.randomUUID();
  if(key==='$randomInt')return String(Math.floor(Math.random()*1000));
  return vars.has(key)?vars.get(key):whole;
 });
}
const escapeRe=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const BODY_TYPES={json:'application/json',text:'text/plain',xml:'application/xml',formUrlEncoded:'application/x-www-form-urlencoded'};

/** Request com os textos originais (ainda com {{variáveis}}), pronta para os scripts de pré-requisição. */
export function buildRaw(model,collHeaders=[]){
 const headers=new Map();
 for(const e of [...activeEntries(collHeaders),...activeEntries(model.headers)])headers.set(e.name.toLowerCase(),{name:e.name,value:e.value});
 if(model.authMode==='bearer'&&model.bearer?.token)headers.set('authorization',{name:'Authorization',value:`Bearer ${model.bearer.token}`});
 const mode=model.bodyMode||'none';
 let body,form;
 if(mode==='json')body=model.body?.json||'';
 else if(mode==='text')body=model.body?.text||'';
 else if(mode==='xml')body=model.body?.xml||'';
 else if(mode==='formUrlEncoded')form=activeEntries(model.formUrlEncoded).map(e=>({name:e.name,value:e.value}));
 if(BODY_TYPES[mode]&&!headers.has('content-type'))headers.set('content-type',{name:'Content-Type',value:BODY_TYPES[mode]});
 return {method:String(model.method||'get').toUpperCase(),url:model.url||'',pathParams:activeEntries(model.pathParams).map(p=>({name:p.name,value:p.value})),headers:[...headers.values()],body,form,basic:model.authMode==='basic'?model.basic:undefined,timeout:undefined};
}

/** Resolve {{variáveis}}, parâmetros de caminho, auth basic e corpo de formulário. */
export function resolveRaw(raw,vars){
 const r=text=>resolveVars(text,vars);
 let url=r(raw.url);
 for(const p of raw.pathParams)url=url.replace(new RegExp(`/:${escapeRe(p.name)}(?=[/?#]|$)`),`/${encodeURIComponent(r(p.value))}`);
 const headers=new Map(raw.headers.map(h=>[h.name.toLowerCase(),{name:h.name,value:r(h.value)}]));
 if(raw.basic&&!headers.has('authorization'))headers.set('authorization',{name:'Authorization',value:`Basic ${btoa(unescape(encodeURIComponent(`${r(raw.basic.username)}:${r(raw.basic.password)}`)))}`});
 const body=raw.form?raw.form.map(e=>`${encodeURIComponent(r(e.name))}=${encodeURIComponent(r(e.value))}`).join('&'):raw.body===undefined?undefined:r(raw.body);
 return {method:raw.method,url,headers:[...headers.values()],body,timeout:raw.timeout};
}
export const buildRequest=(model,vars,collHeaders=[])=>resolveRaw(buildRaw(model,collHeaders),vars);

/* ---------- ponte com os scripts ---------- */
export const toScriptReq=raw=>({method:raw.method,url:raw.url,headers:Object.fromEntries(raw.headers.map(h=>[h.name,h.value])),body:raw.body});
/** Aplica no request cru o que o script alterou (método, URL, cabeçalhos, corpo, tempo limite). */
export function applyScriptReq(raw,out){
 raw.method=out.method;raw.url=out.url;
 raw.headers=Object.entries(out.headers).map(([name,value])=>({name,value}));
 if(out.body!==undefined&&out.body!==raw.body){raw.body=out.body;raw.form=undefined;}
 if(out.timeout)raw.timeout=out.timeout;
}

/* ---------- resposta ---------- */
export function parseResponseBody(response){
 if(response.binary)return '';
 const text=response.bodyText??'';
 if(/json/i.test(response.contentType||'')||/^\s*[\[{]/.test(text)){try{return JSON.parse(text);}catch{}}
 return text;
}
/** Objeto `res`/`req` usado pelos asserts e pelas variáveis pós-resposta. */
export function makeScope(response,sent){
 const headers=Object.fromEntries((response.headers||[]).map(([k,v])=>[String(k).toLowerCase(),v]));
 return {
  res:{status:response.status,statusText:response.statusText||'',headers,body:parseResponseBody(response),responseTime:response.timeMs,url:response.url||sent.url},
  req:{method:sent.method,url:sent.url,headers:Object.fromEntries((sent.headers||[]).map(h=>[h.name,h.value])),body:sent.body}
 };
}
