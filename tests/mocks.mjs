// Mocks do API client: cenários por request, modo mock da coleção, selos na árvore e no relatório, salvos junto com a request (Ctrl+S).
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-mock-'));
const port=4199,base=`http://127.0.0.1:${port}`;

// API alvo: /login devolve um token, /me só aceita esse token, /fail devolve 500, /slow demora
const seen=[];
const target=createServer((req,res)=>{
 seen.push({method:req.method,url:req.url,auth:req.headers.authorization||''});
 const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(req.url==='/slow'){setTimeout(()=>send(200,{slow:true}),4000);return;}
 if(req.url==='/login')return send(200,{token:'abc'});
 if(req.url==='/me')return req.headers.authorization==='Bearer abc'?send(200,{me:true}):send(401,{error:'no token'});
 if(req.url==='/fail')return send(500,{error:'boom'});
 send(200,{ok:true,url:req.url});
});
await new Promise(r=>target.listen(0,'127.0.0.1',r));
const host=`http://127.0.0.1:${target.address().port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
async function add(parent,name,url,patch={}){
 const made=await call('POST','/collections/suite/items',{type:'request',parent,name,method:patch.method||'get',url});
 const model=await call('GET',`/collections/suite/request?path=${encodeURIComponent(made.path)}`);
 await call('PUT',`/collections/suite/request?path=${encodeURIComponent(made.path)}`,{...model,...patch});
 return made.path;
}
const browser=await launch();
try{
 await call('POST','/collections',{name:'Suite'});
 await call('PUT','/collections/suite/environments/local',{vars:[{name:'host',value:host,enabled:true}]});
 await call('POST','/collections/suite/items',{type:'folder',name:'Pay'});
 await add('pay','Charge','{{host}}/charge',{method:'post'});
 await add('pay','Refund','{{host}}/refund',{method:'post'});
 await add('','Health','{{host}}/health');

 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?15000:7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 await page.locator('.api-row-name',{hasText:'Health'}).waitFor();
 const open=async name=>{await page.locator('.api-row-name',{hasText:name}).click();await page.locator('.api-tab.is-active',{hasText:name}).waitFor();};
 const mockTab=()=>page.locator('#api-tab-mock');
 const addScenario=async label=>{await page.locator('.api-menu-wrap button[aria-haspopup=menu]',{hasText:'Add scenario'}).click();await page.locator('.api-menu button',{hasText:label}).click();};
 const send=()=>page.locator('.api-send').click();
 const toggle=()=>page.locator('.api-mock-toggle');
 const modeSelect=()=>page.locator('select[aria-label="Answer with the mock"]');
 const saved=()=>page.locator('.api-tab-dirty').waitFor({state:'detached'});

 // MOCK-01: sem mocks, nada de selos; a aba Mock começa vazia e o modo mock da coleção aparece desligado
 await open('Charge');
 assert.equal(await page.locator('.api-row .api-mock-pill').count(),0);
 assert.equal(await toggle().getAttribute('aria-pressed'),'false');
 await mockTab().click();
 assert.match(await page.locator('.api-mock-will').textContent(),/calls the real API/);
 assert.equal(await page.locator('.api-mock-list li').count(),0);

 // MOCK-02: criar cenários a partir de modelos; o primeiro vira o ativo; editar nome e corpo
 await addScenario('Unauthorized');
 assert.equal(await page.locator('.api-mock-list li').count(),1);
 assert.equal(await page.locator('.api-mock-list input[type=radio]').isChecked(),true);
 await addScenario('200');
 assert.equal(await page.locator('.api-mock-list li').count(),2);
 await page.locator('.api-mock-sc-main').first().click();
 await page.locator('.api-mock-editor input[type=text]').first().fill('Sem saldo');
 await page.locator('.api-mock-editor textarea').first().fill('{"error":"insufficient_funds"}');
 assert.match(await mockTab().textContent(),/Mock \(2\)/);
 assert.equal(await page.locator('.api-tab.is-active .api-tab-dirty').count(),1); // editar mock suja a aba, como editar a request
 assert.equal(await page.locator('.api-tab.is-active .api-mock-pill').count(),0); // ainda desligado: sem “M” na aba

 // MOCK-03: modo "Sempre" liga o mock desta request: selo na árvore e na aba, e Enviar responde sem tocar na API
 await modeSelect().selectOption('on');
 assert.match(await page.locator('.api-mock-will').textContent(),/answers with the mock: 401/);
 assert.equal(await page.locator('.api-row',{hasText:'Charge'}).locator('.api-mock-pill.is-on').textContent(),'MOCK');
 assert.equal(await page.locator('.api-tab.is-active .api-mock-pill').textContent(),'M');
 seen.length=0;
 await send();await page.locator('.api-status strong',{hasText:'401'}).waitFor();
 assert.equal(seen.length,0); // nenhuma chamada de rede
 assert.match(await page.locator('.api-status .api-mock-pill').textContent(),/MOCK · Sem saldo/);
 assert.match(await page.locator('.api-resp-body').textContent(),/insufficient_funds/);

 // MOCK-04: a pasta soma os mocks de dentro
 assert.equal(await page.locator('.api-row',{hasText:'Pay'}).first().locator('.api-mock-pill').textContent(),'MOCK 1');

 // MOCK-05: trocar o cenário ativo muda a resposta
 await page.locator('.api-mock-list input[type=radio]').nth(1).check();
 await send();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
 assert.equal(seen.length,0);

 // MOCK-06: Ctrl+S grava mocks.json junto com a request
 await page.keyboard.press('ControlOrMeta+s');await saved();
 const disk=await call('GET','/collections/suite/mocks');
 assert.equal(Object.keys(disk.requests).join(),'pay/charge.bru');
 assert.equal(disk.requests['pay/charge.bru'].mode,'on');
 assert.equal(disk.requests['pay/charge.bru'].scenarios.length,2);
 assert.equal(disk.requests['pay/charge.bru'].scenarios[0].name,'Sem saldo');

 // MOCK-07: o modo mock da coleção: em "Auto", só responde com mock quando está ligado; a escolha é lembrada
 await modeSelect().selectOption('auto');
 await page.keyboard.press('ControlOrMeta+s');await saved();
 assert.equal(await page.locator('.api-row',{hasText:'Charge'}).locator('.api-mock-pill').textContent(),'mock'); // pronto, não ativo
 seen.length=0;await send();await page.locator('.api-status strong').waitFor();
 assert.equal(seen.length,1); // foi à API de verdade
 assert.equal(await page.locator('.api-status .api-mock-pill').count(),0);
 await toggle().click();
 assert.equal(await toggle().getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.api-row',{hasText:'Charge'}).locator('.api-mock-pill').textContent(),'MOCK');
 seen.length=0;await send();await page.locator('.api-status .api-mock-pill').waitFor();
 assert.equal(seen.length,0);
 await page.reload();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 await page.locator('.api-row-name',{hasText:'Charge'}).waitFor();
 assert.equal(await toggle().getAttribute('aria-pressed'),'true');

 // MOCK-08: timeout e erro de rede simulados
 await open('Refund');await mockTab().click();
 await addScenario('Timeout');
 await page.locator('.api-mock-editor input[type=number]').fill('150');
 await modeSelect().selectOption('on');
 await send();await page.locator('.api-status.is-error').waitFor();
 await addScenario('Network');
 await page.locator('.api-mock-list input[type=radio]').nth(1).check();
 await send();await page.locator('.api-status.is-error').waitFor();
 assert.equal(seen.filter(s=>s.url==='/refund').length,0);

 // MOCK-09: o run da pasta usa os mocks e marca MOCK no relatório (a Refund continua só na memória: salva antes)
 await page.keyboard.press('ControlOrMeta+s');await saved();
 await modeSelect().selectOption('off');
 await page.keyboard.press('ControlOrMeta+s');await saved();
 seen.length=0;
 const folder=page.locator('.api-row',{hasText:'Pay'}).first();await folder.hover();
 await folder.getByRole('button',{name:'Run this folder: Pay'}).click();
 await page.locator('.api-run.is-ok, .api-run.is-bad').waitFor();
 assert.equal(await page.locator('.api-run-item',{hasText:'Charge'}).locator('.api-mock-pill').textContent(),'MOCK');
 assert.equal(await page.locator('.api-run-item',{hasText:'Refund'}).locator('.api-mock-pill').count(),0); // "Never": chamou a API
 assert.deepEqual(seen.map(s=>s.url),['/refund']);

 assert.deepEqual(errors,[]);
 console.log('PASS MOCK-01..09 mocks: scenarios, mock mode, badges, save with the request, run report');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
