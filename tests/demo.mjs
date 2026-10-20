// Apresentação de exemplo do checkout (examples/checkout-demo.mjs): diagrama complexo, todas as chamadas com mock, cenários escolhidos na janela de fluxo ao vivo.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-demo-'));
const port=4202,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),COLLECTIONS_DIR:path.join(work,'collections'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const browser=await launch();
try{
 // a semente roda contra o servidor de teste
 const seed=spawn(process.execPath,['examples/checkout-demo.mjs',base],{cwd:root,stdio:['ignore','pipe','inherit']});
 let out='';seed.stdout.on('data',d=>{out+=d;});
 assert.equal(await new Promise(r=>seed.once('exit',r)),0);
 assert.match(out,/7 requests, todas com mock ligado/);

 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?25000:10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const outbound=[];page.on('request',r=>{if(/api\/send/.test(r.url()))outbound.push(r.url());});
 await page.goto(`${base}/?p=checkout-demo`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();await page.locator('#fit').click();

 // DEMO-01: o card tem o diagrama; abri-lo abre a janela de fluxo ao vivo com um seletor de cenário por chamada
 await page.locator('.image-button.is-diagram').click();
 const win=page.locator('.seq-live-win');await win.waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.seq-live-scen-row').length===7);
 assert.deepEqual(await win.locator('.seq-live-scen-row span').allTextContents(),['POST /auth/login','POST /orders','POST /stock/reserve','POST /fraud/check','POST /payments','POST /notifications','GET /orders/:id']);
 assert.match(await win.locator('.seq-flow-info').textContent(),/0\/7 linked steps run/);

 // DEMO-02: caminho feliz: as 7 chamadas respondem pelo mock (nenhuma sai para a rede) e o caminho inteiro fica verde
 await win.getByRole('button',{name:'Run flow'}).click();
 await page.waitForFunction(()=>/7\/7 linked steps run/.test(document.querySelector('.seq-flow-info').textContent),null,{timeout:30000});
 assert.equal(outbound.length,0);
 assert.equal(await win.locator('.seq-live-tag.is-ok').count(),7);assert.equal(await win.locator('.seq-live-tag.is-fail').count(),0);
 assert.match(await win.locator('.seq-live-tag text').first().textContent(),/^200 · \d+ ms · MOCK Login válido$/);
 assert.ok((await win.locator('.seq-actor.is-path-ok').count())>=8,'os participantes do caminho ficam acesos');
 // os ramos de erro ficam apagados
 assert.ok((await win.locator('[data-step].is-path-skip').count())>10);

 // DEMO-03: trocar o cenário do pagamento para 402 muda o caminho e o fluxo pára no vermelho
 await win.getByRole('button',{name:'Reset',exact:true}).click();
 await win.getByLabel('Scenario: POST /payments').selectOption({label:'402 · Cartão recusado'});
 await win.getByRole('button',{name:'Run flow'}).click();
 await win.locator('.seq-live-tag.is-fail').waitFor();
 await page.waitForFunction(()=>/Flow stopped at: POST \/payments/.test(document.querySelector('.seq-live-foot').textContent),null,{timeout:30000});
 assert.match(await win.locator('.seq-flow-info').textContent(),/5\/7 linked steps run/);
 assert.equal(await win.locator('.seq-live-tag.is-ok').count(),4);
 assert.equal(await win.locator('[data-step].is-path-fail').count()>=1,true); // a resposta 402 termina em vermelho
 assert.equal(outbound.length,0);

 // DEMO-04: o API client mostra as 7 requests com selo MOCK
 assert.equal(await page.locator('#api-panel .api-row .api-mock-pill.is-on').count()>=7,true);

 assert.deepEqual(errors,[]);
 console.log('PASS DEMO-01..04 checkout demo: complex diagram, all calls mocked, scenarios per call');
}finally{await browser.close();server.kill();await rm(work,{recursive:true,force:true});}
