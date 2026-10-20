// Diagramas de sequência próprios no editor de diagramas: modelo inicial, desenho nativo, erros com a linha, queda para o Mermaid e persistência.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-seq-'));
const port=4200,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const browser=await launch();
try{
 const made=await call('POST','/presentations',{title:'Sequências'});
 await call('PUT',`/presentations/${made.id}`,{title:'Sequências',roots:[{id:'r',title:'Sistema',children:[{id:'c1',title:'Pedidos',children:[]}]}]});
 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1400,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?20000:8000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?p=${made.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();
 await page.locator('#edit-switch').click();
 const modal=page.locator('#diagram-editor'),preview=page.locator('#diagram-preview img'),errorBox=page.locator('#diagram-error');
 const previewSvg=()=>page.evaluate(()=>decodeURIComponent(document.querySelector('#diagram-preview img')?.src.replace(/^data:image\/svg\+xml;charset=utf-8,/,'')||''));
 const type=text=>page.locator('#diagram-source').fill(text);
 const saved=async()=>JSON.parse(await readFile(path.join(work,'presentations',`${made.id}.json`),'utf8')).roots[0].children[0];
 const openEditor=async()=>{
  await page.locator('#fit').click();const card=page.locator('[data-id="c1"]');await card.hover();await card.locator('.edit-fab').click();
  await page.locator('#radial-menu.open .radial-center').waitFor();await page.locator('#radial-menu [aria-label^="Add diagram"]').click();await modal.waitFor();
 };

 // SEQ-01: diagrama novo: modelo inicial (fluxograma) e a opção de começar por um diagrama de sequência
 await openEditor();
 assert.equal(await page.locator('#diagram-template').isVisible(),true);
 assert.deepEqual(await page.locator('#diagram-template option').allTextContents(),['Flowchart','Sequence diagram']);
 assert.equal(await page.locator('#diagram-template').getAttribute('aria-label'),'Start from');
 await page.locator('#diagram-template').selectOption('seq');
 assert.match(await page.locator('#diagram-source').inputValue(),/^sequenceDiagram\n/);
 await preview.waitFor();
 let svg=await previewSvg();
 assert.match(svg,/class="seq-step seq-msg"/);assert.match(svg,/data-step=/); // desenho próprio: cada seta é endereçável
 assert.equal((svg.match(/class="seq-step seq-msg"/g)||[]).length,5);
 assert.match(svg,/<title>Place order<\/title>/);assert.match(svg,/1\. POST \/orders/);
 assert.equal(await page.locator('#diagram-engine').textContent(),'Sequence diagram engine');
 assert.equal(await page.locator('#diagram-apply').isEnabled(),true);

 // SEQ-02: escrever e ver na hora; erros dizem a linha e o motivo
 await type('sequenceDiagram\n  actor A\n  participant B as Backend\n  A->>B: hello\n  B-->>A: world');
 await page.waitForFunction(()=>decodeURIComponent(document.querySelector('#diagram-preview img').src).includes('world'));
 await type('sequenceDiagram\n  A->>B: ok\n  A->>B no colon here');
 await errorBox.filter({hasText:'Line 3: A message needs a colon'}).waitFor();assert.equal(await page.locator('#diagram-apply').isDisabled(),true);
 await type('sequenceDiagram\n  loop forever\n  A->>B: x');
 await errorBox.filter({hasText:'Line 2: This block is never closed'}).waitFor();
 await type('sequenceDiagram\n  A->>B: x\n  end');
 await errorBox.filter({hasText:'Line 3: “end” without an open block'}).waitFor();
 await type('sequenceDiagram\n  A->>B: <b>bold</b> & "quoted"');
 await page.waitForFunction(()=>decodeURIComponent(document.querySelector('#diagram-preview img').src).includes('&lt;b&gt;bold&lt;/b&gt;'));
 assert.equal(await errorBox.textContent(),'');

 // SEQ-03: o que o motor próprio não conhece cai no Mermaid (e continua funcionando)
 await type('sequenceDiagram\n  participant A\n  participant B\n  box Aqua Group\n  participant C\n  end\n  A->>B: hi');
 await page.waitForFunction(()=>document.querySelector('#diagram-engine').textContent==='Mermaid',null,{timeout:30000});
 await page.waitForFunction(()=>!decodeURIComponent(document.querySelector('#diagram-preview img').src).includes('seq-step'));
 assert.equal(await page.locator('#diagram-apply').isEnabled(),true);
 await type('flowchart LR\n  X[Start] --> Y[End]');
 await page.waitForFunction(()=>document.querySelector('#diagram-engine').textContent==='Mermaid'&&decodeURIComponent(document.querySelector('#diagram-preview img').src).includes('Start'),null,{timeout:30000});

 // SEQ-04: aplicar guarda o texto, o SVG e o motor; reabrir devolve o texto e volta a desenhar
 const SRC='sequenceDiagram\n  title Checkout\n  actor U as User\n  participant API\n  participant Pay\n  U->>API: POST /checkout\n  API->>+Pay: charge\n  Pay-->>-API: 402 declined\n  alt ok\n    API-->>U: 201\n  else declined\n    API-->>U: 402\n  end\n  Note right of U: shows the error';
 await type(SRC);await page.waitForFunction(()=>document.querySelector('#diagram-engine').textContent==='Sequence diagram engine');
 await page.locator('#diagram-apply:enabled').click();await modal.waitFor({state:'hidden'});
 for(let i=0;i<60&&!(await saved()).images?.length;i++)await new Promise(r=>setTimeout(r,100));
 const entry=(await saved()).images[0];
 assert.deepEqual([entry.kind,entry.engine,entry.source],['diagram','sequence',SRC]);assert.match(entry.src,/\.svg$/);
 const asset=await (await page.request.get(`${base}/${entry.src}`)).text();
 assert.match(asset,/<svg[^>]+role="img"/);assert.equal((asset.match(/class="seq-step seq-msg"/g)||[]).length,5);assert.match(asset,/<title>Checkout<\/title>/);
 assert.equal(await page.locator('[data-id="c1"] .image-button.is-diagram img').count(),1);
 await page.locator('[data-id="c1"] [aria-label^="Edit diagram"]').click();await modal.waitFor();
 assert.equal(await page.locator('#diagram-source').inputValue(),SRC);
 assert.equal(await page.locator('#diagram-template').isHidden(),true); // editar não oferece modelos
 await page.waitForFunction(()=>document.querySelector('#diagram-engine').textContent==='Sequence diagram engine');
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});

 // SEQ-05: o HTML exportado leva o desenho (sem servidor) e o modo texto continua listando
 const html=await (await page.request.get(`${base}/api/presentations/${made.id}/export?format=html`)).text();
 assert.match(html,/seq-step/);assert.equal(html.includes('"engine":"sequence"'),true);

 // SEQ-06: acessibilidade da janela e em português
 await openEditor();
 assert.equal(await modal.getAttribute('aria-modal'),'true');
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
 const pt=await browser.newContext({locale:'pt-BR',viewport:{width:1400,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const p2=await pt.newPage();p2.setDefaultTimeout(process.env.CI?20000:8000);
 await p2.goto(`${base}/?p=${made.id}`);await p2.locator('.node').first().waitFor();await p2.locator('#expand').click();await p2.locator('#edit-switch').click();
 await p2.locator('#fit').click();await p2.locator('[data-id="c1"]').hover();await p2.locator('[data-id="c1"] .edit-fab').click();
 await p2.locator('#radial-menu.open .radial-center').waitFor();await p2.locator('#radial-menu [aria-label^="Adicionar diagrama"]').click();await p2.locator('#diagram-editor').waitFor();
 assert.deepEqual(await p2.locator('#diagram-template option').allTextContents(),['Fluxograma','Diagrama de sequência']);
 await p2.locator('#diagram-template').selectOption('seq');
 await p2.waitForFunction(()=>decodeURIComponent(document.querySelector('#diagram-preview img')?.src||'').includes('Fazer pedido'));
 await p2.locator('#diagram-source').fill('sequenceDiagram\n  A->>B sem dois-pontos');
 await p2.locator('#diagram-error').filter({hasText:'Linha 2: Uma mensagem precisa de dois-pontos'}).waitFor();

 assert.deepEqual(errors,[]);
 console.log('PASS SEQ-01..06 native sequence diagrams');
}finally{await browser.close();server.kill();await rm(work,{recursive:true,force:true});}
