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
 await call('PUT',`/presentations/${made.id}`,{title:'Specs',roots:[{id:'r',title:'Sistema',children:[{id:'c1',title:'Pets',children:[]},{id:'c2',title:'Apagar pet',children:[]}]}]});
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
 assert.match(await viewer.locator('.swagger-ui').first().evaluate(e=>getComputedStyle(e).filter),/invert/); // tema escuro
 assert.equal(await viewer.locator('.oa-host').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(22, 22, 22)');
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

 // OA-06: Esc fecha; sem o API client a documentação ocupa a metade direita, a borda ajusta a largura (lembrada) e o duplo clique volta à metade
 await viewer.locator('.oa-close').focus();await page.keyboard.press('Escape');await viewer.waitFor({state:'detached'});
 await page.evaluate(()=>document.querySelector('#api-btn').click());await page.locator('#api-panel').waitFor({state:'hidden'});
 await page.locator('.image-button.is-openapi').click();await viewer.locator('.opblock').first().waitFor();
 const vbox=()=>page.evaluate(()=>{const r=document.querySelector('.oa-viewer').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};});
 let vb=await vbox();assert.ok(Math.abs(vb.width-750)<4&&vb.right>=1499,`metade direita da tela (${JSON.stringify(vb)})`);
 const grip=await page.locator('.oa-resizer').boundingBox();
 await page.mouse.move(grip.x+4,grip.y+200);await page.mouse.down();await page.mouse.move(500,grip.y+200,{steps:6});await page.mouse.up();
 vb=await vbox();assert.ok(Math.abs(vb.left-500)<6,`a borda seguiu o arrasto (${vb.left})`);
 await page.locator('.oa-close').click();await viewer.waitFor({state:'detached'});
 await page.locator('.image-button.is-openapi').click();await viewer.locator('.opblock').first().waitFor();
 vb=await vbox();assert.ok(Math.abs(vb.left-500)<6,'a largura é lembrada');
 await page.locator('.oa-resizer').dblclick();vb=await vbox();assert.ok(Math.abs(vb.width-750)<4,'duplo clique: metade da tela');
 await page.locator('.oa-close').click();await viewer.waitFor({state:'detached'});

 // OA-07: no modo de edição dá para trocar a especificação (a janela abre com o texto atual)
 await page.locator('#edit-switch').click();
 await page.locator('.image-tools button',{hasText:'Replace'}).click();
 await dlg.waitFor();assert.equal(await page.locator('.oa-source').inputValue(),SPEC);
 await page.locator('.oa-status',{hasText:'Valid specification'}).waitFor();
 await dlg.getByRole('button',{name:'Cancel'}).click();await dlg.waitFor({state:'detached'});

 // OA-08: escolher um endpoint em foco: o card destaca esse endpoint e a documentação abre já nele, expandido
 await page.locator('.image-tools button',{hasText:'Replace'}).click();await dlg.waitFor();
 await page.locator('.oa-status',{hasText:'Valid specification'}).waitFor();
 assert.deepEqual(await page.locator('.oa-focus option').allTextContents(),['None (whole API)','GET /pets — Lista pets','POST /pets — Cria pet','DELETE /pets/{id} — Apaga']);
 await page.locator('.oa-focus').selectOption('delete /pets/{id}');
 await dlg.getByRole('button',{name:'Replace'}).click();await dlg.waitFor({state:'detached'});
 for(let i=0;i<60&&!(await saved()).images?.[0]?.focus;i++)await new Promise(r=>setTimeout(r,100));
 const focused=(await saved()).images[0];
 assert.deepEqual(focused.focus,{method:'delete',path:'/pets/{id}'});assert.ok(focused.alt.startsWith('DELETE /pets/{id} from Pets API'));
 const fthumb=await (await fetch(`${base}/${focused.src}`)).text();
 assert.match(fthumb,/>DELETE</);assert.match(fthumb,/>Apaga</);assert.match(fthumb,/204/);assert.ok(fthumb.includes('+ 2 other endpoint'));
 assert.equal((fthumb.match(/>GET</g)||[]).length,0,'no foco, só o endpoint escolhido aparece em destaque');
 // reabrir a janela mantém a escolha
 await page.locator('.image-tools button',{hasText:'Replace'}).click();await dlg.waitFor();
 await page.locator('.oa-status',{hasText:'Valid specification'}).waitFor();assert.equal(await page.locator('.oa-focus').inputValue(),'delete /pets/{id}');
 await dlg.getByRole('button',{name:'Cancel'}).click();await dlg.waitFor({state:'detached'});
 await page.locator('#edit-switch').click();
 await page.locator('.image-button.is-openapi').click();
 const block=viewer.locator('.opblock.opblock-delete[data-oa-focus]');await block.waitFor();
 await viewer.locator('.opblock.opblock-delete.is-open').waitFor();
 assert.ok((await viewer.locator('.oa-head strong').textContent()).includes('Pets API · DELETE /pets/{id}'));
 await page.waitForFunction(()=>{const b=document.querySelector('.oa-host .opblock[data-oa-focus]'),h=document.querySelector('.oa-host');if(!b||!h)return false;const r=b.getBoundingClientRect(),hr=h.getBoundingClientRect();return r.top>=hr.top-2&&r.top<hr.bottom;});
 assert.equal(await viewer.locator('.opblock.is-open').count(),1); // só ele aberto
 await page.locator('.oa-close').click();await viewer.waitFor({state:'detached'});

 // OA-10: outro card reaproveita a especificação já carregada (sem colar de novo) e escolhe outro endpoint em foco
 if(!(await page.locator('#edit-switch').getAttribute('aria-checked')==='true'))await page.locator('#edit-switch').click();
 await page.locator('#fit').click();
 await page.locator('[data-id="c2"]').hover();await page.locator('[data-id="c2"] .edit-fab').click();
 await page.locator('#radial-menu [aria-label^="Add OpenAPI/Swagger"]').click();await dlg.waitFor();
 const reuse=page.locator('.oa-reuse');
 assert.deepEqual(await reuse.locator('option').allTextContents(),['Choose…','Pets API — card "Pets"']);
 await reuse.selectOption({label:'Pets API — card "Pets"'});
 await page.locator('.oa-status',{hasText:'Valid specification: 3 endpoint(s).'}).waitFor();
 assert.equal(await page.locator('.oa-source').inputValue(),SPEC);
 await page.locator('.oa-focus').selectOption('post /pets');
 await dlg.getByRole('button',{name:'Add to card'}).click();await dlg.waitFor({state:'detached'});
 const secondCard=async()=>JSON.parse(await readFile(path.join(work,'presentations',`${made.id}.json`),'utf8')).roots[0].children[1];
 for(let i=0;i<60&&!(await secondCard()).images?.length;i++)await new Promise(r=>setTimeout(r,100));
 const second=(await secondCard()).images[0];
 assert.equal(second.source,SPEC);assert.deepEqual(second.focus,{method:'post',path:'/pets'});
 assert.deepEqual((await saved()).images[0].focus,{method:'delete',path:'/pets/{id}'}); // o primeiro card continua com o foco dele

 // OA-09: especificação grande (mais de 5 MB) salva sem erro; JSON vai compacto para a apresentação (o modo de edição já está ligado)
 const bigSpec=JSON.stringify({openapi:'3.0.3',info:{title:'Big API',version:'1'},'x-padding':'x'.repeat(5.5*1024*1024),paths:{'/a':{get:{summary:'A',responses:{'200':{description:'OK'}}}}}},null,2);
 await page.locator('.image-tools button',{hasText:'Replace'}).first().click();await dlg.waitFor();
 await page.locator('.oa-source').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},bigSpec);
 await page.locator('.oa-status',{hasText:'Valid specification: 1 endpoint(s).'}).waitFor({timeout:60000});
 await dlg.getByRole('button',{name:'Replace'}).click();await dlg.waitFor({state:'detached'});
 for(let i=0;i<300&&(await saved()).images[0].title!=='Big API';i++)await new Promise(r=>setTimeout(r,100));
 const bigEntry=(await saved()).images[0];
 assert.equal(bigEntry.title,'Big API');assert.equal(bigEntry.source.includes(String.fromCharCode(10)),false);assert.ok(bigEntry.source.length>5*1024*1024);
 assert.notEqual(await page.locator('#save-status').getAttribute('data-state'),'error');

 // OA-11: corpo com $ref para components/schemas (YAML) mostra o objeto inteiro, não só "string"
 const refSpec=["openapi: 3.0.3","info:","  title: Ref API","  version: \"1\"","paths:","  /orders:","    post:","      summary: Cria","      requestBody:","        required: true","        content:","          application/json:","            schema:","              $ref: '#/components/schemas/Order'","      responses:","        '201':","          description: ok","components:","  schemas:","    Order:","      type: object","      properties:","        id: {type: integer, example: 7}","        customer: {$ref: '#/components/schemas/Customer'}","    Customer:","      type: object","      properties:","        name: {type: string, example: Ana}",""].join(String.fromCharCode(10));
 const refEntry=(await saved());refEntry.images[0]={...refEntry.images[0],source:refSpec,title:'Ref API',focus:{method:'post',path:'/orders'}};
 const docNow=JSON.parse(await readFile(path.join(work,'presentations',`${made.id}.json`),'utf8'));docNow.roots[0].children[0]=refEntry;
 docNow.roots[0].children.push({id:'c3',title:'Fluxo',children:[],images:[{src:refEntry.images[0].src,alt:'Fluxo'}]}); // uma imagem comum, para o OA-12
 await call('PUT',`/presentations/${made.id}`,docNow);
 await page.goto(`${base}/?p=${made.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();await page.locator('#fit').click();
 await page.locator('[data-id="c1"] .image-button.is-openapi').click();
 const example=viewer.locator('.opblock-post .body-param__example, .opblock-post textarea.body-param__text, .opblock-post .highlight-code pre').first();await example.waitFor();
 const exampleText=JSON.stringify(JSON.parse(await example.evaluate(e=>e.value||e.textContent)));
 assert.equal(exampleText,'{"id":7,"customer":{"name":"Ana"}}');
 await page.locator('.oa-close').click();await viewer.waitFor({state:'detached'});

 // OA-12: no máximo duas janelas lado a lado. Documentação sozinha + imagem: a imagem abre à esquerda dela
 const rect=sel=>page.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};},sel);
 const lightbox=page.locator('dialog[open].is-beside');
 await page.locator('[data-id="c1"] .image-button.is-openapi').click();await viewer.locator('.opblock').first().waitFor();
 await page.evaluate(()=>document.querySelector('[data-id="c3"] .image-button').click());await lightbox.waitFor();
 const [im,oa]=[await rect('dialog[open]'),await rect('.oa-viewer')];
 assert.ok(im.left<=1&&Math.abs(im.right-oa.left)<=2,`imagem à esquerda da documentação (${JSON.stringify({im,oa})})`);
 await page.keyboard.press('Escape');await lightbox.waitFor({state:'detached'}); // o Esc com o foco na imagem fecha só ela
 assert.equal(await viewer.count(),1);
 // o API client abre com as duas abertas: a imagem fecha e a documentação fica ao lado dele
 await page.evaluate(()=>document.querySelector('[data-id="c3"] .image-button').click());await lightbox.waitFor();
 await page.evaluate(()=>document.querySelector('#api-btn').click());await page.locator('#api-panel').waitFor({state:'visible'});
 await lightbox.waitFor({state:'detached'});assert.equal(await viewer.count(),1);
 // API client + documentação e abre uma imagem: ela toma o lugar da documentação
 await page.evaluate(()=>document.querySelector('[data-id="c3"] .image-button').click());await lightbox.waitFor();
 await viewer.waitFor({state:'detached'});
 const [im2,api]=[await rect('dialog[open]'),await rect('#api-panel')];assert.ok(Math.abs(im2.right-(1500-api.width))<=2,JSON.stringify({im2,api})); // ao lado do painel (que ainda pode estar deslizando)
 await page.locator('dialog[open]').focus();await page.keyboard.press('Escape');await lightbox.waitFor({state:'detached'});

 assert.deepEqual(errors,[]);
 console.log('PASS OA-01..12 OpenAPI/Swagger cards: add, thumbnail, interactive docs beside the API client, Try it out via proxy');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
