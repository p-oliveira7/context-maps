// Cliente de API: abas de requests, editor/resposta lado a lado ou empilhados com divisor, e abrir request por Ctrl+K.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-tabs-'));
const port=4199,base=`http://127.0.0.1:${port}`;

const target=createServer((req,res)=>{
 const send=body=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(req.url==='/slow'){setTimeout(()=>send({slow:true}),1500);return;}
 send({path:req.url});
});
await new Promise(r=>target.listen(0,'127.0.0.1',r));
const host=`http://127.0.0.1:${target.address().port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const browser=await launch();
try{
 await call('POST','/collections',{name:'Tabs'});
 await call('POST','/collections',{name:'Zeta'}); // para trocar de coleção com alterações abertas (TAB-12)
 await call('PUT','/collections/tabs/environments/local',{vars:[{name:'host',value:host,enabled:true}]});
 await call('POST','/collections/tabs/items',{type:'request',name:'Alpha',method:'get',url:'{{host}}/a'});
 await call('POST','/collections/tabs/items',{type:'request',name:'Beta',method:'post',url:'{{host}}/b'});
 const group=await call('POST','/collections/tabs/items',{type:'folder',name:'Group'});
 await call('POST','/collections/tabs/items',{type:'request',parent:group.path,name:'Gamma',method:'get',url:'{{host}}/slow'});
 const urlOf=async file=>(await call('GET',`/collections/tabs/request?path=${file}`)).url;
 const gammaUrl=()=>urlOf('group/gamma.bru');

 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?15000:7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 const tabs=()=>page.locator('.api-tab');
 const tabNames=()=>page.locator('.api-tab-name').allTextContents();
 const active=()=>page.locator('.api-tab.is-active .api-tab-name').textContent();
 const open=async name=>{await page.locator('.api-row-name',{hasText:name}).click();await page.locator('.api-tab.is-active',{hasText:name}).waitFor();};
 const tab=name=>page.locator('.api-tab',{hasText:name}).locator('.api-tab-main');
 const go=async name=>{await tab(name).click();await page.locator('.api-tab.is-active',{hasText:name}).waitFor();};

 // TAB-01: cada request aberta ganha uma aba; clicar na aba troca de request
 assert.equal(await page.locator('.api-tabbar').isHidden(),true);
 await open('Alpha');await open('Beta');
 assert.deepEqual(await tabNames(),['Alpha','Beta']);assert.equal(await active(),'Beta');
 assert.equal(await page.locator('.api-tabbar').getAttribute('role'),'tablist');
 assert.equal(await tab('Beta').getAttribute('aria-selected'),'true');assert.equal(await tab('Alpha').getAttribute('aria-selected'),'false');
 await go('Alpha');assert.equal(await page.locator('.api-url').inputValue(),'{{host}}/a');assert.equal(await active(),'Alpha');
 await open('Alpha');assert.equal(await tabs().count(),2); // abrir de novo não duplica
 assert.equal(await page.locator('.api-tab',{hasText:'Beta'}).locator('.api-method').textContent(),'POST');

 // TAB-02: resposta e aba interna ficam em cada request
 await page.locator('#api-panel select[aria-label="Environment"]').selectOption('local');
 await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
 await page.locator('#api-tab-headers').click();
 await go('Beta');
 assert.equal(await page.locator('.api-status').count(),0);assert.equal(await page.locator('#api-tab-params').getAttribute('aria-selected'),'true');
 await go('Alpha');
 await page.locator('.api-status strong',{hasText:'200'}).waitFor();assert.equal(await page.locator('#api-tab-headers').getAttribute('aria-selected'),'true');

 // TAB-03: o que foi digitado sobrevive à troca de aba, mas só vai para o arquivo com Ctrl+S
 await page.locator('.api-url').fill('{{host}}/a2');
 await go('Beta');
 assert.equal(await urlOf('alpha.bru'),'{{host}}/a'); // trocar de aba não grava
 await go('Alpha');assert.equal(await page.locator('.api-url').inputValue(),'{{host}}/a2');
 await page.keyboard.press('ControlOrMeta+s');
 await page.locator('.api-tab-dirty').waitFor({state:'detached'});
 assert.equal(await urlOf('alpha.bru'),'{{host}}/a2');

 // TAB-04: trocar de aba durante um envio não mistura as respostas
 await open('Gamma');
 assert.deepEqual(await tabNames(),['Alpha','Beta','Gamma']);
 await page.locator('.api-send').click();
 await go('Alpha'); // enquanto a Gamma espera 1,5 s
 await page.waitForTimeout(1800);
 assert.match(await page.locator('.api-resp-body').textContent(),/"path": "\/a"/); // a Alpha continua com a resposta dela
 await go('Gamma');
 await page.locator('.api-status strong',{hasText:'200'}).waitFor();assert.match(await page.locator('.api-resp-body').textContent(),/"slow": true/);
 await go('Beta');assert.equal(await page.locator('.api-status').count(),0);

 // TAB-05: fechar por ×, por clique do meio e pelo teclado; fechar a ativa passa para a vizinha
 await page.locator('.api-tab',{hasText:'Gamma'}).locator('.api-tab-close').click();
 await page.locator('.api-tab',{hasText:'Gamma'}).waitFor({state:'detached'});
 assert.deepEqual(await tabNames(),['Alpha','Beta']);assert.equal(await active(),'Beta');
 await open('Gamma');await tab('Gamma').click({button:'middle'});
 await page.locator('.api-tab',{hasText:'Gamma'}).waitFor({state:'detached'});
 assert.deepEqual(await tabNames(),['Alpha','Beta']);
 await tab('Alpha').focus();await page.keyboard.press('ArrowRight');
 await page.locator('.api-tab.is-active',{hasText:'Beta'}).waitFor();
 await page.waitForFunction(()=>document.activeElement.closest('.api-tab')?.textContent.includes('Beta')); // o foco acompanha a aba
 await page.keyboard.press('Home');await page.locator('.api-tab.is-active',{hasText:'Alpha'}).waitFor();
 await page.keyboard.press('Delete');
 await page.locator('.api-tab',{hasText:'Alpha'}).waitFor({state:'detached'});
 assert.deepEqual(await tabNames(),['Beta']);assert.equal(await active(),'Beta');
 await page.locator('.api-tab-close').click();
 await tabs().first().waitFor({state:'detached'});
 assert.equal(await tabs().count(),0);assert.equal(await page.locator('.api-tabbar').isHidden(),true);
 assert.match(await page.locator('.api-empty').textContent(),/Pick a request/);

 // TAB-06: as abas voltam ao reabrir (e a ativa também)
 await open('Alpha');await open('Beta');await open('Gamma');await go('Beta');
 await page.reload();await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 await page.locator('.api-tab').nth(2).waitFor();
 assert.deepEqual(await tabNames(),['Alpha','Beta','Gamma']);assert.equal(await active(),'Beta');assert.equal(await page.locator('.api-url').inputValue(),'{{host}}/b');

 // TAB-07: apagar uma request fecha a aba dela
 page.once('dialog',d=>d.accept());
 const row=page.locator('.api-row',{hasText:'Beta'});await row.hover();await row.getByRole('button',{name:/^Delete: Beta/}).click();
 await page.locator('.api-tab',{hasText:'Beta'}).waitFor({state:'detached'});
 assert.deepEqual(await tabNames(),['Alpha','Gamma']);assert.ok(['Alpha','Gamma'].includes(await active()));

 // TAB-08: editor e resposta empilhados ou lado a lado, divisor arrastável e resposta em destaque
 await go('Alpha');
 const box=sel=>page.locator(sel).boundingBox();
 assert.equal(await page.locator('.api-split').evaluate(e=>e.classList.contains('is-stack')),true); // painel de metade da tela: empilhado
 let ed=await box('.api-pane-editor'),rs=await box('.api-pane-response');assert.ok(rs.y>ed.y+ed.height-1,'resposta abaixo do editor');
 await page.locator('.api-layout-btn').click();
 assert.equal(await page.locator('.api-split').evaluate(e=>e.classList.contains('is-side')),true);
 ed=await box('.api-pane-editor');rs=await box('.api-pane-response');assert.ok(rs.x>ed.x+ed.width-1&&Math.abs(rs.y-ed.y)<4,'resposta ao lado do editor');
 const before=ed.width,handle=await box('.api-split-handle');
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
 await page.mouse.move(handle.x-120,handle.y+handle.height/2,{steps:6});await page.mouse.up();
 ed=await box('.api-pane-editor');assert.ok(ed.width<before-80,`o divisor deveria diminuir o editor (${before} -> ${ed.width})`);
 const pct=Number(await page.locator('.api-split-handle').getAttribute('aria-valuenow'));
 await page.locator('.api-split-handle').focus();await page.keyboard.press('ArrowRight');
 assert.equal(Number(await page.locator('.api-split-handle').getAttribute('aria-valuenow')),pct+5);
 await page.keyboard.press('Home');assert.equal(Number(await page.locator('.api-split-handle').getAttribute('aria-valuenow')),20);
 await page.locator('.api-max-btn').click();
 assert.equal(await page.locator('.api-pane-editor').isHidden(),true);assert.equal(await page.locator('.api-max-btn').getAttribute('aria-pressed'),'true');
 await go('Gamma');assert.equal(await page.locator('.api-pane-editor').isHidden(),true); // continua ao trocar de aba
 await page.locator('.api-max-btn').click();assert.equal(await page.locator('.api-pane-editor').isVisible(),true);
 await page.reload();await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('.api-tab').first().waitFor();
 assert.equal(await page.locator('.api-split').evaluate(e=>e.classList.contains('is-side')),true); // o layout e a posição ficam lembrados
 assert.equal(Number(await page.locator('.api-split-handle').getAttribute('aria-valuenow')),20);

 // TAB-09: Ctrl+K no painel abre a busca de requests (e não a busca do mapa)
 await page.locator('.api-url').focus();
 await page.keyboard.press('Control+k');
 await page.locator('.api-quick input').waitFor();
 assert.equal(await page.locator('#search-panel').isHidden(),true);
 assert.equal(await page.locator('.api-quick li[role=option]').count(),2); // Alpha e Gamma (a Beta foi apagada)
 await page.keyboard.type('gam');assert.deepEqual(await page.locator('.api-quick li[role=option] .api-quick-name').allTextContents(),['Gamma']);
 assert.match(await page.locator('.api-quick li[role=option] small').textContent(),/Group/);
 await page.keyboard.press('Enter');
 await page.locator('.api-quick').waitFor({state:'detached'});assert.equal(await active(),'Gamma');
 await page.waitForFunction(()=>document.activeElement?.classList.contains('api-url')); // o foco vai para a URL da request aberta
 await page.keyboard.press('Control+k');await page.locator('.api-quick input').waitFor();
 await page.keyboard.type('ZZZ');assert.equal(await page.locator('.api-quick .api-empty-small').count(),1);
 await page.keyboard.press('Escape');await page.locator('.api-quick').waitFor({state:'detached'});
 assert.equal(await page.locator('#api-panel').isVisible(),true); // o Esc fechou só a busca
 await page.keyboard.press('Control+k');await page.locator('.api-quick input').waitFor();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter'); // desce até o fim e volta ao primeiro
 await page.locator('.api-quick').waitFor({state:'detached'});await page.locator('.api-tab.is-active',{hasText:'Alpha'}).waitFor();

 // TAB-10: Ctrl+S grava o arquivo (esperamos a gravação terminar em vez de ler o arquivo sem parar: no Windows isso atrapalha)
 await open('Alpha');
 const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/request?path=alpha.bru')&&(r.request().postData()||'').includes('saved-now'));
 await page.locator('.api-url').fill('{{host}}/saved-now');
 await page.keyboard.press('Control+s');
 assert.equal((await saved).status(),200);
 assert.equal(await urlOf('alpha.bru'),'{{host}}/saved-now');

 // TAB-11: largura da lista de coleções e pastas (arrastar, teclado, padrão) e recolher
 const col=()=>page.locator('.api-tree-col'),treeHandle=page.locator('.api-tree-resizer'),treeBtn=page.locator('.api-tree-toggle');
 const colW=async()=>(await col().boundingBox()).width;
 const bodyBox=()=>page.locator('.api-body').boundingBox();
 const dragTo=async x=>{const hb=await treeHandle.boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+250);await page.mouse.down();await page.mouse.move(x,hb.y+250,{steps:8});await page.mouse.up();};
 assert.equal(await treeHandle.getAttribute('role'),'separator');assert.equal(await treeHandle.getAttribute('aria-orientation'),'vertical');
 let body=await bodyBox();const w0=await colW();
 assert.ok(Math.abs(w0-body.width*0.36)<6,`largura padrão: ~36% do painel (${w0} de ${body.width})`);
 const h0=await treeHandle.boundingBox();await dragTo(h0.x+h0.width/2+80);
 const w1=await colW();assert.ok(Math.abs(w1-(w0+80))<6,`o arrasto aumenta a lista em 80 px (${w0} -> ${w1})`);
 assert.equal(Number(await treeHandle.getAttribute('aria-valuenow')),Math.round(w1));
 await dragTo(body.x+5);assert.equal(Math.round(await colW()),140); // mínimo
 await dragTo(body.x+body.width-5);assert.equal(Math.round(await colW()),Math.round(body.width-320)); // sobra espaço para o editor
 await treeHandle.focus();
 await page.keyboard.press('Home');assert.equal(Math.round(await colW()),140);
 await page.keyboard.press('ArrowRight');assert.equal(Math.round(await colW()),156);
 await page.keyboard.press('Shift+ArrowRight');assert.equal(Math.round(await colW()),204);
 await page.keyboard.press('ArrowLeft');assert.equal(Math.round(await colW()),188);
 await page.keyboard.press('End');assert.equal(Math.round(await colW()),Math.round(body.width-320));
 await page.keyboard.press('Home');await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight'); // 236
 const savedW=Math.round(await colW());
 await page.reload();await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('.api-tab').first().waitFor();
 assert.equal(Math.round(await colW()),savedW); // a largura fica lembrada
 await page.locator('.api-tree-resizer').dblclick();body=await bodyBox();
 assert.ok(Math.abs(await colW()-body.width*0.36)<6,'duplo clique volta ao padrão');
 await page.locator('.api-tree-resizer').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 assert.ok(Math.abs(await colW()-body.width*0.36)<6,'Enter também volta ao padrão');
 const editorBefore=(await page.locator('.api-content').boundingBox()).width;
 assert.equal(await treeBtn.getAttribute('aria-expanded'),'true');
 await treeBtn.click();
 assert.equal(await col().isHidden(),true);assert.equal(await treeHandle.isHidden(),true);assert.equal(await treeBtn.getAttribute('aria-expanded'),'false');
 assert.ok((await page.locator('.api-content').boundingBox()).width>editorBefore+100,'o editor ganha o espaço da lista');
 await page.reload();await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('.api-tab').first().waitFor();
 assert.equal(await col().isHidden(),true); // continua recolhida
 await treeBtn.click();assert.equal(await col().isVisible(),true);assert.equal(await treeBtn.getAttribute('aria-expanded'),'true');

 // TAB-12: nada é salvo sozinho; Ctrl+S ou o botão Salvar gravam, e fechar com alterações pergunta antes
 const dirtyDot=name=>page.locator('.api-tab',{hasText:name}).locator('.api-tab-dirty');
 const ask=page.locator('.api-unsaved-card');
 await open('Gamma');await page.locator('.api-url').fill('{{host}}/slow?edited=1');
 await dirtyDot('Gamma').waitFor();assert.equal((await page.locator('.api-save').textContent()).trim(),'Unsaved changes');
 assert.equal(await page.locator('.api-save-btn').isEnabled(),true);
 await page.waitForTimeout(1500); // o salvamento automático antigo teria gravado em 0,6 s
 assert.equal(await gammaUrl(),'{{host}}/slow');
 await go('Alpha');assert.equal(await dirtyDot('Alpha').count(),0);assert.equal(await page.locator('.api-save-btn').isDisabled(),true);
 await go('Gamma');assert.equal(await page.locator('.api-url').inputValue(),'{{host}}/slow?edited=1');assert.equal(await dirtyDot('Gamma').count(),1); // trocar de aba não perde nem grava
 assert.equal(await gammaUrl(),'{{host}}/slow');

 // fechar com alterações pergunta: Esc e Cancelar mantêm a aba
 await page.locator('.api-tab',{hasText:'Gamma'}).locator('.api-tab-close').click();
 await ask.waitFor();assert.equal(await ask.evaluate(e=>e.parentElement.getAttribute('role')),'alertdialog');assert.match(await ask.textContent(),/“Gamma” has changes that were not saved/);
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Save'); // o foco começa em Salvar
 await page.keyboard.press('Escape');await ask.waitFor({state:'detached'});
 assert.equal(await tabs().count(),2);assert.equal(await dirtyDot('Gamma').count(),1);
 await page.locator('.api-tab',{hasText:'Gamma'}).locator('.api-tab-close').click();
 await ask.getByRole('button',{name:'Cancel'}).click();await ask.waitFor({state:'detached'});assert.equal(await tabs().count(),2);
 await page.locator('.api-tab',{hasText:'Gamma'}).locator('.api-tab-close').click();
 await ask.getByRole('button',{name:"Don't save"}).click();
 await page.locator('.api-tab',{hasText:'Gamma'}).waitFor({state:'detached'});assert.equal(await gammaUrl(),'{{host}}/slow'); // descartado

 // o botão Salvar e o Ctrl+S gravam, e o ponto some
 await open('Gamma');await page.locator('.api-url').fill('{{host}}/slow?v=2');
 const put=()=>page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('gamma.bru'));
 let wait=put();await page.locator('.api-save-btn').click();assert.equal((await wait).status(),200);
 assert.equal(await gammaUrl(),'{{host}}/slow?v=2');assert.equal(await dirtyDot('Gamma').count(),0);
 await page.waitForFunction(()=>/^\s*Saved/i.test(document.querySelector('.api-save').textContent));assert.equal(await page.locator('.api-save-btn').isDisabled(),true);
 await page.locator('.api-url').fill('{{host}}/slow?v=3');wait=put();
 await page.locator('.api-tab',{hasText:'Gamma'}).locator('.api-tab-main').focus();await page.keyboard.press('Control+s'); // o Ctrl+S vale com o foco em qualquer lugar do painel
 assert.equal((await wait).status(),200);assert.equal(await gammaUrl(),'{{host}}/slow?v=3');
 // fechar e escolher Salvar grava e fecha
 await page.locator('.api-url').fill('{{host}}/slow?v=4');wait=put();
 await page.locator('.api-tab',{hasText:'Gamma'}).locator('.api-tab-main').focus();await page.keyboard.press('Delete');
 await ask.waitFor();await ask.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await wait).status(),200);
 await page.locator('.api-tab',{hasText:'Gamma'}).waitFor({state:'detached'});assert.equal(await gammaUrl(),'{{host}}/slow?v=4');

 // trocar de coleção com várias abas alteradas pergunta uma vez só
 await open('Gamma');await page.locator('.api-url').fill('{{host}}/slow?g=1');await go('Alpha');await page.locator('.api-url').fill('{{host}}/a?x=1');
 const collSel=page.locator('#api-panel select[aria-label="Collection"]');
 await collSel.selectOption('zeta');
 await ask.waitFor();assert.match(await ask.textContent(),/2 requests have changes that were not saved/);assert.equal(await ask.getByRole('button',{name:'Save all'}).count(),1);
 await ask.getByRole('button',{name:'Cancel'}).click();await ask.waitFor({state:'detached'});
 assert.equal(await collSel.inputValue(),'tabs'); // continua na coleção de antes
 assert.equal(await tabs().count(),2);
 await page.locator('.api-row',{hasText:'Alpha'}).first().hover();
 page.once('dialog',d=>d.accept('Alpha renamed')); // renomear uma request com alterações também pergunta
 await page.locator('.api-row',{hasText:'Alpha'}).first().locator('button[aria-label^="Rename"]').click();
 await ask.waitFor();await ask.getByRole('button',{name:'Cancel'}).click();await ask.waitFor({state:'detached'});
 assert.equal((await call('GET','/collections/tabs')).tree.some(i=>i.name==='Alpha'),true); // nada foi renomeado
 // recarregar a página com alterações abertas avisa
 const unload=page.waitForEvent('dialog');
 await page.evaluate(()=>{setTimeout(()=>location.reload(),0);});
 const bu=await unload;assert.equal(bu.type(),'beforeunload');await bu.dismiss();
 await collSel.selectOption('zeta');await ask.getByRole('button',{name:'Save all'}).click(); // salvar tudo e trocar
 await ask.waitFor({state:'detached'});await page.locator('.api-tab').first().waitFor({state:'detached'}); // salvou tudo e trocou (a coleção nova não tem abas)
 assert.equal(await gammaUrl(),'{{host}}/slow?g=1');assert.equal(await urlOf('alpha.bru'),'{{host}}/a?x=1');
 await collSel.selectOption('tabs');
 await page.waitForFunction(()=>document.querySelector('#api-panel select[aria-label="Collection"]').value==='tabs');

 assert.deepEqual(errors,[]);
 console.log('PASS TAB-01..12 request tabs, split layout, quick open, list width and manual save');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
