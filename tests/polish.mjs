// Acabamento do cliente de API: importar cURL colado, copiar como, aviso de variáveis sem valor, menu de contexto, variáveis de sessão e tela estreita.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-polish-'));
const port=4194,base=`http://127.0.0.1:${port}`;

const seen=[];
const target=createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);
 const body=Buffer.concat(chunks).toString();
 seen.push({method:req.method,url:req.url,body,headers:req.headers});
 res.writeHead(200,{'content-type':'application/json'});
 res.end(req.url==='/login'?JSON.stringify({token:'tok-123'}):JSON.stringify({method:req.method,url:req.url,body}));
});
await new Promise(r=>target.listen(0,'127.0.0.1',r));
const host=`http://127.0.0.1:${target.address().port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
async function add(parent,name,url,patch={}){
 const made=await call('POST','/collections/polish/items',{type:'request',parent,name,method:patch.method||'get',url});
 const model=await call('GET',`/collections/polish/request?path=${encodeURIComponent(made.path)}`);
 await call('PUT',`/collections/polish/request?path=${encodeURIComponent(made.path)}`,{...model,...patch});
 return made.path;
}
const browser=await launch();
try{
 await call('POST','/collections',{name:'Polish'});
 await call('PUT','/collections/polish/environments/local',{vars:[{name:'host',value:host,enabled:true}]});
 await add('','Health','{{host}}/health');
 const users=await call('POST','/collections/polish/items',{type:'folder',name:'Users'});
 await add(users.path,'List','{{host}}/users?page=1');
 await add(users.path,'Create','{{host}}/users',{method:'post',bodyMode:'json',body:{json:'{"name":"Ana"}'},headers:[{name:'X-Trace',value:'t1',enabled:true}]});
 await add('','Login','{{host}}/login',{method:'post',varsPost:[{name:'token',value:'res.body.token',enabled:true}]});
 await add('','Needs base','{{base}}/ping');

 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},permissions:['clipboard-read','clipboard-write'],extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?15000:7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 const open=async name=>{await page.locator('.api-row-name',{hasText:new RegExp(`^${name}$`)}).click();await page.locator('.api-tab.is-active',{hasText:name}).waitFor();};
 const clip=()=>page.evaluate(()=>navigator.clipboard.readText());
 const setClip=text=>page.evaluate(t=>navigator.clipboard.writeText(t),text);
 const toast=()=>page.locator('#toast');

 // POL-01: um comando curl colado (ou digitado + Enter) na URL vira a request inteira
 await open('Health');
 await setClip(`curl '${host}/echo?x=1' \\\n  -H 'accept: application/json' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"a":1}' \\\n  --compressed`);
 await page.locator('.api-url').focus();await page.keyboard.press('ControlOrMeta+v');
 await page.waitForFunction(()=>document.querySelector('.api-method-select')?.value==='post');
 assert.equal(await page.locator('.api-url').inputValue(),`${host}/echo?x=1`);
 assert.match(await toast().textContent(),/imported from the cURL command/i);
 await page.locator('#api-tab-params').click();assert.equal(await page.locator('.api-kv-row input[type=text]').first().inputValue(),'x');
 await page.locator('#api-tab-headers').click();assert.equal(await page.locator('.api-kv-row input[type=text]').nth(2).inputValue(),'content-type');
 await page.locator('#api-tab-body').click();assert.equal(await page.locator('.api-textarea').inputValue(),'{"a":1}');
 seen.length=0;await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
 assert.deepEqual([seen[0].method,seen[0].url,seen[0].body],['POST','/echo?x=1','{"a":1}']);assert.equal(seen[0].headers.accept,'application/json');
 assert.equal((await call('GET','/collections/polish/request?path=health.bru')).method,'get'); // nada é gravado sozinho
 const putDone=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('health.bru'));
 await page.keyboard.press('ControlOrMeta+s');await putDone;
 assert.equal((await call('GET','/collections/polish/request?path=health.bru')).method,'post'); // com Ctrl+S vai para o arquivo
 await page.locator('.api-url').fill(`curl -u ana:pw -X PUT ${host}/typed`);await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.api-method-select')?.value==='put');
 assert.equal(await page.locator('.api-url').inputValue(),`${host}/typed`);
 await page.locator('#api-tab-auth').click();assert.equal(await page.locator('#api-tabpanel select').inputValue(),'basic');
 await page.locator('.api-url').fill('curl');await page.keyboard.press('Enter'); // sem endereço: não é um curl válido, segue como uma URL
 await page.locator('.api-status').waitFor();assert.equal(await page.locator('.api-method-select').inputValue(),'put');

 // POL-02: copiar como cURL ou fetch: o comando inteiro aparece na tela antes de copiar
 await open('Create');
 await page.locator('#api-panel select[aria-label="Environment"]').selectOption('local');
 const hostRe=host.replace(/[.]/g,'\\.');
 const copyDlg=page.locator('.api-copyas-modal'),shown=()=>copyDlg.locator('.api-copyas-text').textContent();
 await page.locator('.api-copyas button',{hasText:'Copy as…'}).click();await page.locator('.api-copyas .api-menu button',{hasText:'cURL'}).click();
 await copyDlg.waitFor();assert.equal(await copyDlg.getAttribute('role'),'dialog');
 assert.match(await copyDlg.locator('h3').textContent(),/Copy as — Create/);
 const curl=await shown();
 assert.match(curl,new RegExp(`^curl -X POST '${hostRe}/users'`));assert.match(curl,/-H 'X-Trace: t1'/);assert.match(curl,/-H 'Content-Type: application\/json'/);assert.match(curl,/--data-raw '\{"name":"Ana"\}'/);
 assert.equal((await clip()).startsWith('curl -X POST'),false); // ainda não copiou nada
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Copy'); // o foco vai para Copiar
 await copyDlg.getByRole('button',{name:'Copy',exact:true}).click();
 await page.waitForFunction(async()=>(await navigator.clipboard.readText()).startsWith('curl -X POST'));
 assert.equal((await clip()).replace(/\r\n/g,'\n'),curl.replace(/\r\n/g,'\n')); // o que foi copiado é exatamente o que estava na tela
 assert.equal(await copyDlg.getByRole('button',{name:'Copied'}).count(),1);
 // outro formato, e com as {{variáveis}} em vez dos valores
 await copyDlg.getByLabel('fetch').check();
 assert.match(await shown(),new RegExp(`^fetch\\("${hostRe}/users", \\{`));
 await copyDlg.getByLabel('Replace {{variables}} with their values').uncheck();
 assert.match(await shown(),/^fetch\("\{\{host\}\}\/users"/);
 await copyDlg.getByLabel('cURL').check();assert.match(await shown(),/^curl -X POST '\{\{host\}\}\/users'/);
 for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.api-copyas-modal')),true,'o foco fica preso na janela');}
 await page.keyboard.press('Escape');await copyDlg.waitFor({state:'detached'});
 assert.equal(await page.locator('#api-panel').isVisible(),true);
 // sem ambiente escolhido, o aviso de variáveis sem valor aparece na própria janela
 await page.locator('#api-panel select[aria-label="Environment"]').selectOption('');
 await page.locator('.api-copyas button',{hasText:'Copy as…'}).click();await page.locator('.api-copyas .api-menu button',{hasText:'fetch'}).click();
 await copyDlg.waitFor();assert.match(await copyDlg.locator('.api-unresolved').textContent(),/\{\{host\}\}/);
 await copyDlg.locator('footer').getByRole('button',{name:'Close'}).click();await copyDlg.waitFor({state:'detached'});
 await page.locator('#api-panel select[aria-label="Environment"]').selectOption('local');
 assert.equal(await page.locator('.api-menu:not([hidden])').count(),0); // o menu fecha

 // POL-03: variáveis sem valor avisam, com atalho para escolher o ambiente ou editar
 await open('Health');
 await page.locator('.api-url').fill('{{host}}/health');
 await page.locator('#api-panel select[aria-label="Environment"]').selectOption('');
 await page.locator('.api-send').click();
 const banner=page.locator('.api-unresolved');await banner.waitFor();
 assert.match(await banner.textContent(),/\{\{host\}\}/);
 await banner.locator('select').selectOption('local');
 await page.waitForFunction(()=>document.querySelector('.api-head select[aria-label="Environment"]').value==='local');
 await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();assert.equal(await page.locator('.api-unresolved').count(),0);
 await open('Needs base');await page.locator('.api-send').click();
 await page.locator('.api-unresolved').waitFor();assert.match(await page.locator('.api-unresolved').textContent(),/\{\{base\}\}/);
 assert.equal(await page.locator('.api-unresolved select').count(),0); // já há ambiente escolhido: só resta editá-lo
 await page.locator('.api-unresolved button',{hasText:'Edit environments'}).click();await page.locator('.api-modal').waitFor();
 await page.keyboard.press('Escape');await page.locator('.api-modal').waitFor({state:'detached'});

 // POL-04: menu de contexto (botão direito e teclado) com duplicar, copiar como e executar
 const createRow=page.locator('.api-row',{hasText:'Create'});
 await createRow.click({button:'right'});
 const ctxItems=await page.locator('.api-ctx button').allTextContents();
 assert.deepEqual(ctxItems.slice(0,4),['Open','Duplicate','Copy as cURL','Copy as fetch']);
 await page.locator('.api-ctx button',{hasText:'Duplicate'}).click();
 await page.locator('.api-tab.is-active',{hasText:'Create (copy)'}).waitFor();
 const copy=(await call('GET','/collections/polish')).tree.find(i=>i.name==='Users').children.find(i=>i.name==='Create (copy)');
 assert.ok(copy);const copyModel=await call('GET',`/collections/polish/request?path=${copy.path}`);
 assert.deepEqual([copyModel.method,copyModel.bodyMode,copyModel.body.json,copyModel.headers[0].name],['post','json','{"name":"Ana"}','X-Trace']);
 await page.locator('.api-row',{hasText:'List'}).click({button:'right'});
 await page.locator('.api-ctx button',{hasText:'Copy as cURL'}).click();
 await copyDlg.waitFor();assert.match(await shown(),/^curl 'http:\/\/.*\/users\?page=1'/); // o menu de contexto também mostra antes de copiar
 await copyDlg.getByRole('button',{name:'Copy',exact:true}).click();
 await page.waitForFunction(async()=>/^curl .*users\?page=1/.test(await navigator.clipboard.readText()));
 await page.keyboard.press('Escape');await copyDlg.waitFor({state:'detached'});
 assert.equal(await page.locator('.api-ctx').count(),0);
 const mainBtn=page.locator('.api-row',{hasText:'Create'}).first().locator('.api-row-main');
 await mainBtn.focus();
 // a tecla de menu do teclado dispara o evento contextmenu no elemento focado (no macOS o Shift+F10 não existe): simulamos o evento
 await mainBtn.evaluate(el=>{const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+8,clientY:r.y+8}));});
 await page.locator('.api-ctx').waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Open');
 await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Duplicate');
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Delete'); // dá a volta
 await page.keyboard.press('Escape');await page.locator('.api-ctx').waitFor({state:'detached'});
 assert.equal(await page.locator('#api-panel').isVisible(),true); // o Esc fechou só o menu
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('api-row-main')),true); // e o foco voltou
 await page.locator('.api-row',{hasText:'Users'}).first().click({button:'right'});
 await page.locator('.api-ctx button',{hasText:'Run this folder and its subfolders'}).click();
 await page.locator('.api-run.is-ok, .api-run.is-bad').waitFor();assert.equal(await page.locator('.api-tab-report').count(),1);
 await page.locator('.api-collection-row').click({button:'right'});
 assert.deepEqual((await page.locator('.api-ctx button').allTextContents()).slice(0,3),['Run collection','New request','New folder']);
 await page.keyboard.press('Escape');
 await page.locator('.api-run-actions button[aria-label="Close the report"]').click();

 // POL-05: variáveis de sessão num lugar só (ver, editar, remover, limpar)
 assert.equal(await page.locator('.api-vars-btn').isHidden(),true);
 await open('Login');await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
 const varsBtn=page.locator('.api-vars-btn');await varsBtn.waitFor();assert.equal((await varsBtn.textContent()).trim(),'{x} 1');
 await varsBtn.click();
 const pop=page.locator('.api-vars-pop');await pop.waitFor();
 assert.equal(await pop.locator('code').textContent(),'token');assert.equal(await pop.locator('input').inputValue(),'tok-123');
 await pop.locator('input').fill('edited');await pop.locator('input').dispatchEvent('change');
 await page.keyboard.press('Escape');await pop.waitFor({state:'detached'});
 assert.equal(await page.locator('#api-panel').isVisible(),true); // o Esc fechou só o painelzinho
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('api-vars-btn')),true);
 await page.locator('#api-tab-vars').click();assert.match(await page.locator('.api-tabpanel').textContent(),/token = edited/);
 await varsBtn.click();await pop.waitFor();
 await page.locator('#api-tab-vars').click();await pop.waitFor({state:'detached'}); // clicar fora também fecha
 await varsBtn.click();await pop.waitFor();
 await pop.locator('button[aria-label^="Remove: token"]').click();
 await varsBtn.waitFor({state:'hidden'});assert.equal(await page.locator('.api-vars-pop').count(),0);

 // POL-07: nova request pela janela, do zero ou importando um cURL (como no Bruno)
 const dialog=page.locator('.api-newreq'),newBtn=page.locator('.api-tree-tools button[aria-label="New request"]');
 await newBtn.click();await dialog.waitFor();
 assert.equal(await dialog.getAttribute('role'),'dialog');assert.match(await dialog.textContent(),/In 🗂 Polish/);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'api-newreq-name'); // o foco vai para o nome
 for(let i=0;i<14;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.api-newreq')),true,'o foco fica preso na janela');}
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 assert.equal(await page.locator('#api-panel').isVisible(),true); // o Esc fechou só a janela
 const folderRow=page.locator('.api-row',{hasText:'Users'}).first();await folderRow.hover();
 await folderRow.getByRole('button',{name:/^New request: Users/}).click();
 assert.match(await dialog.textContent(),/In 📁 Users/);
 await dialog.locator('button.primary').click(); // sem nome e sem URL
 assert.match(await dialog.locator('.api-newreq-error').textContent(),/Enter a name/);
 await dialog.locator('select').selectOption('post');await dialog.locator('.api-url').fill('{{host}}/orders?x=1');
 assert.equal(await dialog.locator('#api-newreq-name').getAttribute('placeholder'),'POST /orders'); // nome sugerido
 await dialog.locator('button.primary').click();
 await page.locator('.api-tab.is-active',{hasText:'POST /orders'}).waitFor();
 const usersOf=async()=>(await call('GET','/collections/polish')).tree.find(i=>i.name==='Users').children;
 const orders=(await usersOf()).find(i=>i.name==='POST /orders');assert.ok(orders);
 const ordersModel=await call('GET',`/collections/polish/request?path=${orders.path}`);assert.deepEqual([ordersModel.method,ordersModel.url],['post','{{host}}/orders?x=1']);
 assert.equal(await page.locator('.api-url').inputValue(),'{{host}}/orders?x=1');assert.equal(await dialog.count(),0);
 await newBtn.click();await dialog.waitFor();
 await dialog.getByLabel('Import from cURL').check();
 assert.equal(await page.evaluate(()=>document.activeElement.id),'api-newreq-curl');assert.equal(await dialog.locator('.api-url').isHidden(),true);
 await dialog.locator('textarea').fill('nonsense');
 assert.match(await dialog.locator('.api-newreq-error').textContent(),/does not look like a cURL/);assert.equal(await dialog.locator('button.primary').isDisabled(),true);
 await dialog.locator('textarea').fill(`curl -X POST '${host}/v1/items?id=9' -H 'content-type: application/json' -H 'x-k: 1' -u ana:pw --data-raw '{"a":1}'`);
 assert.match(await dialog.locator('#api-newreq-summary').textContent(),/POST .*\/v1\/items\?id=9 · 2 headers · json body/);
 assert.equal(await dialog.locator('#api-newreq-name').getAttribute('placeholder'),'POST /v1/items');
 await dialog.locator('#api-newreq-name').fill('Imported item');await page.keyboard.press('Enter');
 await page.locator('.api-tab.is-active',{hasText:'Imported item'}).waitFor();
 const imported=(await call('GET','/collections/polish')).tree.find(i=>i.name==='Imported item');assert.ok(imported);
 const importedModel=await call('GET',`/collections/polish/request?path=${imported.path}`);
 assert.deepEqual([importedModel.method,importedModel.url,importedModel.bodyMode,importedModel.body.json,importedModel.authMode,importedModel.basic.username],['post',`${host}/v1/items?id=9`,'json','{"a":1}','basic','ana']);
 assert.deepEqual(importedModel.headers.map(h=>h.name),['content-type','x-k']);
 assert.equal(await page.locator('.api-method-select').inputValue(),'post'); // e já abre no editor
 await page.locator('.api-row',{hasText:'Users'}).first().click({button:'right'});
 await page.locator('.api-ctx button',{hasText:'New request'}).click();assert.match(await dialog.textContent(),/In 📁 Users/);
 await dialog.getByRole('button',{name:'Cancel'}).click();await dialog.waitFor({state:'detached'});
 await page.locator('.api-collection-row').click({button:'right'});
 await page.locator('.api-ctx button',{hasText:'New request'}).click();assert.match(await dialog.textContent(),/In 🗂 Polish/);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});

 // POL-06: em tela estreita a lista de requests vira uma gaveta e as ações aparecem sem passar o mouse
 const phone=await browser.newContext({locale:'en-US',viewport:{width:390,height:800},isMobile:true,hasTouch:true,permissions:['clipboard-read','clipboard-write'],extraHTTPHeaders:{'x-context-maps':'1'}});
 const mob=await phone.newPage();mob.setDefaultTimeout(process.env.CI?15000:7000);
 const mobErrors=[];mob.on('pageerror',e=>mobErrors.push(e.message));
 await mob.goto(base);await mob.locator('.node').first().waitFor();
 await mob.locator('#api-btn').tap();await mob.locator('#api-panel').waitFor({state:'visible'});
 const panelBox=await mob.locator('#api-panel').boundingBox();assert.ok(Math.abs(panelBox.width-390)<2,`o painel ocupa a largura toda (${panelBox.width})`);
 await mob.locator('.api-tree-toggle').waitFor();await mob.locator('.api-row-name').first().waitFor(); // o painel carrega as coleções depois de abrir
 assert.equal(await mob.locator('.api-tree-col').isVisible(),true);assert.equal(await mob.locator('.api-tree-toggle').isVisible(),true);
 assert.equal(await mob.locator('.api-row-actions').first().isVisible(),true); // sem hover no toque
 assert.equal(await mob.locator('.api-resizer').isHidden(),true);
 await mob.locator('.api-row-name',{hasText:'Health'}).tap();
 await mob.locator('.api-url').waitFor();assert.equal(await mob.locator('.api-tree-col').isHidden(),true);
 const urlBox=await mob.locator('.api-url').boundingBox();assert.ok(urlBox.x>=0&&urlBox.x+urlBox.width<=390.5,'a URL cabe na tela');
 assert.equal(await mob.locator('.api-tree-toggle').getAttribute('aria-expanded'),'false');
 await mob.locator('.api-tree-toggle').tap();assert.equal(await mob.locator('.api-tree-col').isVisible(),true);assert.equal(await mob.locator('.api-tree-toggle').getAttribute('aria-expanded'),'true');
 await mob.locator('.api-row-name',{hasText:'Login'}).tap();await mob.locator('.api-tab.is-active',{hasText:'Login'}).waitFor();assert.equal(await mob.locator('.api-tree-col').isHidden(),true);
 assert.equal(await mob.locator('.api-layout-btn').isHidden(),true);
 const overflow=await mob.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=1,`sem rolagem horizontal da página (${overflow})`);
 await phone.close();

 assert.deepEqual(errors,[]);assert.deepEqual(mobErrors,[]);
 console.log('PASS POL-01..07 cURL, copy as, new request dialog, unresolved variables, context menu, session variables, narrow screens');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
