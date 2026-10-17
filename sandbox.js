/* Execução isolada de scripts do Bruno (pre-request, post-response e tests).
   Camadas de proteção:
   1. <iframe sandbox="allow-scripts"> sem allow-same-origin: origem opaca, sem acesso ao app, ao DOM, a cookies nem ao localStorage;
   2. CSP `default-src 'none'`: o código não consegue usar fetch, XHR, WebSocket nem carregar nada da rede (nem sair com segredos);
   3. o código roda num Worker dentro dessa moldura, que o app encerra se passar do tempo limite (laços infinitos não travam a página);
   4. a comunicação é só por MessageChannel e a resposta é revalidada aqui antes de ser usada. */
import {chaiLite} from './chai-lite.js?v=1';

/* Corpo do worker: precisa ser autossuficiente (vai como texto). Recebe {code,input} e devolve o estado final. */
function workerMain(expect){
 const post=self.postMessage.bind(self);
 const parsePath=expr=>{const out=[];const re=/([^.[\]]+)|\[(?:"([^"]*)"|'([^']*)'|(-?\d+))\]/g;let m;while((m=re.exec(String(expr)))){out.push(m[1]!==undefined?m[1]:m[2]!==undefined?m[2]:m[3]!==undefined?m[3]:Number(m[4]));}return out;};
 const getPath=(obj,expr)=>{let v=obj;for(const t of parsePath(expr)){if(v===null||v===undefined)return undefined;v=typeof t==='number'&&Array.isArray(v)?v[t<0?v.length+t:t]:v[t];}return v;};
 const fmt=a=>{if(typeof a==='string')return a;try{return JSON.stringify(a);}catch{return String(a);}};
 const lookup=(obj,name)=>{const key=Object.keys(obj).find(k=>k.toLowerCase()===String(name).toLowerCase());return key;};
 self.onmessage=async event=>{
  const {code,input}=event.data,state={req:input.req,vars:{...input.vars},envVars:{...input.envVars},logs:[],tests:[],error:null};
  const interpolate=text=>String(text).replace(/\{\{\s*([\w$.-]+)\s*\}\}/g,(whole,k)=>k in state.vars?String(state.vars[k]):k in state.envVars?String(state.envVars[k]):k in (input.requestVars||{})?String(input.requestVars[k]):whole);
  const log=level=>(...args)=>{if(state.logs.length<200)state.logs.push({level,text:args.map(fmt).join(' ').slice(0,2000)});};
  const sandboxConsole={log:log('log'),info:log('info'),warn:log('warn'),error:log('error'),debug:log('debug')};
  const unavailable=name=>()=>{throw new Error(`${name} is not available in this client`);};
  const bru={
   getVar:k=>state.vars[k],setVar:(k,v)=>{state.vars[k]=v;},hasVar:k=>k in state.vars,deleteVar:k=>{delete state.vars[k];},
   getEnvVar:k=>state.envVars[k],setEnvVar:(k,v)=>{state.envVars[k]=v;},getEnvName:()=>input.envName,
   getRequestVar:k=>(input.requestVars||{})[k],getProcessEnv:()=>undefined,interpolate,
   sleep:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(Math.max(Number(ms)||0,0),5000))),
   setNextRequest:()=>{},cwd:()=>'',runRequest:unavailable('bru.runRequest'),sendRequest:unavailable('bru.sendRequest'),runner:{setNextRequest:()=>{},skipRequest:()=>{},stopExecution:()=>{}}
  };
  const asBody=body=>{if(typeof body!=='string')return body;try{return JSON.parse(body);}catch{return body;}};
  const req={
   getUrl:()=>state.req.url,setUrl:u=>{state.req.url=String(u);},getMethod:()=>state.req.method,setMethod:m=>{state.req.method=String(m).toUpperCase();},
   getHeader:n=>{const k=lookup(state.req.headers,n);return k===undefined?undefined:state.req.headers[k];},
   setHeader:(n,v)=>{const k=lookup(state.req.headers,n);if(k!==undefined)delete state.req.headers[k];state.req.headers[n]=String(v);},
   getHeaders:()=>({...state.req.headers}),setHeaders:o=>{state.req.headers=Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k,String(v)]));},
   deleteHeader:n=>{const k=lookup(state.req.headers,n);if(k!==undefined)delete state.req.headers[k];},
   getBody:()=>asBody(state.req.body),setBody:b=>{state.req.body=typeof b==='string'?b:JSON.stringify(b);},
   getName:()=>input.name,setTimeout:ms=>{state.req.timeout=Number(ms)||undefined;},getTimeout:()=>state.req.timeout,getAuthMode:()=>input.authMode
  };
  let res;
  if(input.res){
   const r=input.res;
   res=(path)=>getPath(r.body,path);
   Object.assign(res,{status:r.status,statusText:r.statusText,headers:r.headers,body:r.body,responseTime:r.responseTime,url:r.url,
    getStatus:()=>r.status,getStatusText:()=>r.statusText,getHeader:n=>{const k=lookup(r.headers,n);return k===undefined?undefined:r.headers[k];},getHeaders:()=>r.headers,getBody:()=>r.body,getResponseTime:()=>r.responseTime,getUrl:()=>r.url});
  }
  const queue=[];let prefix='';
  const test=(name,fn)=>{queue.push({name:prefix+String(name),fn});};
  const describe=(name,fn)=>{const before=prefix;prefix=`${before}${name} › `;try{fn();}finally{prefix=before;}};
  const requireShim=name=>{if(name==='chai')return {expect};throw new Error(`Module "${name}" is not available in the sandbox`);};
  try{
   const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
   Object.assign(self,{bru,req,res,test,expect,console:sandboxConsole,require:requireShim,describe,it:test}); // globais: o script pode redeclarar (const {expect}=require('chai'))
   await new AsyncFunction(code)();
   for(const item of queue){
    try{await item.fn();state.tests.push({name:item.name,passed:true});}
    catch(error){state.tests.push({name:item.name,passed:false,error:String(error&&error.message||error).slice(0,500)});}
   }
  }catch(error){state.error=String(error&&error.message||error).slice(0,1000);}
  post({ok:true,req:state.req,vars:state.vars,envVars:state.envVars,logs:state.logs,tests:state.tests,error:state.error});
 };
}
const WORKER_SOURCE=`const {expect}=(${chaiLite.toString()})();\n(${workerMain.toString()})(expect);`;

const BOOT=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:"><script>
addEventListener('message',event=>{
 const msg=event.data;if(!msg||msg.type!=='run'||!event.ports[0])return;
 const port=event.ports[0];
 try{
  const worker=new Worker(URL.createObjectURL(new Blob([msg.workerSource],{type:'text/javascript'})));
  worker.onmessage=e=>port.postMessage(e.data);
  worker.onerror=e=>port.postMessage({ok:false,error:String(e.message||'worker error')});
  worker.postMessage({code:msg.code,input:msg.input});
 }catch(error){port.postMessage({ok:false,error:'sandbox unavailable: '+error.message});}
});
<\/script>`;

const primitive=v=>v===null||['string','number','boolean'].includes(typeof v);
const asVars=o=>{const out={};for(const [k,v] of Object.entries(o&&typeof o==='object'?o:{}).slice(0,500))out[String(k).slice(0,100)]=primitive(v)?String(v??''):(()=>{try{return JSON.stringify(v);}catch{return '';}})();return out;};
// A resposta vem de um código não confiável: revalida o formato e limita tamanhos antes de o app usar.
export function sanitizeResult(data){
 if(!data||typeof data!=='object')return {ok:false,error:'invalid result'};
 if(data.ok===false)return {ok:false,error:String(data.error||'error').slice(0,500)};
 const req=data.req&&typeof data.req==='object'?data.req:{};
 const headers={};for(const [k,v] of Object.entries(req.headers&&typeof req.headers==='object'?req.headers:{}).slice(0,100))headers[String(k).slice(0,200)]=String(v??'').slice(0,8000);
 const body=req.body===undefined||req.body===null?undefined:String(req.body).slice(0,5*1024*1024);
 return {ok:true,
  req:{method:String(req.method||'GET').toUpperCase().slice(0,10),url:String(req.url||'').slice(0,8000),headers,body,timeout:Number.isFinite(req.timeout)?Math.min(Math.max(req.timeout,1),120000):undefined},
  vars:asVars(data.vars),envVars:asVars(data.envVars),
  logs:(Array.isArray(data.logs)?data.logs:[]).slice(0,200).map(l=>({level:['log','info','warn','error','debug'].includes(l?.level)?l.level:'log',text:String(l?.text??'').slice(0,2000)})),
  tests:(Array.isArray(data.tests)?data.tests:[]).slice(0,500).map(x=>({name:String(x?.name??'').slice(0,300),passed:!!x?.passed,error:x?.error?String(x.error).slice(0,500):undefined})),
  error:data.error?String(data.error).slice(0,1000):null};
}

export const sandboxSupported=()=>typeof Worker!=='undefined'&&typeof Blob!=='undefined'&&typeof MessageChannel!=='undefined';

/** input: {req, res?, vars, envVars, requestVars, envName, name, authMode}; devolve o estado final ou {ok:false,error} */
export function runScript({code,input,timeoutMs=5000}){
 return new Promise(resolve=>{
  if(!sandboxSupported())return resolve({ok:false,error:'sandbox unavailable'});
  const iframe=document.createElement('iframe'),channel=new MessageChannel();
  iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('aria-hidden','true');iframe.tabIndex=-1;iframe.title='script sandbox';
  iframe.style.cssText='position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
  let done=false;
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();iframe.remove();resolve(result);};
  const timer=setTimeout(()=>finish({ok:false,error:`timeout after ${Math.round(timeoutMs/1000)} s`}),timeoutMs);
  channel.port1.onmessage=event=>finish(sanitizeResult(event.data));
  iframe.addEventListener('load',()=>{try{iframe.contentWindow.postMessage({type:'run',workerSource:WORKER_SOURCE,code:String(code),input},'*',[channel.port2]);}catch(error){finish({ok:false,error:String(error.message||error)});}});
  iframe.srcdoc=BOOT;
  document.body.append(iframe);
 });
}
