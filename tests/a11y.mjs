// Acessibilidade e toque: semântica de árvore, teclado, nomes acessíveis, foco nas janelas e zoom com dois dedos.
import assert from 'node:assert/strict';
import {launch} from './launch.mjs';
const url=process.env.PREVIEW_URL||'http://127.0.0.1:4173';
const browser=await launch();
try{
 const page=await browser.newPage({locale:'pt-BR',viewport:{width:1280,height:720}});
 page.setDefaultTimeout(process.env.CI?15000:5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.node').first().waitFor();
 const active=()=>page.evaluate(()=>document.activeElement?.closest?.('.node')?.dataset.id||document.activeElement?.id||document.activeElement?.tagName);
 const count=()=>page.locator('.node').count();

 // A11Y-01: semântica de árvore (role, nível, expandido)
 assert.equal(await page.locator('#nodes').getAttribute('role'),'tree');
 assert.ok((await page.locator('#nodes').getAttribute('aria-label')).length>0);
 const root=page.locator('[data-id="root"]'),mobility=page.locator('[data-id="mobility"]');
 assert.equal(await root.getAttribute('role'),'treeitem');assert.equal(await root.getAttribute('aria-level'),'1');assert.equal(await root.getAttribute('aria-expanded'),'true');
 assert.equal(await mobility.getAttribute('aria-level'),'2');assert.equal(await mobility.getAttribute('aria-expanded'),'false');

 // A11Y-02: setas percorrem a árvore (→ entra/abre, ← recolhe/sobe, ↑ ↓ entre irmãos)
 await page.locator('[data-id="root"] .node-title').focus();
 await page.keyboard.press('ArrowRight');assert.equal(await active(),'mobility');
 await page.keyboard.press('ArrowDown');assert.equal(await active(),'nature');
 await page.keyboard.press('ArrowUp');assert.equal(await active(),'mobility');
 assert.equal(await count(),5);
 await page.keyboard.press('ArrowRight');await page.waitForTimeout(500);assert.equal(await count(),8); // abriu o ramo
 assert.equal(await active(),'mobility');
 await page.keyboard.press('ArrowRight');assert.equal(await active(),'mobility-1'); // entrou na primeira filha (folha com foco)
 await page.keyboard.press('ArrowDown');assert.equal(await active(),'mobility-2');
 await page.keyboard.press('ArrowLeft');assert.equal(await active(),'mobility'); // folha: sobe para o pai
 await page.keyboard.press('ArrowLeft');await page.waitForTimeout(500);assert.equal(await count(),5); // pai aberto: recolhe
 await page.keyboard.press('ArrowLeft');assert.equal(await active(),'root'); // recolhido: sobe

 // A11Y-03: todo controle visível tem nome acessível
 const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,input:not([type=hidden]),select,textarea,[role=button],[role=menuitem]')]
  .filter(el=>!el.hidden&&!el.closest('[hidden]'))
  .filter(el=>!(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.title||el.textContent.trim()||el.labels?.length||el.placeholder))
  .map(el=>el.id||el.className||el.tagName));
 assert.deepEqual(unnamed,[]);

 // A11Y-04: a busca anuncia o resultado para leitores de tela
 await page.evaluate(()=>document.activeElement?.blur());
 await page.keyboard.press('Control+k');await page.keyboard.type('natureza');
 await page.waitForFunction(()=>document.querySelector('#sr-status').textContent.trim().length>0);
 assert.match(await page.locator('#sr-status').textContent(),/resultado/);
 await page.keyboard.press('Escape');

 // A11Y-05: o foco fica preso dentro da janela "Salvar como" e Esc devolve o foco
 await page.locator('#doc-button').click();await page.locator('#doc-saveas').click();await page.locator('#saveas-modal').waitFor();
 for(let i=0;i<14;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#saveas-modal')),true,`Tab ${i+1} saiu da janela`);}
 for(let i=0;i<14;i++){await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#saveas-modal')),true,`Shift+Tab ${i+1} saiu da janela`);}
 await page.keyboard.press('Escape');await page.locator('#saveas-modal').waitFor({state:'hidden'});

 // A11Y-06: roda de ações pelo teclado (foco entra, setas navegam, Esc volta ao botão)
 await page.locator('#edit-switch').click();
 await page.locator('#fit').click();
 const card=page.locator('[data-id="root"]');await card.hover();await card.locator('.edit-fab').click();
 await page.waitForFunction(()=>document.activeElement?.classList.contains('radial-item'));
 const first=await page.evaluate(()=>document.activeElement.getAttribute('aria-label'));
 await page.keyboard.press('ArrowRight');
 assert.notEqual(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),first);
 await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),first);
 await page.keyboard.press('Escape');await page.locator('#radial-menu').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('edit-fab')),true);
 await page.locator('#edit-switch').click();

 // A11Y-07: zoom com dois dedos (pinça) — também pan com dois dedos
 const touch=await browser.newContext({locale:'pt-BR',viewport:{width:900,height:700},hasTouch:true});
 const tp=await touch.newPage();await tp.goto(url);await tp.locator('.node').first().waitFor();
 const cdp=await touch.newCDPSession(tp);
 const level=async()=>parseInt(await tp.locator('#zoom-level').textContent(),10);
 const before=await level();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:400,y:350,id:1},{x:500,y:350,id:2}]});
 for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:400-step*15,y:350,id:1},{x:500+step*15,y:350,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const afterOut=await level();
 assert.ok(afterOut>before,`pinça para fora deveria aproximar (${before}% -> ${afterOut}%)`);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:250,y:350,id:1},{x:650,y:350,id:2}]});
 for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:250+step*30,y:350,id:1},{x:650-step*30,y:350,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(await level()<afterOut,'pinça para dentro deveria afastar');
 assert.equal(await tp.locator('.node').count(),5); // nada abriu nem fechou
 await touch.close();

 assert.deepEqual(errors,[]);
 console.log('PASS A11Y-01..07 accessibility and touch');
}finally{await browser.close();}
