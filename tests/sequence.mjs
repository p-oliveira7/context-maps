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

 // SEQ-07: editor visual: listas, seleção, inspetor, desfazer/refazer, participantes e mensagens novas
 await openEditor();
 await page.locator('#diagram-template').selectOption('seq');
 await page.locator('#diagram-visual').waitFor({state:'visible'});
 const vb=await page.locator('#diagram-visual').evaluate(e=>({w:e.offsetWidth,h:e.offsetHeight,fits:e.scrollWidth<=e.clientWidth+1}));
 assert.ok(vb.w>80&&vb.h<40&&vb.fits,`o botão Edit visually cabe o texto (${JSON.stringify(vb)})`);
 await page.locator('#diagram-visual').click();
 const ed=page.locator('.seq-ed');await ed.waitFor();
 assert.equal(await ed.getAttribute('role'),'dialog');assert.equal(await ed.getAttribute('aria-modal'),'true');
 assert.equal(await page.locator('#seq-ed-title').textContent(),'Sequence diagram editor');
 const partNames=()=>page.locator('.seq-ed-left ul[aria-label="Participants"] .seq-row-text').allTextContents();
 const stepRows=()=>page.locator('.seq-steps .seq-step-row .seq-row-text').allTextContents();
 const sv=()=>page.locator('.seq-svg-host svg');
 const labels=()=>page.locator('.seq-svg-host .seq-label').allTextContents();
 assert.deepEqual(await partNames(),['Client','Orders API','Payments']);
 assert.equal((await stepRows()).length,9);assert.equal((await stepRows())[0],'Client → Orders API: POST /orders');
 assert.equal(await sv().getAttribute('aria-hidden'),'true'); // o desenho é decorativo: a lista e o inspetor são o conteúdo acessível
 // selecionar pela lista: inspetor + contorno no desenho
 await page.locator('.seq-steps .seq-step-row').first().locator('button').click();
 assert.equal(await page.locator('.seq-inspector h3').textContent(),'Message');
 assert.equal(await page.locator('.seq-inspector input[aria-label="Label"]').inputValue(),'POST /orders');
 assert.equal(await page.locator('.seq-svg-host .seq-sel').count(),1);
 assert.equal(await page.locator('.seq-steps .seq-step-row.is-sel').count(),1);
 // editar no inspetor
 const status=page.locator('.seq-ed-status');
 await page.locator('.seq-inspector input[aria-label="Label"]').fill('POST /v2/orders');await page.keyboard.press('Enter');
 assert.match((await labels())[0],/POST \/v2\/orders/);assert.equal((await stepRows())[0],'Client → Orders API: POST /v2/orders');
 await page.locator('.seq-inspector select[aria-label="Line"]').selectOption('dashed');
 assert.equal(await page.locator('.seq-svg-host .seq-msg').first().locator('.seq-dashed').count(),1);
 await page.locator('.seq-inspector select[aria-label="To"]').selectOption('Pay');
 assert.equal((await stepRows())[0],'Client ⇢ Payments: POST /v2/orders');
 // desfazer e refazer (botões e teclado)
 const undoBtn=ed.getByRole('button',{name:'Undo',exact:true}),redoBtn=ed.getByRole('button',{name:'Redo',exact:true});
 assert.equal(await undoBtn.isEnabled(),true);assert.equal(await redoBtn.isDisabled(),true);
 await undoBtn.click();assert.equal((await stepRows())[0],'Client ⇢ Orders API: POST /v2/orders');await page.waitForFunction(()=>/Undone/.test(document.querySelector('.seq-ed-status').textContent));
 await undoBtn.click();await undoBtn.click();assert.equal((await stepRows())[0],'Client → Orders API: POST /orders');assert.equal(await undoBtn.isDisabled(),true);
 await redoBtn.click();assert.equal((await stepRows())[0],'Client → Orders API: POST /v2/orders');
 await page.locator('.seq-stage').focus();await page.keyboard.press('ControlOrMeta+z');assert.equal((await stepRows())[0],'Client → Orders API: POST /orders');
 await page.keyboard.press('ControlOrMeta+y');assert.equal((await stepRows())[0],'Client → Orders API: POST /v2/orders');
 // novo participante
 await ed.getByRole('button',{name:'+ Add participant'}).click();
 assert.deepEqual(await partNames(),['Client','Orders API','Payments','Participant 4']);
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Name'); // o foco vai para o nome
 await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type('Shipping');await page.keyboard.press('Enter');
 assert.deepEqual(await partNames(),['Client','Orders API','Payments','Shipping']);
 assert.equal(await page.locator('.seq-svg-host .seq-actor[data-actor="P"]').count(),1); // o id não muda ao renomear
 await page.locator('.seq-inspector select[aria-label="Type"]').selectOption('actor');
 // nova mensagem a partir do participante selecionado
 await ed.getByRole('button',{name:'+ Message',exact:true}).click();
 assert.equal((await stepRows()).length,10);assert.match((await stepRows()).at(-1),/^Shipping → .*: message$/);
 await page.locator('.seq-inspector input[aria-label="Label"]').fill('ship it');await page.keyboard.press('Enter');
 assert.match((await labels()).at(-1),/ship it/);

 // SEQ-08: arrastar entre linhas de vida, duplo clique, mover, apagar
 const box=async sel=>(await page.locator(sel).boundingBox());
 const m1=await box('.seq-svg-host .seq-msg[data-step="1"]'),m2=await box('.seq-svg-host .seq-msg[data-step="2"]');
 const hit0=await box('.seq-svg-host .seq-hit[data-hit="0"]'),hit1=await box('.seq-svg-host .seq-hit[data-hit="1"]');
 const y=(m1.y+m1.height+m2.y)/2;
 await page.mouse.move(hit0.x+hit0.width/2,y);await page.mouse.down();await page.mouse.move(hit1.x+hit1.width/2,y,{steps:8});await page.mouse.up();
 const inline=page.locator('.seq-inline');await inline.waitFor({state:'visible'});
 await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type('dragged');await page.keyboard.press('Enter');await inline.waitFor({state:'hidden'});
 const rows=await stepRows();assert.equal(rows.length,11);assert.equal(rows[2],'Client → Orders API: dragged'); // entrou onde se soltou
 // duplo clique no rótulo
 await page.locator('.seq-svg-host .seq-msg[data-step="2"] .seq-label').dblclick();
 await inline.waitFor({state:'visible'});assert.equal(await inline.inputValue(),'dragged');
 await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type('renamed');await page.keyboard.press('Enter');
 assert.equal((await stepRows())[2],'Client → Orders API: renamed');
 await page.locator('.seq-svg-host .seq-msg[data-step="2"] .seq-label').dblclick();await page.keyboard.press('Escape');await inline.waitFor({state:'hidden'});
 assert.equal((await stepRows())[2],'Client → Orders API: renamed'); // Esc cancela só o campo
 assert.equal(await ed.isVisible(),true);
 // mover: botões do inspetor e Alt+setas no canvas
 await page.locator('.seq-steps .seq-step-row').nth(2).locator('button').click();
 await ed.getByRole('button',{name:'Move step down'}).click();assert.equal((await stepRows())[3],'Client → Orders API: renamed');
 await page.locator('.seq-stage').focus();await page.keyboard.press('Alt+ArrowUp');assert.equal((await stepRows())[2],'Client → Orders API: renamed');
 // setas selecionam, Delete apaga (e desfazer devolve)
 await page.keyboard.press('ArrowDown');assert.equal(await page.locator('.seq-steps .seq-step-row.is-sel .seq-num').textContent(),'4');
 const before=(await stepRows()).length;await page.keyboard.press('Delete');assert.equal((await stepRows()).length,before-1);
 await page.keyboard.press('ControlOrMeta+z');assert.equal((await stepRows()).length,before);

 // SEQ-09: blocos, notas, vista em texto, cancelar e aplicar
 await page.locator('.seq-stage').focus();await page.keyboard.press('Escape'); // sem seleção, o bloco entra no fim
 await ed.getByRole('button',{name:'+ Block',exact:true}).click();
 assert.equal(await page.locator('.seq-inspector h3').textContent(),'Block');
 const stepsNow=(await stepRows()).length;assert.match((await stepRows()).at(-3),/^loop/);
 await page.locator('.seq-inspector select[aria-label="Type"]').selectOption('alt');
 await page.locator('.seq-inspector input[aria-label="Condition"]').fill('in stock');await page.keyboard.press('Enter');
 assert.match((await stepRows()).at(-3),/^alt \[in stock\]/);assert.equal(await page.locator('.seq-svg-host .seq-group').count()>=2,true);
 await ed.getByRole('button',{name:'Add else branch'}).click();
 assert.equal((await stepRows()).at(-2),'else');assert.equal(await page.locator('.seq-inspector h3').textContent(),'Branch');
 await page.locator('.seq-steps .seq-step-row').nth(stepsNow-3).locator('button').click(); // o bloco
 await page.locator('.seq-stage').focus();await page.keyboard.press('Delete');
 const afterDel=await stepRows();assert.equal(afterDel.filter(r=>r==='end').length,afterDel.filter(r=>/^alt/.test(r)).length); // sobraram tantos "end" quanto blocos
 await ed.getByRole('button',{name:'+ Note',exact:true}).click();assert.equal(await page.locator('.seq-inspector h3').textContent(),'Note');
 await page.locator('.seq-inspector textarea').fill('a note');await page.locator('.seq-inspector select[aria-label="Position"]').selectOption('over');
 assert.equal(await page.locator('.seq-svg-host .seq-note').count()>=2,true);
 // vista em texto
 await ed.getByRole('tab',{name:'Text'}).click();
 const ta=page.locator('.seq-source');assert.equal(await ta.isVisible(),true);assert.match(await ta.inputValue(),/^sequenceDiagram\n/);assert.match(await ta.inputValue(),/ship it/);
 await ta.fill(await ta.inputValue()+'  Client->>Pay: from text\n');
 await ed.getByRole('tab',{name:'Visual'}).click();assert.match((await stepRows()).at(-1),/from text$/);
 await ed.getByRole('tab',{name:'Text'}).click();await ta.fill('sequenceDiagram\n  A->>B no colon');
 await page.locator('.seq-text-error').filter({hasText:'Line 2: A message needs a colon'}).waitFor();
 await ed.getByRole('tab',{name:'Visual'}).click();assert.equal(await ta.isVisible(),true); // não sai com o texto inválido
 await ed.getByRole('button',{name:'Apply',exact:true}).click();assert.equal(await ed.isVisible(),true); // nem aplica
 await ta.fill('sequenceDiagram\n  actor A\n  A->>A: self');await ed.getByRole('tab',{name:'Visual'}).click();
 assert.deepEqual(await stepRows(),['A → A: self']);
 // cancelar com alterações pergunta; aceitar descarta
 let asked=0;page.once('dialog',d=>{asked++;assert.match(d.message(),/Discard your changes/);d.dismiss();});
 await ed.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(asked,1);assert.equal(await ed.isVisible(),true);
 page.once('dialog',d=>d.accept());await ed.getByRole('button',{name:'Cancel',exact:true}).click();await ed.waitFor({state:'hidden'});
 assert.match(await page.locator('#diagram-source').inputValue(),/Orders API/); // o texto original do diagrama ficou como estava
 // aplicar: o texto volta para o editor de diagramas, o desenho atualiza e salva
 await page.locator('#diagram-visual').click();await ed.waitFor();
 await page.locator('.seq-steps .seq-step-row').first().locator('button').click();
 await page.locator('.seq-inspector input[aria-label="Label"]').fill('POST /final');await page.keyboard.press('Enter');
 await ed.getByRole('button',{name:'Apply',exact:true}).click();await ed.waitFor({state:'hidden'});
 assert.match(await page.locator('#diagram-source').inputValue(),/Client->>API: POST \/final/);
 await page.waitForFunction(()=>decodeURIComponent(document.querySelector('#diagram-preview img').src).includes('POST /final'));
 await page.locator('#diagram-apply:enabled').click();await modal.waitFor({state:'hidden'});
 for(let i=0;i<60&&!(await saved()).images?.some(im=>im.source?.includes('POST /final'));i++)await new Promise(r=>setTimeout(r,100));
 assert.equal((await saved()).images.some(im=>im.engine==='sequence'&&im.source.includes('POST /final')),true);
 // Esc: fecha quando nada mudou; foco preso na janela
 await page.locator('[data-id="c1"] [aria-label^="Edit diagram"]').last().click();await modal.waitFor();
 await page.locator('#diagram-visual').click();await ed.waitFor();
 for(let i=0;i<40;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.seq-ed')),true,'o foco fica preso no editor visual');}
 await page.locator('.seq-stage').focus();await page.keyboard.press('Escape');await ed.waitFor({state:'hidden'});
 assert.equal(await modal.isVisible(),true); // o Esc fechou só o editor visual
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});

 // SEQ-06: acessibilidade da janela e em português
 await openEditor();
 assert.equal(await modal.getAttribute('aria-modal'),'true');
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
 // SEQ-10: diagramas largos abrem ajustados à largura; ajustar, Ctrl+roda no cursor, atalhos e arrastar o fundo para rolar
 await openEditor();
 const wide='sequenceDiagram\n'+Array.from({length:9},(_,i)=>`  participant P${i+1} as Serviço número ${i+1}`).join('\n')+'\n'+Array.from({length:8},(_,i)=>`  P${i+1}->>P${i+2}: chamada longa ${i+1}`).join('\n')+'\n';
 await type(wide);await page.waitForFunction(()=>document.querySelector('#diagram-engine').textContent==='Sequence diagram engine');
 await page.locator('#diagram-visual').click();
 const edZ=page.locator('.seq-ed');await edZ.waitFor();
 const zoomNow=async()=>Number((await page.locator('.seq-zoom-label').textContent()).replace('%',''));
 await page.waitForFunction(()=>Number(document.querySelector('.seq-zoom-label').textContent.replace('%',''))<100); // abriu ajustado, sem rolagem horizontal
 const zwidths=await page.evaluate(()=>({svg:document.querySelector('.seq-svg-host svg').getBoundingClientRect().width,stage:document.querySelector('.seq-stage').clientWidth}));
 assert.ok(zwidths.svg<=zwidths.stage,`o desenho cabe na janela (${JSON.stringify(zwidths)})`);
 const zfitted=await zoomNow();
 await edZ.getByRole('button',{name:'Zoom in'}).click();await edZ.getByRole('button',{name:'Zoom in'}).click();
 assert.ok((await zoomNow())>zfitted);
 await edZ.getByRole('button',{name:'Fit to width'}).click();assert.equal(await zoomNow(),zfitted);
 // Ctrl+roda dá zoom (sem rolar a página) e Ctrl+0 / Ctrl+= / Ctrl+- fazem o mesmo pelo teclado
 const zbox=await page.locator('.seq-stage').boundingBox();
 await page.mouse.move(zbox.x+zbox.width/2,zbox.y+zbox.height/2);
 await page.keyboard.down('Control');await page.mouse.wheel(0,-300);await page.keyboard.up('Control');
 await page.waitForFunction(f=>Number(document.querySelector('.seq-zoom-label').textContent.replace('%',''))>f,zfitted);
 await page.keyboard.press('Control+0');assert.equal(await zoomNow(),zfitted);
 await page.keyboard.press('Control+=');assert.ok((await zoomNow())>zfitted);
 await page.keyboard.press('Control+-');assert.equal(await zoomNow(),zfitted);
 // com zoom maior, arrastar o fundo rola o desenho e não limpa/!muda a seleção
 await edZ.getByRole('button',{name:'Zoom in'}).click();await edZ.getByRole('button',{name:'Zoom in'}).click();await edZ.getByRole('button',{name:'Zoom in'}).click();
 const zstage=await page.locator('.seq-stage').boundingBox();
 const scrollBefore=await page.locator('.seq-stage').evaluate(e=>e.scrollLeft);
 await page.mouse.move(zstage.x+zstage.width-14,zstage.y+zstage.height-14);await page.mouse.down();await page.mouse.move(zstage.x+zstage.width-214,zstage.y+zstage.height-14,{steps:6});await page.mouse.up();
 assert.ok((await page.locator('.seq-stage').evaluate(e=>e.scrollLeft))>scrollBefore,'arrastar o fundo rola para a direita');
 page.once('dialog',d=>d.accept());await edZ.getByRole('button',{name:'Cancel',exact:true}).click();await edZ.waitFor({state:'hidden'});
 await page.locator('#diagram-editor .modal-card [aria-label="Close"], #diagram-editor button:has-text("Cancel")').first().click().catch(()=>{});
 // SEQ-11: com o API client aberto, o diagrama aberto fica ao lado dele (sem bloquear) e tem zoom e arrasto; sem o painel continua modal
 await page.goto(`${base}/?p=${made.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();await page.locator('#fit').click();
 const lightbox=page.locator('dialog');
 await page.locator('.image-button.is-diagram').first().click();await lightbox.waitFor();
 assert.equal(await lightbox.evaluate(d=>d.matches(':modal')),true); // sem API client: modal, como sempre
 await page.keyboard.press('Escape');await lightbox.waitFor({state:'hidden'});
 await page.evaluate(()=>document.querySelector('#api-btn').click());await page.locator('#api-panel').waitFor({state:'visible'});
 await page.locator('.image-button.is-diagram').first().click();await lightbox.waitFor();
 assert.equal(await lightbox.evaluate(d=>d.matches(':modal')),false); // com API client: ao lado
 const lbGeo=await page.evaluate(()=>({img:document.querySelector('dialog').getBoundingClientRect().right,panel:document.querySelector('#api-panel').getBoundingClientRect().left}));
 assert.ok(lbGeo.img<=lbGeo.panel+1,`a imagem fica ao lado do painel (${JSON.stringify(lbGeo)})`);
 await page.locator('#api-panel .api-menu-wrap button[aria-haspopup=menu]').first().click(); // o painel segue utilizável com a imagem aberta
 assert.equal(await page.locator('#api-panel .api-menu').first().isVisible(),true);assert.equal(await lightbox.isVisible(),true);
 await page.locator('#api-panel .api-menu-wrap button[aria-haspopup=menu]').first().click();
 // zoom: botões, roda (no cursor), atalhos e reset
 const zoomOf=async()=>Number((await page.locator('.lightbox-zoom-label').textContent()).replace('%',''));
 assert.equal(await zoomOf(),100);
 await page.locator('.lightbox-zoom').getByRole('button',{name:'Zoom in'}).click();assert.equal(await zoomOf(),140);
 const lbBox=await lightbox.boundingBox();
 await page.mouse.move(lbBox.x+lbBox.width/2,lbBox.y+lbBox.height/2);await page.mouse.wheel(0,-400);
 await page.waitForFunction(()=>Number(document.querySelector('.lightbox-zoom-label').textContent.replace('%',''))>140);
 const zoomed=await zoomOf();
 const tf0=await lightbox.locator('img').evaluate(i=>i.style.transform);
 await page.mouse.down();await page.mouse.move(lbBox.x+lbBox.width/2-120,lbBox.y+lbBox.height/2-60,{steps:6});await page.mouse.up(); // arrastar move a imagem e não fecha
 assert.equal(await lightbox.isVisible(),true);assert.notEqual(await lightbox.locator('img').evaluate(i=>i.style.transform),tf0);
 await page.locator('.lightbox-zoom').getByRole('button',{name:'Fit to window'}).click();assert.equal(await zoomOf(),100);assert.equal(await lightbox.locator('img').evaluate(i=>i.style.transform),'');
 await page.locator('.lightbox-zoom').getByRole('button',{name:'Zoom in'}).click();await lightbox.click({position:{x:300,y:300}}); // ampliada: clique não fecha
 assert.equal(await lightbox.isVisible(),true);
 await page.keyboard.press('Escape'); // Esc fecha a imagem ao lado
 await lightbox.waitFor({state:'hidden'});
 assert.ok(zoomed>140);
 await page.evaluate(()=>document.querySelector('#api-btn').click());

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
 console.log('PASS SEQ-01..11 native sequence diagrams and visual editor');
}finally{await browser.close();server.kill();await rm(work,{recursive:true,force:true});}
