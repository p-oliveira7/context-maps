// Desenhos nos cards (Excalidraw): criar pelo menu do card, salvar a cena e a miniatura, ver um fluxo da skill
// e destacar o caminho até um quadro clicado.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
import {parseFlow,flowToScene,flowToSvg} from '../skills/context-maps/scripts/flow.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-dw-'));
const port=4205,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),COLLECTIONS_DIR:path.join(work,'collections'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const FLOW=['# Criar pedido','client: App cliente','auth: Token válido? [diamond]','e401: 401 [ellipse]','etag: If-Match? [diamond]','e412: 412 [ellipse]','ok: 201 [ellipse]',
 'client -> auth','auth -> e401: não','auth -> etag: sim','etag -> e412: não','etag -> ok: sim',''].join('\n');
const browser=await launch();
try{
 const made=await call('POST','/presentations',{title:'Desenhos'});
 const flow=parseFlow(FLOW);
 const up=await fetch(`${base}/api/presentations/${made.id}/assets?name=flow.svg`,{method:'POST',headers:{'x-context-maps':'1'},body:flowToSvg(flow)});const {src}=await up.json();
 await call('PUT',`/presentations/${made.id}`,{title:'Desenhos',roots:[{id:'r',title:'Sistema',children:[
  {id:'c1',title:'Rascunho',children:[]},
  {id:'c2',title:'Pedido',children:[],images:[{src,alt:'Fluxo',kind:'drawing',title:'Criar pedido',scene:flowToScene(flow),source:FLOW}]}]}]});
 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?30000:15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?p=${made.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();
 await page.locator('#edit-switch').click();await page.locator('#fit').click();
 const card=async id=>(JSON.parse(await readFile(path.join(work,'presentations',`${made.id}.json`),'utf8')).roots[0].children.find(c=>c.id===id));
 const panel=page.locator('.dw-viewer');

 // DRAW-01: o menu do card tem "Drawing"; abre a janela lateral já editando, com o Excalidraw
 await page.locator('[data-id="c1"]').hover();await page.locator('[data-id="c1"] .edit-fab').click();
 await page.locator('#radial-menu [aria-label^="Add a drawing"]').click();
 await panel.waitFor();await panel.locator('canvas').first().waitFor();
 assert.equal(await panel.evaluate(e=>e.classList.contains('is-editing')),true);
 assert.equal((await panel.locator('.oa-head strong').textContent()).trim(),'Rascunho');

 // DRAW-02: desenhar um retângulo salva a cena no card (com miniatura SVG)
 const box=await panel.locator('.dw-host').boundingBox();
 await panel.locator('.dw-host canvas').last().click({position:{x:40,y:200}});
 await page.keyboard.press('r');
 await page.mouse.move(box.x+box.width*.3,box.y+box.height*.35);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.55,{steps:8});await page.mouse.up();
 for(let i=0;i<80&&!(await card('c1')).images?.[0]?.src;i++)await new Promise(r=>setTimeout(r,100));
 const drawn=(await card('c1')).images[0];
 assert.equal(drawn.kind,'drawing');assert.match(drawn.src,/\.svg$/);
 assert.equal(drawn.scene.elements.filter(e=>e.type==='rectangle').length,1);
 // Esc dentro do desenho é do Excalidraw (não fecha a janela); o × fecha e a miniatura nova vai para o card
 await page.keyboard.press('Escape');assert.equal(await panel.count(),1);
 await panel.locator('.oa-close').click();await panel.waitFor({state:'detached'});
 await page.locator('[data-id="c1"] .image-button.is-drawing').waitFor();
 assert.match(await (await fetch(`${base}/${(await card('c1')).images[0].src}`)).text(),/<svg/);

 // DRAW-03: fora do modo de edição, o desenho abre só para ver; clicar no 412 acende o caminho até ele
 await page.locator('#edit-switch').click();
 await page.locator('[data-id="c2"] .image-button.is-drawing').click();
 await panel.locator('canvas').first().waitFor();
 assert.equal(await panel.evaluate(e=>e.classList.contains('is-editing')),false);
 await page.waitForFunction(()=>document.querySelector('.dw-viewer')?.drawingApi?.()?.getSceneElements().length>0);
 await page.waitForTimeout(300); // o desenho é enquadrado logo depois de abrir
 const at=flowId=>page.evaluate(id=>{const api=document.querySelector('.dw-viewer').drawingApi(),st=api.getAppState(),e=api.getSceneElements().find(x=>x.customData?.flowId===id);const z=st.zoom.value;return {x:(e.x+e.width/2+st.scrollX)*z+st.offsetLeft,y:(e.y+e.height/2+st.scrollY)*z+st.offsetTop};},flowId);
 const p412=await at('e412');await page.mouse.click(p412.x,p412.y);
 await page.waitForFunction(()=>document.querySelectorAll('.dw-layer .dw-hl-node').length===4,null,{timeout:5000});
 assert.equal(await panel.locator('.dw-layer .dw-hl-arrow').count(),3);
 // o destaque não sai da janela do desenho (com zoom, parte do caminho fica fora dela)
 assert.deepEqual(await panel.evaluate(p=>[getComputedStyle(p.querySelector('.dw-host')).overflow,getComputedStyle(p.querySelector('.dw-layer')).overflow]),['hidden','hidden']);
 const opacity=id=>page.evaluate(i=>document.querySelector('.dw-viewer').drawingApi().getSceneElements().find(x=>x.customData?.flowId===i).opacity,id);
 assert.equal(await opacity('ok'),18);assert.equal(await opacity('client'),100);
 // clicar de novo no mesmo quadro limpa
 await page.mouse.click(p412.x,p412.y);
 await page.waitForFunction(()=>!document.querySelector('.dw-layer').children.length);
 assert.equal(await opacity('ok'),100);
 // outro fim: o 201 acende o caminho dele
 const p201=await at('ok');await page.mouse.click(p201.x,p201.y);
 await page.waitForFunction(()=>document.querySelectorAll('.dw-layer .dw-hl-node').length===4);
 assert.equal(await opacity('e412'),18);
 // DRAW-04: "Edit" na janela troca para edição e limpa o destaque; nada muda na cena salva
 await panel.locator('.dw-toggle').click();
 assert.equal(await panel.evaluate(e=>e.classList.contains('is-editing')),true);
 assert.equal(await panel.locator('.dw-layer').evaluate(e=>e.children.length),0);
 assert.equal(await opacity('e412'),100);
 await panel.locator('.oa-close').click();await panel.waitFor({state:'detached'});
 assert.equal((await card('c2')).images[0].src,src,'sem mudanças, a miniatura fica a mesma');

 // DRAW-05: ◎ Destaque — velocidade, cor e ligar/desligar ficam no desenho; no modo de edição, o quadro selecionado vira "fim clicável" com cor própria
 await page.locator('[data-id="c2"] .image-button.is-drawing').click();await panel.locator('canvas').first().waitFor();
 await page.waitForFunction(()=>document.querySelector('.dw-viewer')?.drawingApi?.()?.getSceneElements().length>0);await page.waitForTimeout(300);
 await panel.locator('.dw-gear').click();await panel.locator('.dw-settings').waitFor();
 await panel.locator('.dw-settings select').selectOption('instant');
 await panel.locator('.dw-settings input[type=color]').evaluate(e=>{e.value='#ff0000';e.dispatchEvent(new Event('input',{bubbles:true}));});
 for(let i=0;i<40&&(await card('c2')).images[0].highlight?.color!=='#ff0000';i++)await new Promise(r=>setTimeout(r,100));
 assert.deepEqual((await card('c2')).images[0].highlight,{enabled:true,speed:'instant',color:'#ff0000'});
 let q=await at('e412');await page.mouse.click(q.x,q.y);
 assert.equal(await panel.locator('.dw-layer .dw-hl-node').count(),4,'instantâneo: tudo de uma vez');
 assert.equal(await panel.locator('.dw-layer').evaluate(e=>e.style.getPropertyValue('--hl')),'#ff0000');
 await panel.locator('.dw-settings input[type=checkbox]').uncheck();
 assert.equal(await panel.locator('.dw-layer').evaluate(e=>e.children.length),0);
 q=await at('e412');await page.mouse.click(q.x,q.y);await page.waitForTimeout(200);
 assert.equal(await panel.locator('.dw-layer').evaluate(e=>e.children.length),0,'desligado: o clique não acende');
 assert.match(await panel.locator('.dw-hint').textContent(),/off/);
 await panel.locator('.dw-settings input[type=checkbox]').check();
 // marcar o 412 como fim clicável (com cor verde) no modo de edição
 await panel.locator('.dw-toggle').click();
 q=await at('e412');await page.mouse.click(q.x,q.y);
 const boxbar=panel.locator('.dw-boxbar');await boxbar.waitFor();
 await boxbar.locator('input[type=checkbox]').check();
 await boxbar.locator('input[type=color]').evaluate(e=>{e.value='#00ff00';e.dispatchEvent(new Event('input',{bubbles:true}));});
 const custom=id=>page.evaluate(i=>document.querySelector('.dw-viewer').drawingApi().getSceneElements().find(x=>x.customData?.flowId===i).customData,id);
 assert.deepEqual(await custom('e412'),{flowId:'e412',cmEnd:true,cmColor:'#00ff00'});
 await panel.locator('.dw-toggle').click(); // ✓ Concluir: volta a ver
 assert.match(await panel.locator('.dw-hint').textContent(),/marked ends/);
 q=await at('auth');await page.mouse.click(q.x,q.y);await page.waitForTimeout(200);
 assert.equal(await panel.locator('.dw-layer').evaluate(e=>e.children.length),0,'quadro que não é fim não acende');
 q=await at('e412');await page.mouse.click(q.x,q.y);
 await page.waitForFunction(()=>document.querySelectorAll('.dw-layer .dw-hl-node').length===4);
 assert.equal(await panel.locator('.dw-layer').evaluate(e=>e.style.getPropertyValue('--hl')),'#00ff00','a cor do fim vale mais que a do desenho');
 await panel.locator('.oa-close').click();await panel.waitFor({state:'detached'});
 for(let i=0;i<40&&!(await card('c2')).images[0].scene.elements.find(e=>e.customData?.flowId==='e412').customData.cmEnd;i++)await new Promise(r=>setTimeout(r,100));
 assert.equal((await card('c2')).images[0].scene.elements.find(e=>e.customData?.flowId==='e412').customData.cmColor,'#00ff00');

 assert.deepEqual(errors,[]);
 console.log('PASS DRAW-01..05 drawings on cards: create, save with thumbnail, view a skill flow, highlight the path to a box, highlight settings and clickable ends');
}finally{await browser.close();server.kill();await rm(work,{recursive:true,force:true});}
