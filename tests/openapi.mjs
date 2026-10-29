// OpenAPI/Swagger nos cards: adicionar (colar), miniatura no card, Swagger UI interativo ao clicar, "Try it out" pelo proxy local
// e a documentação ao lado do API client quando ele está aberto.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-oa-'));
const port=4204,base=`http://127.0.0.1:${port}`;

// API alvo (sem CORS: só funciona se passar pelo proxy do servidor)
const seen=[];
const target=createServer((req,res)=>{seen.push(`${req.method} ${req.url}`);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({pets:[{id:1,name:'Rex'}]}));});
await new Promise(r=>target.listen(0,'127.0.0.1',r));
const host=`http://127.0.0.1:${target.address().port}`;
const SPEC=[
 'openapi: 3.0.3',
 'info:',
 '  title: Pets API',
 '  version: 2.0.0',
 'servers:',
 `  - url: ${host}`,
 'paths:',
 '  /pets:',
 '    get:',
 '      summary: Lista pets',
 '      responses:',
 "        '200': {description: OK}",
 '    post:',
 '      summary: Cria pet',
 '      responses:',
 "        '201': {description: Criado}",
 '  /pets/{id}:',
 '    delete:',
 '      summary: Apaga',
 '      parameters:',
 '        - {name: id, in: path, required: true, schema: {type: integer}}',
 '      responses:',
 "        '204': {description: Apagado}",
 ''].join('\n');
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),COLLECTIONS_DIR:path.join(work,'collections'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const browser=await launch();
try{
 const made=await call('POST','/presentations',{title:'Specs'});
 await call('PUT',`/presentations/${made.id}`,{title:'Specs',roots:[{id:'r',title:'Sistema',children:[{id:'c1',title:'Pets',children:[]}]}]});
 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?25000:12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?p=${made.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();
 await page.locator('#edit-switch').click();await page.locator('#fit').click();
 const saved=async()=>JSON.parse(await readFile(path.join(work,'presentations',`${made.id}.json`),'utf8')).roots[0].children[0];

 // OA-01: o menu do card tem "OpenAPI"; uma especificação inválida avisa e não deixa adicionar
 await page.locator('[data-id="c1"]').hover();await page.locator('[data-id="c1"] .edit-fab').click();
 await page.locator('#radial-menu [aria-label^="Add OpenAPI/Swagger"]').click();
 const dlg=page.locator('.oa-modal');await dlg.waitFor();
 await page.locator('.oa-source').fill('just: text\n');
 await page.locator('.oa-status.is-error').waitFor();
 assert.equal(await dlg.getByRole('button',{name:'Add to card'}).isDisabled(),true);

 // OA-02: colar uma especificação válida mostra a prévia (Swagger UI) e o número de endpoints
 await page.locator('.oa-source').fill(SPEC);
 await page.locator('.oa-status',{hasText:'Valid specification: 3 endpoint(s).'}).waitFor();
 assert.equal(await page.locator('.oa-preview .opblock').count(),3);
 await dlg.getByRole('button',{name:'Add to card'}).click();await dlg.waitFor({state:'detached'});

 // OA-03: o card ganha a miniatura (SVG com título e rotas) e guarda a especificação
 for(let i=0;i<60&&!(await saved()).images?.length;i++)await new Promise(r=>setTimeout(r,100));
 const entry=(await saved()).images[0];
 assert.equal(entry.kind,'openapi');assert.equal(entry.title,'Pets API');assert.equal(entry.source,SPEC);assert.match(entry.src,/\.svg$/);
 const thumb=await (await fetch(`${base}/${entry.src}`)).text();
 assert.match(thumb,/Pets API/);assert.match(thumb,/\/pets\/\{id\}/);assert.match(thumb,/DELETE/);assert.match(thumb,/3 endpoint/);
 assert.equal(await page.locator('[data-id="c1"] .image-button.is-openapi').count(),1);

 // OA-04: com o API client aberto, clicar abre a documentação ao lado dele (o painel segue utilizável)
 await page.locator('#edit-switch').click();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 await page.locator('.image-button.is-openapi').click();
 const viewer=page.locator('.oa-viewer');await viewer.locator('.opblock').first().waitFor();
 const geo=await page.evaluate(()=>({v:document.querySelector('.oa-viewer').getBoundingClientRect().right,p:document.querySelector('#api-panel').getBoundingClientRect().left}));
 assert.ok(geo.v<=geo.p+1,`a documentação fica ao lado do API client (${JSON.stringify(geo)})`);
 assert.equal(await page.locator('dialog[open]').count(),0);
 await page.locator('#api-panel .api-menu-wrap button[aria-haspopup=menu]').first().click();
 assert.equal(await page.locator('#api-panel .api-menu').first().isVisible(),true);
 await page.locator('#api-panel .api-menu-wrap button[aria-haspopup=menu]').first().click();

 // OA-05: "Try it out" passa pelo servidor local (a API alvo não tem CORS) e mostra a URL original
 await viewer.locator('.opblock-summary',{hasText:'/pets'}).first().click();
 await viewer.getByRole('button',{name:'Execute'}).first().click();
 await viewer.locator('.live-responses-table .response-col_status',{hasText:'200'}).waitFor();
 assert.deepEqual(seen,['GET /pets']);
 assert.equal((await viewer.locator('.request-url pre').first().textContent()).trim(),`${host}/pets`);
 assert.match(await viewer.locator('.live-responses-table .response-col_description pre').first().textContent(),/"Rex"/);

 // OA-06: Esc fecha; sem o API client a documentação ocupa a largura toda
 await viewer.locator('.oa-close').focus();await page.keyboard.press('Escape');await viewer.waitFor({state:'detached'});
 await page.evaluate(()=>document.querySelector('#api-btn').click());await page.locator('#api-panel').waitFor({state:'hidden'});
 await page.locator('.image-button.is-openapi').click();await viewer.locator('.opblock').first().waitFor();
 assert.ok((await page.evaluate(()=>document.querySelector('.oa-viewer').getBoundingClientRect().width))>=1490);
 await page.locator('.oa-close').click();await viewer.waitFor({state:'detached'});

 // OA-07: no modo de edição dá para trocar a especificação (a janela abre com o texto atual)
 await page.locator('#edit-switch').click();
 await page.locator('.image-tools button',{hasText:'Replace'}).click();
 await dlg.waitFor();assert.equal(await page.locator('.oa-source').inputValue(),SPEC);
 await page.locator('.oa-status',{hasText:'Valid specification'}).waitFor();
 await dlg.getByRole('button',{name:'Cancel'}).click();await dlg.waitFor({state:'detached'});

 assert.deepEqual(errors,[]);
 console.log('PASS OA-01..07 OpenAPI/Swagger cards: add, thumbnail, interactive docs beside the API client, Try it out via proxy');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
