// Proxy de requisições do cliente de API: o navegador não pode chamar qualquer API (CORS), então o servidor local faz a chamada.
// Só http/https; limite de tempo e de tamanho da resposta. O acesso a esta rota já exige o cabeçalho x-context-maps e Host local.
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

const METHODS=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
const DROP_HEADERS=new Set(['host','content-length','connection','transfer-encoding','keep-alive','upgrade','proxy-connection','te','trailer']);
const TEXT_TYPE=/^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|graphql|[\w.+-]*\+(json|xml))|image\/svg)/i;
const MAX_RESPONSE=10*1024*1024,MAX_REDIRECTS=20;

/* Certificados: além da lista do Node, confia nas autoridades do sistema (no Windows, as mesmas do navegador). Assim uma CA
   corporativa (proxy que inspeciona HTTPS) funciona em qualquer máquina sem configurar nada. Desligue com CONTEXT_MAPS_SYSTEM_CA=0. */
export const systemCa=(()=>{
 if(process.env.CONTEXT_MAPS_SYSTEM_CA==='0')return {enabled:false,reason:'disabled'};
 if(typeof tls.getCACertificates!=='function'||typeof tls.setDefaultCACertificates!=='function')return {enabled:false,reason:'node'};
 try{
  const extra=tls.getCACertificates('extra')||[],system=tls.getCACertificates('system')||[];
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('bundled'),...extra,...system])]);
  return {enabled:true,count:system.length};
 }catch(error){return {enabled:false,reason:String(error?.message||error)};}
})();

/* Chamada sem verificar o certificado (coleção com "verificar SSL/TLS" desligado). O fetch do Node não tem essa opção por
   chamada, então aqui é http/https direto, com redirecionamentos e descompressão, devolvendo o mesmo formato usado abaixo. */
function insecureFetch(url,{method,headers,body,redirect,signal},hops=0){
 return new Promise((resolve,reject)=>{
  const lib=url.protocol==='https:'?https:http;
  const req=lib.request(url,{method,headers:Object.fromEntries(headers.entries()),rejectUnauthorized:false,signal},res=>{
   const status=res.statusCode||0,location=res.headers.location;
   if(redirect==='follow'&&location&&[301,302,303,307,308].includes(status)){
    res.resume();
    if(hops>=MAX_REDIRECTS)return reject(new Error('too many redirects'));
    const next=new URL(location,url),toGet=status===303||((status===301||status===302)&&method==='POST');
    const nextHeaders=new Headers(headers);if(toGet)nextHeaders.delete('content-type');
    return resolve(insecureFetch(next,{method:toGet?'GET':method,headers:nextHeaders,body:toGet?undefined:body,redirect,signal},hops+1));
   }
   const out=new Headers();
   for(const [k,v] of Object.entries(res.headers))for(const x of [].concat(v))try{out.append(k,String(x));}catch{}
   const enc=String(res.headers['content-encoding']||'').toLowerCase();
   const stream=enc==='gzip'||enc==='x-gzip'?res.pipe(zlib.createGunzip()):enc==='deflate'?res.pipe(zlib.createInflate()):enc==='br'?res.pipe(zlib.createBrotliDecompress()):res;
   resolve({status,statusText:res.statusMessage||'',url:url.href,headers:out,body:method==='HEAD'?null:stream});
  });
  req.on('error',reject);
  if(body!==undefined)req.write(body);
  req.end();
 });
}

export async function sendRequest(input){
 const out=(extra)=>({timeMs:0,...extra});
 const method=String(input?.method||'GET').toUpperCase();
 if(!METHODS.has(method))return {status:400,error:'Método inválido'};
 let url;
 try{url=new URL(String(input.url||''));}catch{return {status:400,error:'URL inválida'};}
 if(!['http:','https:'].includes(url.protocol))return {status:400,error:'Só http e https são aceitos'};
 const headers=new Headers();
 for(const h of Array.isArray(input.headers)?input.headers.slice(0,100):[]){
  const name=String(h?.name||'').trim();if(!name||DROP_HEADERS.has(name.toLowerCase())||!/^[\w!#$%&'*+.^`|~-]+$/.test(name))continue;
  try{headers.append(name,String(h.value??''));}catch{}
 }
 const timeout=Math.min(Math.max(Number(input.timeoutMs)||30000,1000),120000);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 const body=['GET','HEAD'].includes(method)||input.body===undefined||input.body===null?undefined:(input.bodyEncoding==='base64'?Buffer.from(String(input.body),'base64'):String(input.body));
 const insecure=input.verifyTls===false&&url.protocol==='https:';
 const started=performance.now();
 try{
  const options={method,headers,body,redirect:input.follow===false?'manual':'follow',signal:controller.signal};
  const res=insecure?await insecureFetch(url,options):await fetch(url,options);
  const chunks=[];let size=0,truncated=false;
  if(res.body){
   for await(const chunk of res.body){
    size+=chunk.length;
    if(size>MAX_RESPONSE){truncated=true;controller.abort();break;}
    chunks.push(chunk);
   }
  }
  const buffer=Buffer.concat(chunks),contentType=res.headers.get('content-type')||'';
  const asText=TEXT_TYPE.test(contentType)||!contentType;
  return out({status:200,result:{
   status:res.status,statusText:res.statusText,url:res.url,
   headers:[...res.headers.entries()],timeMs:Math.round(performance.now()-started),size:truncated?size:buffer.length,truncated,contentType,
   ...(insecure?{tlsUnverified:true}:{}),
   ...(asText?{bodyText:buffer.toString('utf8')}:{bodyBase64:buffer.subarray(0,1024*1024).toString('base64'),binary:true})
  }});
 }catch(error){
  const timedOut=controller.signal.aborted; // o único abort fora do limite de tamanho é o de tempo
  return out({status:200,result:{error:timedOut?'timeout':'network',detail:timedOut?String(Math.round(timeout/1000)):String(error?.cause?.code||error?.code||error?.cause?.message||error?.message||error),timeMs:Math.round(performance.now()-started)}});
 }finally{clearTimeout(timer);}
}
