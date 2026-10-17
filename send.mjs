// Proxy de requisições do cliente de API: o navegador não pode chamar qualquer API (CORS), então o servidor local faz a chamada.
// Só http/https; limite de tempo e de tamanho da resposta. O acesso a esta rota já exige o cabeçalho x-context-maps e Host local.
const METHODS=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
const DROP_HEADERS=new Set(['host','content-length','connection','transfer-encoding','keep-alive','upgrade','proxy-connection','te','trailer']);
const TEXT_TYPE=/^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|graphql|[\w.+-]*\+(json|xml))|image\/svg)/i;
const MAX_RESPONSE=10*1024*1024;

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
 const started=performance.now();
 try{
  const res=await fetch(url,{method,headers,body,redirect:input.follow===false?'manual':'follow',signal:controller.signal});
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
   ...(asText?{bodyText:buffer.toString('utf8')}:{bodyBase64:buffer.subarray(0,1024*1024).toString('base64'),binary:true})
  }});
 }catch(error){
  const timedOut=controller.signal.aborted; // o único abort fora do limite de tamanho é o de tempo
  return out({status:200,result:{error:timedOut?'timeout':'network',detail:timedOut?String(Math.round(timeout/1000)):String(error?.cause?.code||error?.cause?.message||error?.message||error),timeMs:Math.round(performance.now()-started)}});
 }finally{clearTimeout(timer);}
}
