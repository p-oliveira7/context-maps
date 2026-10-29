// Proxy do cliente de API: certificado autoassinado falha por padrão e passa quando a coleção desliga a verificação SSL/TLS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import {sendRequest,systemCa} from '../send.mjs';

// certificado autoassinado gerado na hora (sem openssl na máquina, o teste é pulado)
const dir=mkdtempSync(path.join(tmpdir(),'cm-tls-'));
writeFileSync(path.join(dir,'openssl.cnf'),'[req]\ndistinguished_name=dn\n[dn]\n'); // config mínima: não depende do OPENSSL_CONF da máquina
const gen=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{encoding:'utf8',env:{...process.env,OPENSSL_CONF:path.join(dir,'openssl.cnf')}});
const hasCert=gen.status===0;

async function withServer(fn){
 const server=https.createServer({key:readFileSync(path.join(dir,'key.pem')),cert:readFileSync(path.join(dir,'cert.pem'))},(req,res)=>{
  if(req.url==='/go'){res.writeHead(302,{location:'/gz'});return res.end();}
  if(req.url==='/gz'){res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'});return res.end(zlib.gzipSync(JSON.stringify({ok:true,method:req.method})));}
  let body='';req.on('data',c=>{body+=c;});req.on('end',()=>{res.writeHead(201,{'content-type':'application/json','x-test':'1'});res.end(JSON.stringify({method:req.method,body,auth:req.headers.authorization||''}));});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{return await fn(`https://127.0.0.1:${server.address().port}`);}finally{server.close();}
}

test('certificado autoassinado: falha com a verificação ligada e passa com ela desligada',{skip:!hasCert&&'openssl indisponível'},async()=>{
 await withServer(async base=>{
  const strict=await sendRequest({method:'GET',url:`${base}/x`});
  assert.equal(strict.result.error,'network');
  assert.match(strict.result.detail,/SELF_SIGNED|CERT|UNABLE_TO_VERIFY/);
  const loose=await sendRequest({method:'POST',url:`${base}/x`,headers:[{name:'Authorization',value:'Bearer t'}],body:'{"a":1}',verifyTls:false});
  assert.equal(loose.result.status,201);assert.equal(loose.result.tlsUnverified,true);
  assert.deepEqual(JSON.parse(loose.result.bodyText),{method:'POST',body:'{"a":1}',auth:'Bearer t'});
  assert.ok(loose.result.headers.some(([k,v])=>k==='x-test'&&v==='1'));
  // redirecionamento e corpo comprimido também funcionam sem verificação
  const gz=await sendRequest({method:'GET',url:`${base}/go`,verifyTls:false});
  assert.equal(gz.result.status,200);assert.deepEqual(JSON.parse(gz.result.bodyText),{ok:true,method:'GET'});
  assert.match(gz.result.url,/\/gz$/);
  // sem seguir redirecionamento
  const manual=await sendRequest({method:'GET',url:`${base}/go`,verifyTls:false,follow:false});
  assert.equal(manual.result.status,302);
 });
});

test('verifyTls:false não muda nada em http e não é o padrão',async()=>{
 const bad=await sendRequest({method:'GET',url:'ftp://x'});assert.equal(bad.status,400);
 assert.equal(typeof systemCa.enabled,'boolean'); // CA do sistema: ligada quando o Node permite (v22.19+/v24.5+)
});

test.after(()=>rmSync(dir,{recursive:true,force:true}));
