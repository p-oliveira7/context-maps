// Sandbox dos scripts do Bruno: funciona, não alcança a rede nem o app, e laços infinitos são encerrados.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-sbx-'));
const port=4198,base=`http://127.0.0.1:${port}`;
const hits=[];
const spy=createServer((req,res)=>{hits.push(req.url);res.writeHead(200,{'access-control-allow-origin':'*'});res.end('hit');});
await new Promise(r=>spy.listen(0,'127.0.0.1',r));
const spyUrl=`http://127.0.0.1:${spy.address().port}/leak`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const browser=await launch();
try{
 const page=await browser.newPage();page.setDefaultTimeout(process.env.CI?20000:8000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.node').first().waitFor();
 const run=(code,extra={},timeoutMs)=>page.evaluate(async ({code,extra,timeoutMs})=>{
  const {runScript}=await import('/sandbox.js?v=1');
  const input={req:{method:'GET',url:'http://x/a?b=1',headers:{Accept:'*/*'},body:'{"n":1}'},vars:{token:'t0'},envVars:{host:'h'},requestVars:{},envName:'local',name:'Demo',...extra};
  return runScript({code,input,timeoutMs});
 },{code,extra,timeoutMs});

 // SBX-01: lê e altera req, variáveis e ambiente; testes com expect; console; res
 const ok=await run(`
  req.setHeader('X-Run','1'); req.setUrl(req.getUrl()+'&c=2'); req.setBody({n:2});
  bru.setVar('a',1); bru.setEnvVar('host','h2'); bru.deleteVar('token');
  console.log('olá',{k:1}); console.warn('cuidado');
  const data=res('data.items[1].id'); bru.setVar('id',data);
  test('status', ()=>expect(res.status).to.equal(201));
  test('corpo', ()=>{expect(res.body).to.have.property('data').that.is.an('object');expect(res.getHeader('Content-Type')).to.include('json');});
  test('falha', ()=>expect(res.status).to.equal(200));
  await test('async', async()=>{await bru.sleep(10);expect(bru.interpolate('{{host}}')).to.equal('h2');});
 `,{res:{status:201,statusText:'Created',headers:{'content-type':'application/json'},body:{data:{items:[{id:1},{id:7}]}},responseTime:12,url:'http://x/a'}});
 assert.equal(ok.ok,true,JSON.stringify(ok));assert.equal(ok.error,null);
 assert.equal(ok.req.headers['X-Run'],'1');assert.equal(ok.req.url,'http://x/a?b=1&c=2');assert.equal(ok.req.body,'{"n":2}');
 assert.deepEqual([ok.vars.a,ok.vars.id,'token' in ok.vars,ok.envVars.host],['1','7',false,'h2']);
 assert.deepEqual(ok.logs.map(l=>[l.level,l.text]),[['log','olá {"k":1}'],['warn','cuidado']]);
 assert.deepEqual(ok.tests.map(t=>[t.name,t.passed]),[['status',true],['corpo',true],['falha',false],['async',true]]);
 assert.match(ok.tests[2].error,/expected 201 to equal 200/);

 // SBX-02: erro de sintaxe/execução vira mensagem, sem quebrar o app
 const bad=await run(`const x = ;`);assert.equal(bad.ok,true);assert.match(bad.error,/Unexpected token/);
 const thrown=await run(`throw new Error('explodiu')`);assert.equal(thrown.error,'explodiu');
 assert.match((await run(`require('lodash')`)).error,/not available/);
 assert.equal((await run(`const {expect}=require('chai');expect(1).to.equal(1)`)).error,null);

 // SBX-03: sem rede, sem armazenamento e sem acesso ao app
 const net=await run(`
  const attempts={};
  const tryIt=async(name,fn)=>{try{await fn();attempts[name]='ALLOWED';}catch(e){attempts[name]='blocked';}};
  await tryIt('fetch-spy',()=>fetch(${JSON.stringify(spyUrl)}));
  await tryIt('fetch-app',()=>fetch(${JSON.stringify(base+'/api/presentations')}));
  await tryIt('xhr',()=>new Promise((ok,fail)=>{const x=new XMLHttpRequest();x.open('GET',${JSON.stringify(spyUrl)});x.onload=ok;x.onerror=()=>fail(new Error('x'));x.send();}));
  await tryIt('ws',()=>new Promise((ok,fail)=>{const w=new WebSocket(${JSON.stringify(spyUrl.replace('http','ws'))});w.onopen=ok;w.onerror=()=>fail(new Error('x'));}));
  await tryIt('beacon',async()=>{if(!navigator.sendBeacon(${JSON.stringify(spyUrl)},'x'))throw new Error('x');});
  await tryIt('import',()=>import(${JSON.stringify(spyUrl)}));
  await tryIt('importScripts',()=>{importScripts(${JSON.stringify(spyUrl)});});
  attempts.storage=typeof localStorage==='undefined'&&typeof sessionStorage==='undefined'?'blocked':'ALLOWED';
  await tryIt('idb',()=>new Promise((ok,fail)=>{const r=indexedDB.open('x');r.onsuccess=ok;r.onerror=()=>fail(new Error('x'));}));
  attempts.parent=typeof parent==='undefined'||typeof document==='undefined'?'blocked':'ALLOWED';
  console.log(JSON.stringify(attempts));
 `,{},10000);
 const attempts=JSON.parse(net.logs.at(-1).text);
 for(const [name,state] of Object.entries(attempts))assert.equal(state,'blocked',`${name} deveria estar bloqueado: ${JSON.stringify(attempts)}`);
 await new Promise(r=>setTimeout(r,300));assert.deepEqual(hits,[],'nenhuma chamada pode chegar ao servidor espião');

 // SBX-04: laço infinito e uso de memória são limitados; a página continua responsiva
 const started=Date.now();
 const loop=await run(`while(true){}`,{},800);
 assert.equal(loop.ok,false);assert.match(loop.error,/timeout/);assert.ok(Date.now()-started<4000);
 assert.equal(await page.evaluate(()=>1+1),2);
 assert.equal(await page.locator('iframe[title="script sandbox"]').count(),0); // a moldura é removida
 const noisy=await run(`for(let i=0;i<5000;i++)console.log('x'.repeat(5000));bru.setVar('big','y'.repeat(1e6));`);
 assert.equal(noisy.logs.length,200);assert.ok(noisy.logs[0].text.length<=2000);

 // SBX-05: o resultado é revalidado (formato forçado, tamanhos limitados)
 const clean=await page.evaluate(async()=>{const {sanitizeResult}=await import('/sandbox.js?v=1');return sanitizeResult({ok:true,req:{method:'post',url:'u',headers:{a:{b:1}},body:{x:1},timeout:99999999},vars:{a:{z:1},b:null,c:true},envVars:null,logs:[{level:'hack',text:1}],tests:[{name:1,passed:'yes'}],error:{m:1}});});
 assert.deepEqual([clean.req.method,clean.req.headers.a,clean.req.timeout,clean.vars.a,clean.vars.b,clean.vars.c,clean.logs[0].level,clean.tests[0].passed],['POST','[object Object]',120000,'{"z":1}','','true','log',true]);
 assert.equal((await page.evaluate(async()=>{const {sanitizeResult}=await import('/sandbox.js?v=1');return sanitizeResult(7);})).ok,false);

 assert.deepEqual(errors,[]);
 console.log('PASS SBX-01..05 script sandbox');
}finally{await browser.close();server.kill();spy.close();await rm(work,{recursive:true,force:true});}
