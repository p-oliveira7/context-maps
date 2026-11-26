// Organizar a árvore do cliente de API: duplicar, copiar, recortar, colar, mover entre pastas e coleções, arrastar.
// E a coleção vinculada a uma pasta do Bruno: abrir pelo caminho, atualizar ao voltar para a janela, cópia de garantia.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-organize-'));
const port=4207,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const item=(coll,type,parent,name,url='')=>call('POST',`/collections/${coll}/items`,{type,parent,name,method:'get',url});
// árvore resumida: {nome: [filhos…]} para pastas, nome para requests
const shape=items=>items.map(i=>i.type==='folder'?{[i.name]:shape(i.children)}:i.name);
const treeOf=async coll=>shape((await call('GET',`/collections/${coll}`)).tree);
const browser=await launch();
try{
 await call('POST','/collections',{name:'Org'});await call('POST','/collections',{name:'Other'});
 await item('org','request','','Health','https://example.test/health');
 const users=await item('org','folder','','Users');
 await item('org','request',users.path,'List','https://example.test/users');
 await item('org','request',users.path,'Create','https://example.test/users');
 await item('org','folder','','Archive');
 await item('other','folder','','Inbox');

 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?15000:7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{try{localStorage.setItem('cm-api-coll','org');}catch{}});
 await page.goto(base);await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 const row=name=>page.locator('.api-row',{has:page.locator('.api-row-name',{hasText:new RegExp(`^(📁 )?${name}$`)})});
 const menu=async(name,label)=>{await row(name).first().click({button:'right'});await page.locator('.api-ctx').getByRole('menuitem',{name:label,exact:true}).click();};
 const until=async(fn,want,msg)=>{let got;for(let i=0;i<60;i++){got=await fn();if(JSON.stringify(got)===JSON.stringify(want))return;await new Promise(r=>setTimeout(r,100));}assert.deepEqual(got,want,typeof msg==='function'?await msg():msg);};
 // eventos de arrastar vistos pela página (entram na mensagem quando um arrasto não tem efeito)
 await page.addInitScript(()=>{window.__drag=[];for(const t of ['dragstart','dragenter','dragover','dragleave','drop','dragend'])document.addEventListener(t,e=>{const el=e.target.closest?.('[data-path],.api-collection-row'),k=`${t}>${el?(el.dataset.path??'collection'):e.target.tagName}`;if(window.__drag.at(-1)!==k)window.__drag.push(k);},true);});
 // arrastar em etapas (o dragTo de uma vez às vezes não tem o arrasto capturado no Linux/macOS e o soltar nunca chega)
 const drag=async(src,dst,pos)=>{
  const a=await src.boundingBox();await src.hover();await page.mouse.down();
  await page.mouse.move(a.x+a.width/2+8,a.y+a.height/2+4,{steps:3});
  await dst.scrollIntoViewIfNeeded();const b=await dst.boundingBox(),x=b.x+(pos?pos.x:b.width/2),y=b.y+(pos?pos.y:b.height/2);
  await page.mouse.move(x,y,{steps:6});await page.mouse.move(x,y+.5);await page.mouse.up();
 };
 const dragLog=async()=>`drag events: ${JSON.stringify(await page.evaluate(()=>window.__drag.splice(0)))}`;
 await row('Health').waitFor();

 // ORG-01: o botão ⋯ da linha abre o mesmo menu do botão direito; duplicar vale para request e para pasta (com o que há dentro)
 await row('List').hover();await row('List').locator('.api-more-btn').click();
 assert.deepEqual(await page.locator('.api-ctx button').allTextContents(),['Open','Duplicate','Copy','Cut','Move or copy to…','Copy as cURL','Copy as fetch','Attach to the card','Rename','Delete']);
 await page.locator('.api-ctx button',{hasText:'Duplicate'}).click();
 await page.locator('.api-tab.is-active',{hasText:'List (copy)'}).waitFor();
 await menu('Users','Duplicate');
 await until(()=>treeOf('org'),['Health',{Users:['List','Create','List (copy)']},{Archive:[]},{'Users (copy)':['List','Create','List (copy)']}]);
 await call('DELETE','/collections/org/items?path=users-2');await call('DELETE','/collections/org/items?path=users/list-2.bru');

 // ORG-02: a cópia leva o que está na aba, mesmo sem salvar
 await page.reload();await page.locator('#api-btn').click();await row('Health').waitFor();
 await row('Health').locator('.api-row-main').click();await page.locator('.api-tab.is-active',{hasText:'Health'}).waitFor();
 await page.locator('.api-url').fill('https://example.test/health?draft=1');
 await menu('Health','Duplicate');await page.locator('.api-tab.is-active',{hasText:'Health (copy)'}).waitFor();
 assert.equal((await call('GET','/collections/org/request?path=health-2.bru')).url,'https://example.test/health?draft=1');
 assert.equal((await call('GET','/collections/org/request?path=health.bru')).url,'https://example.test/health'); // o original continua sem salvar
 await call('DELETE','/collections/org/items?path=health-2.bru');
 await page.reload();await page.locator('#api-btn').click();await row('Health').waitFor();

 // ORG-03: copiar (Ctrl+C na linha) e colar numa pasta pelo menu: o original fica
 await row('List').locator('.api-row-main').focus();await page.keyboard.press('Control+c');
 await row('Archive').click({button:'right'});
 await page.locator('.api-ctx button',{hasText:'Paste “List”'}).click();
 await until(()=>treeOf('org'),['Health',{Users:['List','Create']},{Archive:['List']}]);
 await page.locator('.api-tab.is-active',{hasText:'List'}).waitFor();

 // ORG-04: recortar marca a linha; Ctrl+V numa pasta move e esvazia a área de transferência
 await menu('Create','Cut');
 assert.equal(await row('Create').evaluate(e=>e.classList.contains('is-cut')),true);
 await row('Archive').locator('.api-row-main').focus();await page.keyboard.press('Control+v');
 await until(()=>treeOf('org'),['Health',{Users:['List']},{Archive:['List','Create']}]);
 await page.locator('.api-row[data-path="archive/create.bru"]').waitFor(); // a tela já refletiu a mudança
 await row('Archive').click({button:'right'});
 assert.equal(await page.locator('.api-ctx button',{hasText:'Paste'}).count(),0);await page.keyboard.press('Escape');
 assert.equal(await page.locator('.api-row.is-cut').count(),0);

 // ORG-05: "Mover ou copiar para…" leva para outra coleção; a própria pasta não aparece como destino dela
 await menu('Archive','Move or copy to…');
 const dlg=page.locator('.api-modal.api-move');await dlg.waitFor();
 const dest=dlg.locator('#api-move-dest');
 assert.deepEqual(await dest.locator('optgroup').evaluateAll(g=>g.map(x=>[x.label,[...x.querySelectorAll('option')].map(o=>o.textContent.trim())])),
  [['🗂 Org',['Collection root','📁 Users']],['🗂 Other',['Collection root','📁 Inbox']]]);
 assert.equal(await dlg.getByRole('button',{name:'Move here'}).isDisabled(),true); // o destino marcado é onde a pasta já está
 await dest.selectOption({label:'  📁 Inbox'});
 await dlg.getByRole('button',{name:'Move here'}).click();await dlg.waitFor({state:'detached'});
 await until(()=>treeOf('other'),[{Inbox:[{Archive:['List','Create']}]}]);
 assert.deepEqual(await treeOf('org'),['Health',{Users:['List']}]);
 await page.locator('#toast-text',{hasText:'“Archive” moved to Other'}).waitFor();
 assert.equal(await page.locator('.api-tab',{hasText:'List'}).count(),0); // a aba da request que saiu fecha
 // copiar para a raiz de outra coleção mantém o original
 await menu('Health','Move or copy to…');await dlg.waitFor();
 await dest.selectOption({index:2});await dlg.getByRole('button',{name:'Copy here'}).click();await dlg.waitFor({state:'detached'});
 await until(()=>treeOf('other'),[{Inbox:[{Archive:['List','Create']}]},'Health']);
 assert.deepEqual(await treeOf('org'),['Health',{Users:['List']}]);

 // ORG-06: copiar numa coleção e colar em outra (a área de transferência continua ao trocar de coleção)
 await menu('List','Copy');
 await page.locator('.api-select').first().selectOption('other');
 await row('Inbox').waitFor();
 await row('Inbox').locator('.api-row-main').focus();await page.keyboard.press('Control+v');
 await until(()=>treeOf('other'),[{Inbox:[{Archive:['List','Create']},'List']},'Health']);
 assert.deepEqual(await treeOf('org'),['Health',{Users:['List']}]);
 await page.locator('.api-tab.is-active',{hasText:'List'}).waitFor(); // a cópia colada abre numa aba

 // ORG-07: arrastar para dentro de uma pasta move; a aba aberta acompanha; soltar no nome da coleção volta para a raiz
 await row('Health').locator('.api-row-main').click();await page.locator('.api-tab.is-active',{hasText:'Health'}).waitFor();
 const inbox=await row('Inbox').boundingBox();
 await drag(row('Health').locator('.api-row-main'),row('Inbox'),{x:40,y:inbox.height/2});
 await until(()=>treeOf('other'),[{Inbox:[{Archive:['List','Create']},'List','Health']}],dragLog);
 await page.locator('.api-row.is-active[data-path="inbox/health.bru"]').waitFor();
 await page.locator('.api-tab.is-active',{hasText:'Health'}).waitFor();
 await page.evaluate(()=>{window.__drag.length=0;});
 await drag(row('Health').locator('.api-row-main'),page.locator('.api-collection-row .api-collection-name'));
 await until(()=>treeOf('other'),[{Inbox:[{Archive:['List','Create']},'List']},'Health'],dragLog);
 await page.locator('.api-row[data-path="health.bru"]').waitFor();
 // soltar na borda de um item de outra pasta leva para aquela posição
 const first=row('Archive');
 await drag(row('Health').locator('.api-row-main'),first,{x:40,y:2});
 await until(()=>treeOf('other'),[{Inbox:['Health',{Archive:['List','Create']},'List']}],dragLog);
 await page.locator('.api-row[data-path="inbox/health.bru"]').waitFor();

 // ORG-08: abrir uma pasta do Bruno pelo caminho cria a coleção vinculada (com o selo) e o que muda na pasta aparece ao voltar para a janela
 const src=path.join(work,'bruno-src'),bru=(name,url)=>`meta {\n  name: ${name}\n  type: http\n  seq: 1\n}\n\nget {\n  url: ${url}\n  body: none\n  auth: none\n}\n`;
 await mkdir(src);await writeFile(path.join(src,'bruno.json'),JSON.stringify({version:'1',name:'Linked',type:'collection'}));
 await writeFile(path.join(src,'ping.bru'),bru('Ping','https://example.test/ping'));
 const headMenu=async label=>{await page.getByRole('button',{name:'More',exact:true}).click();await page.locator('.api-menu:not([hidden])').getByRole('menuitem',{name:label,exact:true}).click();};
 await headMenu('Open Bruno folder (keeps in sync)…');
 const link=page.locator('.api-modal.api-link');await link.waitFor();
 await link.getByRole('button',{name:'Open',exact:true}).click();
 assert.equal(await link.locator('#api-link-error').textContent(),'Enter the folder path');
 await link.locator('#api-link-path').fill(path.join(work,'missing'));await page.keyboard.press('Enter');
 await link.locator('#api-link-error',{hasText:'Folder without bruno.json'}).waitFor();
 await link.locator('#api-link-path').fill(src);await page.keyboard.press('Enter');await link.waitFor({state:'detached'});
 await row('Ping').waitFor();
 assert.equal(await page.locator('.api-select').first().evaluate(s=>s.selectedOptions[0].textContent),'Linked');
 const badge=page.locator('.api-link-badge');
 assert.match(await badge.getAttribute('title'),/Follows the folder .*bruno-src/);assert.equal(await badge.evaluate(e=>e.classList.contains('is-missing')),false);
 await row('Ping').locator('.api-row-main').click();await page.locator('.api-tab.is-active',{hasText:'Ping'}).waitFor();
 assert.equal(await page.locator('.api-url').inputValue(),'https://example.test/ping');
 await writeFile(path.join(src,'ping.bru'),bru('Ping v2','https://example.test/ping/v2'));
 await writeFile(path.join(src,'status.bru'),bru('Status','https://example.test/status').replace('seq: 1','seq: 2'));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); // como ao voltar do Bruno para o navegador
 await row('Status').waitFor();await row('Ping v2').waitFor();
 await page.locator('.api-tab.is-active',{hasText:'Ping v2'}).waitFor();
 assert.equal(await page.locator('.api-url').inputValue(),'https://example.test/ping/v2'); // a aba aberta mostra o que veio da pasta
 await page.locator('#toast-text',{hasText:'Updated from the Bruno folder'}).waitFor();
 // ORG-09: edição pendente no app não é atropelada; sem a pasta vale a cópia; desvincular tira o selo
 await page.locator('.api-url').fill('https://example.test/ping/mine');
 await writeFile(path.join(src,'ping.bru'),bru('Ping v3','https://example.test/ping/v3-from-bruno'));
 await badge.click();await row('Ping v3').waitFor();
 assert.equal(await page.locator('.api-url').inputValue(),'https://example.test/ping/mine');
 await rename(src,`${src}-away`);
 await badge.click();await page.locator('.api-link-badge.is-missing').waitFor();
 await page.locator('#toast-text',{hasText:'Folder not available'}).waitFor();
 assert.deepEqual(await treeOf('linked'),['Ping v3','Status']);await row('Status').waitFor();
 await rename(`${src}-away`,src);await badge.click();await page.locator('.api-link-badge:not(.is-missing)').waitFor();
 page.once('dialog',d=>d.accept());
 await headMenu('Unlink from the folder');await badge.waitFor({state:'detached'});
 assert.equal((await call('GET','/collections/linked')).link,null);assert.deepEqual(await treeOf('linked'),['Ping v3','Status']);

 // por último (um arrasto recusado deixa o mouse do navegador de teste preso): uma pasta não entra nela mesma nem numa pasta filha
 await page.locator('.api-url').focus();await page.keyboard.press('Control+s'); // grava a edição pendente (a cópia aceita edições do app)
 await until(async()=>(await call('GET','/collections/linked/request?path=ping.bru')).url,'https://example.test/ping/mine');
 await page.locator('.api-tab-dirty').waitFor({state:'detached'});

 // ORG-10: duplicar, renomear, copiar e colar não reabrem nem fecham pastas; as pastas abertas voltam como estavam ao reabrir a coleção
 await call('POST','/collections',{name:'Big'});
 for(const f of ['Flags','Orders','People']){const made=await item('big','folder','',f);await item('big','request',made.path,`${f} get`,'https://example.test/x');}
 await item('big','folder','flags','Nested');
 const openState=()=>page.$$eval('.api-row[aria-expanded]',els=>Object.fromEntries(els.map(e=>[e.dataset.path,e.getAttribute('aria-expanded')])));
 await page.reload();await page.locator('#api-btn').click();await page.locator('.api-collection-row').waitFor(); // a lista de coleções passa a ter a nova
 await page.locator('.api-select').first().selectOption('big');await row('Orders').waitFor();
 assert.deepEqual(await openState(),{flags:'true','flags/nested':'false',orders:'true',people:'true'}); // primeira vez: as do primeiro nível abertas
 await row('Orders').locator('.api-row-main').click();await row('People').locator('.api-row-main').click();await row('Nested').locator('.api-row-main').click();
 const want={flags:'true','flags/nested':'true',orders:'false',people:'false'};
 assert.deepEqual(await openState(),want);
 await menu('Flags get','Duplicate');await row('Flags get \\(copy\\)').waitFor();
 assert.deepEqual(await openState(),want);
 page.once('dialog',d=>d.accept('Flags by id'));await menu('Flags get \\(copy\\)','Rename');await row('Flags by id').waitFor();
 assert.deepEqual(await openState(),want);
 await menu('Flags by id','Copy');await menu('Nested','Paste “Flags by id”');
 await until(()=>treeOf('big'),[{Flags:['Flags get',{Nested:['Flags by id']},'Flags by id']},{Orders:['Orders get']},{People:['People get']}]);
 assert.deepEqual(await openState(),want);
 // trocar de coleção e voltar, ou recarregar a página: continua como estava
 await page.locator('.api-select').first().selectOption('other');await row('Inbox').waitFor();
 await page.locator('.api-select').first().selectOption('big');await row('Orders').waitFor();
 assert.deepEqual(await openState(),want);
 await page.reload();await page.locator('#api-btn').click();await page.locator('.api-select').first().selectOption('big');await row('Orders').waitFor();
 assert.deepEqual(await openState(),want);

 await page.locator('.api-select').first().selectOption('other');await row('Inbox').waitFor();
 await drag(row('Inbox').locator('.api-row-main'),row('Archive'),{x:40,y:(await row('Archive').boundingBox()).height/2});
 assert.deepEqual(await treeOf('other'),[{Inbox:['Health',{Archive:['List','Create']},'List']}]);

 assert.deepEqual(errors,[]);
 console.log('PASS ORG-01..10 organize the request tree (duplicate, copy, cut, paste, move, drag, open folders kept) and collections linked to a Bruno folder');
}finally{await browser.close();server.kill();await rm(work,{recursive:true,force:true});}
