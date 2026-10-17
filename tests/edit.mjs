import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(path.join(tmpdir(),'context-maps-'));
const configDir=await mkdtemp(path.join(tmpdir(),'context-maps-config-')),configFile=path.join(configDir,'config.json');
const port=4190, base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:dir,CONTEXT_MAPS_CONFIG:configFile},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const rawDisk=async id=>JSON.parse(await readFile(path.join(dir,`${id}.json`),'utf8'));
const onDisk=async id=>{const raw=await rawDisk(id);return {...raw,tree:raw.roots?.[0]??raw.tree};}; // .tree = primeira raiz (formato novo ou antigo)
const until=async(fn,message)=>{for(let i=0;i<40;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}assert.fail(message);};
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},extraHTTPHeaders:{'x-context-maps':'1'}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let confirmAnswer=true,promptAnswer='Minha apresentação';
 page.on('dialog',d=>d.type()==='prompt'?d.accept(promptAnswer):confirmAnswer?d.accept():d.dismiss());
 await page.goto(base);
 const sw=page.locator('#edit-switch'),ids=()=>page.locator('.node').evaluateAll(els=>els.map(e=>e.dataset.id).sort());
 const saveAs=async(item,name,opts={})=>{ // janela "Salvar como": nome, pasta e o que fazer depois
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
  await page.locator('#doc-button').click();await page.locator(item).click();
  await page.locator('#saveas-modal').waitFor();
  await page.locator('#saveas-name').fill(name);
  if(opts.mode)await page.locator(`input[name="saveas-mode"][value="${opts.mode}"]`).check();
  if(opts.folder!==undefined)await page.locator('#saveas-folder').selectOption(opts.folder);
  if(opts.folderPath){await page.locator('#saveas-folder').selectOption('__other');await page.locator('#saveas-path').fill(opts.folderPath);}
  await page.locator('#saveas-submit').click();
  if(!opts.keepOpen)await page.locator('#saveas-modal').waitFor({state:'hidden'});
 };
 const openMenu=async nid=>{
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
  await page.locator('#fit').click(); // garante que o card não fique atrás da barra inferior
  const card=page.locator(`[data-id="${nid}"]`);await card.hover();
  await card.locator('.edit-fab').click();await page.locator('#radial-menu.open .radial-center').waitFor();
 };
 const act=async(nid,label)=>{await openMenu(nid);await page.locator(`#radial-menu [aria-label^="${label}"]`).click();};
 const setLinks=async(nid,color,scope)=>{ // cor das ligações: escolhe a cor e depois o alcance
  await act(nid,'Cor das ligações');await page.locator('#color-panel').waitFor();
  assert.equal(await page.locator('#color-panel [data-scope="children"]').isDisabled(),true); // só habilita depois de escolher a cor
  if(color===null)await page.locator('#color-panel [data-default]').click();
  else await page.locator('#color-panel .color-input').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},color);
  await page.locator(`#color-panel [data-scope="${scope}"]`).click();
  await page.locator('#color-panel').waitFor({state:'detached'});
 };
 await sw.waitFor();
 assert.equal(await sw.getAttribute('aria-checked'),'false'); // EDIT-01: exibição por padrão
 assert.equal(await page.locator('.node-tools').count(),0);
 assert.equal(await page.locator('[contenteditable]').count(),0);
 const id='cidades-para-pessoas';
 assert.equal((await onDisk(id)).tree.children.length,4); // semente gravada em arquivo

 await sw.click();assert.equal(await sw.getAttribute('aria-checked'),'true'); // EDIT-02: switch ativa edição
 assert.ok(await page.locator('[contenteditable]').count()>=5);
 assert.equal(await page.locator('.node-title').count(),0);

 await page.locator('[data-id="mobility"] p').fill('Mobilidade urbana'); // EDIT-03: edição inline e autosave
 await until(async()=>(await onDisk(id)).tree.children[0].title==='Mobilidade urbana','título não salvo');
 assert.equal(await page.locator('#save-status').getAttribute('data-state'),'saved');

 await act('mobility','Adicionar filho'); // EDIT-04: adicionar filho
 assert.equal((await ids()).length,9);
 await page.keyboard.type('Metrô integrado');await page.keyboard.press('Enter');
 await until(async()=>(await onDisk(id)).tree.children[0].children.at(-1)?.title==='Metrô integrado','filho não salvo');

 const deep=(await onDisk(id)).tree.children[0].children.at(-1).id; // profundidade arbitrária
 await act(`${deep}`,'Adicionar filho');
 await page.keyboard.type('Terceiro nível');await page.keyboard.press('Enter');
 await until(async()=>(await onDisk(id)).tree.children[0].children.at(-1).children[0]?.title==='Terceiro nível','neto não salvo');
 assert.equal((await ids()).length,10);

 await act('mobility-1','Adicionar irmão'); // irmão
 assert.equal((await onDisk(id)).tree.children[0].children.length>=0,true);
 await page.keyboard.press('Escape');
 await until(async()=>(await onDisk(id)).tree.children[0].children.length===5,'irmão não salvo');

 await act(`${deep}`,'Excluir ideia'); // EDIT-05: excluir com confirmação
 await until(async()=>(await onDisk(id)).tree.children[0].children.length===4,'exclusão não salva');
 confirmAnswer=false;await act('mobility-1','Excluir ideia');
 assert.equal((await onDisk(id)).tree.children[0].children.length,4);confirmAnswer=true;

 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'); // EDIT-06: imagem
 await page.locator('[data-id="community"] input[type=file]').setInputFiles({name:'foto teste.png',mimeType:'image/png',buffer:png});
 await until(async()=>(await onDisk(id)).tree.children[2].images?.length===1,'imagem não salva');
 const src=(await onDisk(id)).tree.children[2].images[0].src;assert.match(src,/^presentations\/cidades-para-pessoas\/assets\/foto-teste-.*\.png$/);
 assert.equal((await page.request.get(`${base}/${src}`)).status(),200);
 assert.equal(await page.locator('[data-id="community"] .image-button img').count(),1);

 // EDIT-11: editor de diagramas Mermaid
 await page.locator('[data-id="community"] .toggle').click();
 await act('community-1','Adicionar diagrama');
 const modal=page.locator('#diagram-editor');await modal.waitFor();
 await page.locator('#diagram-preview img').waitFor({timeout:30000});
 assert.equal(await page.locator('#diagram-apply').isEnabled(),true);
 await page.locator('#diagram-source').fill('flowchart LR\n  X[Entrada] --> Y[Saída]');
 await page.waitForFunction(()=>decodeURIComponent(document.querySelector('#diagram-preview img')?.src||'').includes('Entrada'),null,{timeout:30000});
 await page.locator('#diagram-source').fill('flowchart LR\n  X[ --> ');
 await page.locator('#diagram-error:not(:empty)').waitFor({timeout:30000});
 assert.equal(await page.locator('#diagram-apply').isDisabled(),true);
 await page.locator('#diagram-source').fill('flowchart LR\n  X[Entrada] --> Y[Saída]');
 await page.locator('#diagram-apply:enabled').click();await modal.waitFor({state:'hidden'});
 await until(async()=>(await onDisk(id)).tree.children[2].children[0].images?.[0]?.kind==='diagram','diagrama não salvo');
 const diagram=(await onDisk(id)).tree.children[2].children[0].images[0];
 assert.match(diagram.source,/Entrada/);assert.match(diagram.src,/\.svg$/);
 assert.equal((await page.request.get(`${base}/${diagram.src}`)).status(),200);
 assert.match(await (await page.request.get(`${base}/${diagram.src}`)).text(),/<svg/);
 assert.equal(await page.locator('[data-id="community-1"] .image-button.is-diagram').count(),1);
 await page.locator('[data-id="community-1"] [aria-label^="Editar diagrama"]').click(); // reabre com o código salvo
 assert.match(await page.locator('#diagram-source').inputValue(),/Entrada/);
 await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});

 // EDIT-12: várias imagens e diagramas no mesmo card
 await page.locator('[data-id="community-1"] input[type=file]').setInputFiles([{name:'a.png',mimeType:'image/png',buffer:png},{name:'b.png',mimeType:'image/png',buffer:png}]);
 await until(async()=>(await onDisk(id)).tree.children[2].children[0].images.length===3,'duas imagens não adicionadas');
 await act('community-1','Adicionar diagrama');
 await page.locator('#diagram-preview img').waitFor({timeout:30000});
 await page.locator('#diagram-apply:enabled').click();await modal.waitFor({state:'hidden'});
 await until(async()=>(await onDisk(id)).tree.children[2].children[0].images.length===4,'segundo diagrama não salvo');
 assert.deepEqual((await onDisk(id)).tree.children[2].children[0].images.map(i=>i.kind||'image'),['diagram','image','image','diagram']);
 assert.equal(await page.locator('[data-id="community-1"] .image-button').count(),4);
 assert.equal(await page.locator('[data-id="community-1"] .image-button.is-diagram').count(),2);
 await page.locator('[data-id="community-1"] .image-button').nth(3).evaluate(e=>e.click()); // lightbox com navegação
 assert.equal(await page.locator('#lightbox-count').textContent(),'4 / 4');
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#lightbox-count').textContent(),'1 / 4');
 await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#lightbox-count').textContent(),'4 / 4');
 await page.keyboard.press('Escape');
 await page.locator('[data-id="community-1"] [aria-label^="Remover imagem"]').nth(1).evaluate(e=>e.click());
 await until(async()=>(await onDisk(id)).tree.children[2].children[0].images.length===3,'remoção não salva');
 await page.locator('[data-id="community-1"] .node-badge').waitFor();

 // EDIT-13: links abaixo do card
 promptAnswer='https://example.com/docs';
 await act('community-2','Adicionar link');
 await until(async()=>(await onDisk(id)).tree.children[2].children[1].links?.[0]?.url==='https://example.com/docs','link não salvo');
 assert.equal(await page.locator('[data-id="community-2"] .link-chip a').getAttribute('href'),'https://example.com/docs');
 promptAnswer='javascript:alert(1)';
 await act('community-2','Adicionar link');
 await new Promise(r=>setTimeout(r,700));
 assert.equal((await onDisk(id)).tree.children[2].children[1].links.length,1); // protocolo inseguro recusado
 promptAnswer='exemplo.org/guia';
 await act('community-2','Adicionar link');
 await until(async()=>(await onDisk(id)).tree.children[2].children[1].links?.length===2,'segundo link não salvo');
 assert.equal((await onDisk(id)).tree.children[2].children[1].links[1].url,'https://exemplo.org/guia');
 await sw.click(); // exibição: selo "2 links" com lista
 const badge=page.locator('[data-id="community-2"] .link-badge');
 assert.match(await badge.textContent(),/2 links/);
 await badge.click();
 assert.deepEqual(await page.locator('[data-id="community-2"] .link-menu a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),['https://example.com/docs','https://exemplo.org/guia']);
 assert.equal(await page.locator('[data-id="community-2"] .link-menu a').first().getAttribute('target'),'_blank');
 await sw.click(); // edição: remover um link
 await page.locator('[data-id="community-2"] [aria-label^="Remover link"]').first().click();
 await until(async()=>(await onDisk(id)).tree.children[2].children[1].links.length===1,'remoção do link não salva');
 await page.locator('[data-id="community-2"] [aria-label^="Remover link"]').first().click();
 await until(async()=>(await onDisk(id)).tree.children[2].children[1].links===undefined,'links não removidos');
 promptAnswer='Minha apresentação';

 // EDIT-14: subtítulo que aparece ao passar o mouse
 await page.locator('[data-id="community-3"] .node-subtitle').fill('Texto de apoio que só aparece no hover');
 await until(async()=>(await onDisk(id)).tree.children[2].children[2].subtitle==='Texto de apoio que só aparece no hover','subtítulo não salvo');
 await sw.click(); // exibição
 const hint=page.locator('[data-id="community-3"] .node-subtitle');
 assert.equal(await hint.textContent(),'Texto de apoio que só aparece no hover');
 await page.mouse.move(2,300);await page.waitForTimeout(250);
 assert.equal(await hint.evaluate(e=>getComputedStyle(e).opacity),'0');
 await page.locator('[data-id="community-3"]').hover();await page.waitForTimeout(300);
 assert.equal(await hint.evaluate(e=>getComputedStyle(e).opacity),'1');
 assert.equal(await page.locator('[data-id="community-2"] .node-subtitle').count(),0); // sem subtítulo, nada renderizado
 await sw.click(); // edição: limpar remove o campo
 await page.locator('[data-id="community-3"] .node-subtitle').fill('');
 await until(async()=>(await onDisk(id)).tree.children[2].children[2].subtitle===undefined,'subtítulo não removido');

 await setLinks('future','#00aa55','children'); // cor das ligações do ramo
 await until(async()=>(await onDisk(id)).tree.children[3].linksColor==='#00aa55','cor não salva');
 // EDIT-18: cor das ligações — só filhos diretos ou toda a ramificação abaixo
 const edgeStroke=(sel)=>page.locator(sel).evaluate(p=>p.getAttribute('stroke'));
 const stopColor=(child)=>page.locator(`#fade-${child} stop`).last().evaluate(s=>s.getAttribute('stop-color'));
 const before1=await edgeStroke('#connections path[data-parent="community"][data-child="community-1"]');
 const rootEdgeBefore=await stopColor('community');
 await act('community','Cor das ligações');await page.locator('#color-panel').waitFor();
 const labels=await page.locator('#color-panel [data-scope] b').allTextContents();
 assert.deepEqual(labels,['Só filhos diretos','Toda a ramificação abaixo']);
 await page.keyboard.press('Escape');await page.locator('#color-panel').waitFor({state:'detached'});
 await setLinks('community','#aa0033','children');
 await until(async()=>(await onDisk(id)).tree.children[2].linksColor==='#aa0033','cor das ligações não salva');
 for(const kid of ['community-1','community-2','community-3'])
  assert.equal(await edgeStroke(`#connections path[data-parent="community"][data-child="${kid}"]`),'#aa0033'); // saem do card
 assert.equal(await stopColor('community'),rootEdgeBefore); // a ligação que chega ao card não muda
 assert.equal((await onDisk(id)).tree.children[2].color,'#a39acb'); // a cor do próprio ramo não mudou
 await setLinks('community',null,'children'); // padrão
 await until(async()=>(await onDisk(id)).tree.children[2].linksColor===undefined,'cor das ligações não restaurada');
 assert.equal(await edgeStroke('#connections path[data-parent="community"][data-child="community-1"]'),before1);
 // toda a ramificação: a raiz e todos os cards abaixo que têm filhas
 await setLinks('root','#0066cc','all');
 const withKids=n=>[n,...n.children.flatMap(withKids)];
 await until(async()=>{const t=(await onDisk(id)).tree;return withKids(t).filter(n=>n.children.length).every(n=>n.linksColor==='#0066cc');},'cor não propagou para toda a ramificação');
 assert.ok(withKids((await onDisk(id)).tree).filter(n=>!n.children.length).every(n=>n.linksColor===undefined)); // folhas não têm ligações
 assert.equal(await stopColor('community'),'#0066cc');
 assert.equal(await edgeStroke('#connections path[data-parent="community"][data-child="community-1"]'),'#0066cc');
 await setLinks('root',null,'all');
 await until(async()=>withKids((await onDisk(id)).tree).every(n=>n.linksColor===undefined),'ramificação não restaurada');
 // só filhos diretos da raiz: não propaga para baixo
 await setLinks('root','#0066cc','children');
 await until(async()=>(await onDisk(id)).tree.linksColor==='#0066cc','raiz não salva');
 assert.equal((await onDisk(id)).tree.children[2].linksColor,undefined);
 await setLinks('root',null,'children');
 await until(async()=>(await onDisk(id)).tree.linksColor===undefined,'raiz não restaurada');
 await setLinks('future','#00aa55','children'); // a cor do ramo 'future' é conferida mais adiante

 // EDIT-22: reordenar imagens/diagramas do card (botões ↑ ↓ e arrastando a alça)
 await page.locator('#fit').click();
 await page.locator('[data-id="nature"] input[type=file]').setInputFiles([{name:'ordem-a.png',mimeType:'image/png',buffer:png},{name:'ordem-b.png',mimeType:'image/png',buffer:png}]);
 const natureImgs=async()=>(await onDisk(id)).tree.children.find(k=>k.id==='nature').images.map(i=>i.src);
 await until(async()=>(await natureImgs()).length>=3,'imagens para ordenar não salvas');
 const order0=await natureImgs();
 const items=()=>page.locator('[data-id="nature"] .image-item');
 assert.equal(await items().nth(0).locator('[data-move="up"]').isDisabled(),true);   // primeira não sobe
 assert.equal(await items().last().locator('[data-move="down"]').isDisabled(),true); // última não desce
 await items().nth(0).locator('[data-move="down"]').click();
 await until(async()=>{const o=await natureImgs();return o[0]===order0[1]&&o[1]===order0[0];},'↓ não reordenou');
 await items().nth(order0.length-1).locator('[data-move="up"]').click();
 await until(async()=>{const o=await natureImgs();return o[order0.length-2]===order0[order0.length-1];},'↑ não reordenou');
 // arrastar a alça do primeiro para depois do último
 const beforeDrag=await natureImgs();
 await page.locator('#fit').click();
 const first=items().nth(0),last=items().last(),lb=await last.boundingBox();
 await first.hover();
 await first.locator('.img-grip').dragTo(last,{targetPosition:{x:lb.width/2,y:lb.height*.9}});
 await until(async()=>{const o=await natureImgs();return o.at(-1)===beforeDrag[0]&&o[0]===beforeDrag[1];},'arrastar não reordenou');
 assert.equal((await natureImgs()).length,beforeDrag.length); // nada se perdeu
 // o modo texto segue a nova ordem
 await sw.click();await page.locator('#mode').click();
 const readingSrcs=await page.locator('#reading h2').filter({hasText:'natureza'}).evaluate(h=>{const out=[];let n=h.nextElementSibling;while(n&&n.tagName==='IMG'){out.push(n.getAttribute('src'));n=n.nextElementSibling;}return out;});
 assert.deepEqual(readingSrcs,await natureImgs());
 await page.locator('#mode').click();await sw.click();

 // EDIT-17: arrastar e soltar imagens no card (cópia em assets, origem intacta)
 await page.locator('[data-id="community-2"]').scrollIntoViewIfNeeded();
 const dropFiles=(selector,files)=>page.evaluate(({selector,files})=>{
  const target=document.querySelector(selector),dt=new DataTransfer();
  for(const f of files){const bytes=Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0));dt.items.add(new File([bytes],f.name,{type:f.type}));}
  const fire=(type)=>target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt}));
  fire('dragenter');fire('dragover');
  const marked=target.classList.contains('drop-target');
  fire('drop');
  return marked;
 },{selector,files});
 const c2=async()=>(await onDisk(id)).tree.children[2].children[1];
 const imagesBefore=(await c2()).images?.length||0;
 const marked=await dropFiles('[data-id="community-2"]',[{name:'solta a.png',type:'image/png',b64:png.toString('base64')},{name:'solta-b.png',type:'image/png',b64:png.toString('base64')}]);
 assert.equal(marked,true); // realce durante o arraste
 await until(async()=>((await c2()).images?.length||0)===imagesBefore+2,'imagens soltas não salvas');
 const dropped=(await c2()).images.slice(-2);
 for(const image of dropped){
  assert.match(image.src,/^presentations\/cidades-para-pessoas\/assets\/solta-.*\.png$/);
  assert.equal((await page.request.get(`${base}/${image.src}`)).status(),200);
 }
 assert.equal(await page.locator('[data-id="community-2"]').evaluate(el=>el.classList.contains('drop-target')),false);
 await dropFiles('[data-id="community-2"]',[{name:'nota.txt',type:'text/plain',b64:btoa('oi')}]); // arquivo não suportado
 await new Promise(r=>setTimeout(r,500));
 assert.equal((await c2()).images.length,imagesBefore+2);
 assert.equal(await page.locator('#save-status').getAttribute('data-state'),'error');
 // EDIT-16: cards sem título (só mídia / só texto secundário)
 const rootKids=async()=>(await onDisk(id)).tree.children;
 const before=(await rootKids()).length;
 await act('root','Adicionar filho');
 await until(async()=>(await rootKids()).length===before+1,'filho não criado');
 const imgId=(await rootKids()).at(-1).id;
 await page.locator(`[data-id="${imgId}"] input[type=file]`).setInputFiles({name:'solo.png',mimeType:'image/png',buffer:png});
 await until(async()=>(await rootKids()).at(-1).images?.length===1,'imagem do card sem título não salva');
 await page.locator(`[data-id="${imgId}"] p:not(.node-subtitle)`).fill('');
 await page.locator(`[data-id="${imgId}"] p:not(.node-subtitle)`).evaluate(e=>e.blur());
 await until(async()=>(await rootKids()).at(-1).title==='','título vazio não mantido com imagem');
 await act('root','Adicionar filho');
 await until(async()=>(await rootKids()).length===before+2,'segundo filho não criado');
 const subId=(await rootKids()).at(-1).id;
 await page.locator(`[data-id="${subId}"] .node-subtitle`).fill('Só texto secundário');
 await page.locator(`[data-id="${subId}"] p:not(.node-subtitle)`).fill('');
 await page.locator(`[data-id="${subId}"] p:not(.node-subtitle)`).evaluate(e=>e.blur());
 await until(async()=>{const n=(await rootKids()).at(-1);return n.title===''&&n.subtitle==='Só texto secundário';},'card só com subtítulo não salvo');
 await act('root','Adicionar filho');
 await until(async()=>(await rootKids()).length===before+3,'terceiro filho não criado');
 const emptyId=(await rootKids()).at(-1).id;
 await page.locator(`[data-id="${emptyId}"] p:not(.node-subtitle)`).fill('');
 await page.locator(`[data-id="${emptyId}"] p:not(.node-subtitle)`).evaluate(e=>e.blur());
 await until(async()=>(await rootKids()).at(-1).title==='Nova ideia','card totalmente vazio deveria voltar ao padrão');
 await sw.click(); // exibição: sem título visível, subtítulo sempre visível
 assert.equal(await page.locator(`[data-id="${imgId}"] p:not(.node-subtitle)`).isHidden(),true);
 assert.equal(await page.locator(`[data-id="${imgId}"] .image-button`).count(),1);
 assert.equal(await page.locator(`[data-id="${subId}"] .node-subtitle`).evaluate(e=>getComputedStyle(e).opacity),'1');
 assert.equal(await page.locator(`[data-id="${subId}"] p:not(.node-subtitle)`).isHidden(),true);
 await sw.click();
 // EDIT-19: mover cards (com as filhas) arrastando a alça
 await page.locator('#fit').click();
 const handleDrag=async(fromSel,toSel,pos)=>{
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;}); // o aviso de desfazer cobre parte do mapa
  const handle=page.locator(`${fromSel} .drag-handle`);
  await page.locator(fromSel).hover();
  const hb=await handle.boundingBox();
  await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();
  await page.mouse.move(hb.x+hb.width/2+12,hb.y+hb.height/2+12,{steps:3});await page.waitForTimeout(120); // o card sai do mapa e o layout se reorganiza
  const tb=toSel?await page.locator(toSel).boundingBox():{x:20,y:560,width:10,height:10}; // sem seletor: solta numa área vazia
  const tx=tb.x+tb.width/2,ty=pos==='top'?tb.y+tb.height*.1:pos==='bottom'?tb.y+tb.height*.9:tb.y+tb.height/2;
  await page.mouse.move(tx,ty,{steps:14});await page.waitForTimeout(80);
  const state=await page.evaluate(()=>({link:!document.querySelector('#drop-link').hidden,leaf:document.querySelectorAll('.drop-leaf').length,into:document.querySelectorAll('.drop-into').length,line:!document.querySelector('#drop-line').hidden,invalid:document.querySelectorAll('.drop-invalid').length,moving:document.body.classList.contains('is-moving')}));
  await page.mouse.up();
  return state;
 };
 const tops=async()=>(await onDisk(id)).tree.children;
 const kids0=await tops();
 const subTop=kids0.find(k=>k.title==='' && k.subtitle==='Só texto secundário')?.id;
 const imgTop=kids0.find(k=>k.images?.length&&k.title==='')?.id;
 assert.ok(subTop&&imgTop);
 // 1) soltar no centro de outro card: vira filho
 let dnd=await handleDrag(`[data-id="${subTop}"]`,`[data-id="${imgTop}"]`,'center');
 assert.equal(dnd.moving,true);assert.equal(dnd.into,1);
 await until(async()=>(await tops()).find(k=>k.id===imgTop)?.children.some(c=>c.id===subTop),'card não virou filho');
 assert.equal((await tops()).some(k=>k.id===subTop),false);
 // 2) mover um ramo inteiro (com as filhas) para dentro de outro card
 const communityKids=(await tops()).find(k=>k.id==='community').children.length;
 await page.locator('#fit').click();
 await handleDrag('[data-id="community"]',`[data-id="${imgTop}"]`,'center');
 await until(async()=>(await tops()).find(k=>k.id===imgTop)?.children.some(c=>c.id==='community'&&c.children.length===communityKids),'ramo não foi movido com as filhas');
 assert.ok(communityKids>=3);
 // 3) desfazer
 await page.locator('#toast-undo').click();
 await until(async()=>(await tops()).some(k=>k.id==='community'),'desfazer não restaurou o ramo');
 assert.equal((await tops()).find(k=>k.id===imgTop).children.some(c=>c.id==='community'),false);
 // 4) borda de cima: vira irmão antes do alvo
 await page.locator('#fit').click();
 dnd=await handleDrag(`[data-id="${subTop}"]`,'[data-id="nature"]','top');
 assert.equal(dnd.line,true);
 await until(async()=>{const k=await tops();return k.findIndex(x=>x.id===subTop)===k.findIndex(x=>x.id==='nature')-1&&k.findIndex(x=>x.id===subTop)>=0;},'não ficou antes do irmão');
 // volta o card para o fim da raiz (soltar no centro da raiz = novo ramo no final), restaurando os índices originais
 await page.locator('#fit').click();
 await handleDrag(`[data-id="${subTop}"]`,'[data-id="root"]','center');
 await until(async()=>(await tops()).at(-1).id===subTop&&(await tops())[1].id==='nature','card não voltou ao fim da raiz');
 // 5) soltar num espaço vazio cria um novo card raiz (e dá para desfazer)
 const snapshotBefore=JSON.stringify(await tops());
 await page.locator('#fit').click();
 dnd=await handleDrag(`[data-id="${imgTop}"]`,null,'center');
 assert.equal(dnd.into+dnd.invalid,0); // sobre o espaço vazio não há card alvo
 await until(async()=>(await rawDisk(id)).roots.length===2&&(await rawDisk(id)).roots[1].id===imgTop,'soltar no vazio deveria criar uma nova raiz');
 assert.equal((await tops()).some(k=>k.id===imgTop),false);
 await page.locator('#toast-undo').click();
 await until(async()=>(await rawDisk(id)).roots.length===1,'desfazer não restaurou');
 assert.equal(JSON.stringify(await tops()),snapshotBefore);
 // 6) Esc cancela o arraste
 await page.locator('#fit').click();
 const hb2=await page.locator(`[data-id="${subTop}"] .drag-handle`).boundingBox();
 await page.locator(`[data-id="${subTop}"]`).hover();
 await page.mouse.move(hb2.x+hb2.width/2,hb2.y+hb2.height/2);await page.mouse.down();await page.mouse.move(hb2.x+80,hb2.y+80,{steps:6});
 await page.keyboard.press('Escape');await page.mouse.up();
 assert.equal(await page.evaluate(()=>document.body.classList.contains('is-moving')),false);
 assert.equal(JSON.stringify(await tops()),snapshotBefore);
 assert.equal(await page.locator('[data-id="root"] .drag-handle').count(),0); // a raiz não se move
 await page.locator('#fit').click();

 // EDIT-20: durante o arraste, o conjunto sai do mapa, acompanha o cursor e as ramificações abrem sozinhas
 await page.locator('#fit').click();
 dnd=await handleDrag(`[data-id="${subTop}"]`,`[data-id="${imgTop}"]`,'center');
 await until(async()=>(await tops()).find(k=>k.id===imgTop)?.children.some(c=>c.id===subTop),'preparo do EDIT-20');
 await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
 await page.locator('#fit').click();
 const visibleIds=()=>page.locator('.node').evaluateAll(els=>els.map(e=>e.dataset.id));
 const nodesBeforeDrag=(await visibleIds()).length;
 const handleBox=await page.locator('[data-id="community"] .drag-handle').boundingBox();
 await page.locator('[data-id="community"]').hover();
 await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);await page.mouse.down();
 await page.mouse.move(handleBox.x+60,handleBox.y+50,{steps:6});await page.waitForTimeout(150);
 const during=await visibleIds();
 assert.ok(!during.includes('community')&&!during.includes('community-1'),'o conjunto deveria sair do mapa durante o arraste');
 assert.equal(during.length,nodesBeforeDrag-(1+communityKids));
 assert.equal(await page.locator('.drag-ghost .ghost-title').count(),1+communityKids); // o conjunto inteiro acompanha o cursor
 // botão do meio move o quadro durante o arraste
 const cam0=await page.locator('#world').evaluate(el=>getComputedStyle(el).transform);
 await page.mouse.down({button:'middle'});
 await page.mouse.move(handleBox.x+110,handleBox.y+110,{steps:6});
 await page.mouse.up({button:'middle'});
 const cam1=await page.locator('#world').evaluate(el=>getComputedStyle(el).transform);
 assert.notEqual(cam1,cam0,'botão do meio deveria mover o quadro');
 assert.equal(await page.evaluate(()=>document.body.classList.contains('is-moving')),true);
 // ramo fechado com filhas abre sozinho ao pairar e fecha ao sair
 await page.keyboard.press('Escape');await page.mouse.up();
 await page.locator('#fit').click();
 if(await page.locator('[data-id="nature"] .toggle').getAttribute('aria-expanded')==='true')await page.locator('[data-id="nature"] .toggle').click();
 await page.locator('#fit').click();
 assert.equal(await page.locator('[data-id="nature-1"]').count(),0);
 const hb3=await page.locator(`[data-id="${subTop}"] .drag-handle`).boundingBox()||await (async()=>{await page.locator(`[data-id="${subTop}"]`).hover();return page.locator(`[data-id="${subTop}"] .drag-handle`).boundingBox();})();
 await page.locator(`[data-id="${imgTop}"]`).hover(); // o subTop agora é filho de imgTop: abre o ramo para alcançá-lo
 if(await page.locator(`[data-id="${imgTop}"] .toggle`).getAttribute('aria-expanded')==='false')await page.locator(`[data-id="${imgTop}"] .toggle`).click();
 await page.locator('#fit').click();
 await page.locator(`[data-id="${subTop}"]`).hover();
 const hb4=await page.locator(`[data-id="${subTop}"] .drag-handle`).boundingBox();
 await page.mouse.move(hb4.x+hb4.width/2,hb4.y+hb4.height/2);await page.mouse.down();
 await page.mouse.move(hb4.x+hb4.width/2+14,hb4.y+hb4.height/2+14,{steps:3});await page.waitForTimeout(120);
 const natureBox=await page.locator('[data-id="nature"]').boundingBox();
 await page.mouse.move(natureBox.x+natureBox.width/2,natureBox.y+natureBox.height/2,{steps:10});
 await page.waitForTimeout(250);
 assert.equal(await page.locator('.drop-opening').count(),1); // avisa que vai abrir
 await page.waitForTimeout(600);
 assert.equal(await page.locator('[data-id="nature-1"]').count(),1,'o ramo deveria abrir sozinho ao pairar');
 await page.mouse.move(30,430,{steps:8});await page.waitForTimeout(1300);
 assert.equal(await page.locator('[data-id="nature-1"]').count(),0,'o ramo aberto sozinho deveria fechar ao sair');
 await page.keyboard.press('Escape');await page.mouse.up();
 assert.equal(await page.locator('[data-id="nature-1"]').count(),0);
 await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
 // devolve o card ao fim da raiz para restaurar a ordem original dos testes seguintes
 await page.locator('#fit').click();
 await handleDrag(`[data-id="${subTop}"]`,'[data-id="root"]','center');
 await until(async()=>(await tops()).at(-1).id===subTop,'card não voltou ao fim da raiz');
 await page.locator('[data-id="nature"] .toggle').click();
 await page.locator('#fit').click();

 // EDIT-21: roda de ações num único botão centralizado (não cobre a alça nem os vizinhos)
 await page.locator('#fit').click();
 assert.equal(await page.locator('.node-tools').count(),0);
 const cardBox=await page.locator('[data-id="nature"]').boundingBox();
 await page.locator('[data-id="nature"]').hover();
 const fabBox=await page.locator('[data-id="nature"] .edit-fab').boundingBox(),gripBox=await page.locator('[data-id="nature"] .drag-handle').boundingBox();
 assert.ok(Math.abs(fabBox.x+fabBox.width/2-(cardBox.x+cardBox.width/2))<3,'botão centralizado no card');
 assert.ok(fabBox.x>gripBox.x+gripBox.width,'o botão não cobre a alça');
 await page.locator('[data-id="nature"] .edit-fab').click();
 const wheel=await page.locator('#radial-menu .radial-item').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label').split(':')[0]));
 for(const label of ['Adicionar filho','Adicionar irmão','Inserir antes de','Inserir pai de','Adicionar imagem','Adicionar diagrama','Adicionar link','Cor das ligações','Excluir ideia'])assert.ok(wheel.includes(label),`roda sem "${label}"`);
 const inside=await page.locator('#radial-menu .radial-item').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
 assert.equal(inside,true,'itens da roda devem ficar dentro da janela');
 await page.mouse.click(5,5); // clicar fora fecha
 await page.locator('#radial-menu').waitFor({state:'detached'});
 await page.locator('[data-id="nature"]').hover();await page.locator('[data-id="nature"] .edit-fab').click();
 await page.keyboard.press('Escape');await page.locator('#radial-menu').waitFor({state:'detached'}); // Esc fecha
 await openMenu('nature');await page.locator('#radial-menu .radial-center').click();
 await page.locator('#radial-menu').waitFor({state:'detached'}); // × fecha

 // EDIT-15: inserir pai e inserir antes
 await page.locator('[data-id="future"] .toggle').click();
 const futureKids=async()=>(await onDisk(id)).tree.children[3].children;
 await until(async()=>(await futureKids()).length===3,'filhos de future não carregados');
 const f1=(await futureKids())[0].id;
 await act(`${f1}`,'Inserir pai de');
 await until(async()=>(await futureKids())[0].id!==f1&&(await futureKids())[0].children[0]?.id===f1,'pai não inserido');
 assert.equal((await futureKids()).length,3);
 const f2=(await futureKids())[1].id;
 await act(`${f2}`,'Inserir antes de');
 await until(async()=>(await futureKids()).length===4&&(await futureKids())[2].id===f2,'irmão antes não inserido');
 assert.equal((await futureKids())[1].children.length,0);
 // ramo de primeiro nível: o ramo vira filho do novo pai e mantém suas ligações coloridas
 await act('future','Inserir pai de');
 await until(async()=>(await onDisk(id)).tree.children[3].children[0]?.id==='future','pai do ramo não inserido');
 assert.equal((await onDisk(id)).tree.children[3].linksColor,undefined); // o novo pai não herda a cor das ligações do ramo
 assert.equal((await onDisk(id)).tree.children[3].children[0].linksColor,'#00aa55'); // o ramo mantém as suas
 await openMenu('root');assert.equal(await page.locator('#radial-menu [aria-label^="Inserir pai de"]').count(),0); // raiz não tem pai
 assert.equal(await page.locator('#radial-menu [aria-label^="Excluir ideia"]').count(),0);
 await page.keyboard.press('Escape');await page.locator('#radial-menu').waitFor({state:'detached'});

 await page.reload();await page.locator('.node').first().waitFor(); // EDIT-07: persistência
 await page.locator('[data-id="mobility"] .node-title').waitFor();
 assert.equal(await page.locator('[data-id="mobility"] .node-title').textContent(),'Mobilidade urbana');
 assert.equal(await page.locator('.node-tools').count(),0);

 await sw.click();await sw.click(); // EDIT-08: voltar à exibição
 assert.equal(await page.locator('[contenteditable]').count(),0);
 assert.equal(await page.locator('.node-title').count()>0,true);

 await page.locator('#doc-button').click(); // EDIT-09: várias apresentações
 await page.locator('#doc-new').click();
 await until(async()=>(await readdir(dir)).includes('minha-apresentacao.json'),'nova apresentação não criada');
 assert.equal(await page.locator('#doc-title').textContent(),'Minha apresentação');
 assert.deepEqual(await ids(),['root']);
 assert.equal(await sw.getAttribute('aria-checked'),'true');
 await act('root','Adicionar filho');await page.keyboard.type('Primeira ideia');await page.keyboard.press('Enter');
 await until(async()=>(await onDisk('minha-apresentacao')).tree.children[0]?.title==='Primeira ideia','ideia não salva');
 await page.locator('#doc-button').click();await page.locator('#doc-list button[data-id="cidades-para-pessoas"]').click();
 await until(async()=>(await page.locator('#doc-title').textContent())==='E se a cidade fosse feita para as pessoas?','troca de apresentação');
 assert.equal((await onDisk(id)).tree.children[0].title,'Mobilidade urbana');

 // EDIT-23: salvar uma cópia / salvar como com nome definido pelo usuário
 const originalTitle=await page.locator('#doc-title').textContent();
 const originalDisk=JSON.stringify((await onDisk('cidades-para-pessoas')).tree);
 await saveAs('#doc-copy','Backup do mapa'); // copia e continua na atual (a janela já vem com "continuar" marcado)
 await until(async()=>(await readdir(dir)).includes('backup-do-mapa.json'),'cópia não criada');
 assert.equal(await page.locator('#doc-title').textContent(),originalTitle); // continua na original
 const backup=await onDisk('backup-do-mapa');
 assert.equal(backup.title,'Backup do mapa'); // o nome da apresentação é separado dos cards raiz
 assert.equal(backup.tree.title,originalTitle);
 const mediaOf=n=>[...(n.images||[]),...n.children.flatMap(mediaOf)];
 const backupMedia=mediaOf(backup.tree).filter(m=>m.src.startsWith('presentations/'));
 assert.ok(backupMedia.length>0);
 for(const m of backupMedia){assert.match(m.src,/^presentations\/backup-do-mapa\/assets\//);assert.equal((await page.request.get(`${base}/${m.src}`)).status(),200);} // imagens copiadas
 await saveAs('#doc-saveas','Versão 2'); // copia e abre a nova
 await until(async()=>(await page.locator('#doc-title').textContent())==='Versão 2','não abriu a nova apresentação');
 assert.ok((await readdir(dir)).includes('versao-2.json')); // acentos e espaços viram um nome de arquivo seguro
 await page.locator('[data-id="root"] h1').fill('Versão 2 editada'); // editar a cópia não altera as outras
 await until(async()=>(await onDisk('versao-2')).tree.title==='Versão 2 editada','edição da cópia não salva');
 assert.equal(JSON.stringify((await onDisk('cidades-para-pessoas')).tree),originalDisk);
 assert.equal((await onDisk('backup-do-mapa')).title,'Backup do mapa');
 await saveAs('#doc-copy','Versão 2'); // nome repetido ganha sufixo
 await until(async()=>(await readdir(dir)).includes('versao-2-2.json'),'nome repetido não recebeu sufixo');
 for(const copyId of ['backup-do-mapa','versao-2','versao-2-2'])await page.request.delete(`${base}/api/presentations/${copyId}`);
 await page.locator('#doc-button').click();await page.locator('#doc-list button[data-id="cidades-para-pessoas"]').click();
 await until(async()=>(await page.locator('#doc-title').textContent())===originalTitle,'não voltou à apresentação original');
 promptAnswer='Minha apresentação';

 // EDIT-24: vários cards raiz com posição livre, nome da apresentação separado e leitura do formato antigo
 await page.request.post(`${base}/api/presentations`,{data:{title:'Multi raiz'}});
 await page.goto(`${base}/?p=multi-raiz`);await page.locator('.node').first().waitFor();
 await sw.click();
 const multi=()=>rawDisk('multi-raiz');
 {const raw=await multi();assert.equal(raw.title,'Multi raiz');assert.equal(raw.roots.length,1);assert.equal(raw.tree,undefined);} // formato novo
 const emptyPoint=()=>page.evaluate(()=>{ // procura um ponto livre do mapa (sem cards nem painéis)
  for(let y=innerHeight-150;y>120;y-=40)for(let x=60;x<innerWidth-60;x+=40){const el=document.elementFromPoint(x,y);if(el&&el.closest('#viewport')&&!el.closest('.node,.toolbar,.zoom-controls,.doc-bar'))return {x,y};}
  return null;
 });
 const dragToPoint=async(fromSel,point)=>{
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
  await page.locator('#fit').click();
  await page.locator(fromSel).hover();
  const hb=await page.locator(`${fromSel} .drag-handle`).boundingBox();
  await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();
  await page.mouse.move(hb.x+hb.width/2+12,hb.y+hb.height/2+12,{steps:3});await page.waitForTimeout(120);
  const p=point||await emptyPoint();
  await page.mouse.move(p.x,p.y,{steps:12});await page.waitForTimeout(80);
  const free=await page.evaluate(()=>document.querySelector('.drag-ghost')?.classList.contains('ghost-free'));
  await page.mouse.up();return free;
 };
 // 1) novo card raiz
 await page.locator('#add-root').click();
 await until(async()=>(await multi()).roots.length===2,'novo card raiz não criado');
 const root2=(await multi()).roots[1];
 assert.ok(Number.isFinite(root2.x)&&Number.isFinite(root2.y));
 assert.equal(await page.locator('.node.root').count(),2);
 await act(root2.id,'Adicionar filho');
 await until(async()=>(await multi()).roots[1].children.length===1,'filho da nova raiz não salvo');
 const child2=(await multi()).roots[1].children[0].id;
 // 2) nome da apresentação separado do texto dos cards raiz
 await page.locator('#doc-button').dblclick();
 await page.locator('.doc-title-input').fill('Meu fluxo');await page.keyboard.press('Enter');
 await until(async()=>(await multi()).title==='Meu fluxo','nome da apresentação não salvo');
 assert.equal((await multi()).roots[0].title,'Multi raiz'); // a raiz mantém o seu texto
 assert.equal(await page.locator('#doc-title').textContent(),'Meu fluxo');
 await page.locator('#doc-button').click();
 await until(async()=>(await page.locator('#doc-list button[data-id="multi-raiz"]').textContent())==='Meu fluxo','o menu deveria mostrar o nome novo');
 await page.keyboard.press('Escape');await page.mouse.click(5,5);
 // nome repetido: Enter mostra o aviso e não salva; criar/copiar com nome repetido ganha sufixo
 await page.locator('#doc-button').dblclick();
 await page.locator('.doc-title-input').fill('E se a cidade fosse feita para as pessoas?');await page.keyboard.press('Enter');
 await page.locator('.doc-title-error:not([hidden])').waitFor();
 assert.equal(await page.locator('.doc-title-input').count(),1); // continua editando
 await new Promise(r=>setTimeout(r,500));
 assert.equal((await multi()).title,'Meu fluxo'); // nada foi salvo
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.doc-title-input').count(),0);
 assert.equal(await page.locator('#doc-title').textContent(),'Meu fluxo');
 await page.locator('#doc-button').dblclick(); // sair do campo (blur) com nome repetido mantém o nome atual e avisa
 await page.locator('.doc-title-input').fill('minha apresentação');await page.mouse.click(5,300);
 await page.locator('.doc-title-input').waitFor({state:'detached'});
 assert.equal(await page.locator('#doc-title').textContent(),'Meu fluxo');
 assert.match(await page.locator('#toast-text').textContent(),/Já existe/);
 const dup=await (await page.request.post(`${base}/api/presentations`,{data:{title:'Meu fluxo'}})).json();
 assert.equal(dup.title,'Meu fluxo (2)'); // o servidor também evita repetir
 await page.request.delete(`${base}/api/presentations/${dup.id}`);
 // 3) reposicionar uma raiz arrastando-a para um espaço vazio
 const posBefore={x:root2.x,y:root2.y};
 const freeHint=await dragToPoint(`[data-id="${root2.id}"]`,null);
 assert.equal(freeHint,true); // o conjunto avisa que soltar ali reposiciona
 await until(async()=>{const r=(await multi()).roots[1];return r.id===root2.id&&(r.x!==posBefore.x||r.y!==posBefore.y);},'raiz não foi reposicionada');
 assert.equal((await multi()).roots.length,2);
 // 4) arrastar um card para o espaço vazio o transforma em raiz; Desfazer restaura
  await dragToPoint(`[data-id="${child2}"]`,null);
 await until(async()=>(await multi()).roots.length===3&&(await multi()).roots[2].id===child2,'card não virou raiz');
 assert.equal((await multi()).roots[1].children.length,0);
 await page.locator('#toast-undo').click();
 await until(async()=>(await multi()).roots.length===2&&(await multi()).roots[1].children.length===1,'desfazer não restaurou');
 // 5) conectar uma raiz a outro card (vira filha) e desfazer
 await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
 await page.locator('#fit').click();
 {
  const hb=await (async()=>{await page.locator(`[data-id="${root2.id}"]`).hover();return page.locator(`[data-id="${root2.id}"] .drag-handle`).boundingBox();})();
  await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();
  await page.mouse.move(hb.x+hb.width/2+12,hb.y+hb.height/2+12,{steps:3});await page.waitForTimeout(120);
  const tb=await page.locator('[data-id="root"]').boundingBox();
  await page.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2,{steps:12});await page.waitForTimeout(80);
  await page.mouse.up();
 }
 await until(async()=>{const raw=await multi();return raw.roots.length===1&&raw.roots[0].children.some(c=>c.id===root2.id);},'raiz não foi conectada ao outro card');
 assert.equal((await multi()).roots[0].children.find(c=>c.id===root2.id).x,undefined); // deixa de ter posição própria
 await page.locator('#toast-undo').click();
 await until(async()=>(await multi()).roots.length===2,'desfazer da conexão falhou');
 // 6) excluir uma raiz (a última não pode ser excluída)
 await act(root2.id,'Excluir ideia');
 await until(async()=>(await multi()).roots.length===1,'raiz não excluída');
 await openMenu('root');assert.equal(await page.locator('#radial-menu [aria-label^="Excluir ideia"]').count(),0);
 await page.keyboard.press('Escape');await page.locator('#radial-menu').waitFor({state:'detached'});
 // 7) "virar raiz" pela roda de ações
 await act('root','Adicionar filho');
 await until(async()=>(await multi()).roots[0].children.length===1,'filho não criado');
 const kid=(await multi()).roots[0].children[0].id;
 await act(kid,'Transformar em card raiz');
 await until(async()=>(await multi()).roots.length===2&&(await multi()).roots[1].id===kid,'não virou raiz pela roda');
 // 8) arquivo no formato antigo ({tree}) abre normalmente e passa ao formato novo ao salvar
 await writeFile(path.join(dir,'legado.json'),JSON.stringify({id:'legado',tree:{id:'root',title:'Fluxo legado',children:[{id:'a1',title:'Filho antigo',image:{src:'city.svg',alt:'Cidade'},children:[]}]}}));
 await page.goto(`${base}/?p=legado`);await page.locator('.node').first().waitFor();
 assert.equal(await page.locator('#doc-title').textContent(),'Fluxo legado'); // o nome vem da raiz
 assert.equal(await page.locator('.node').count(),2);
 assert.equal(await page.locator('[data-id="a1"] .image-button img').count(),1);
 await sw.click();await page.locator('[data-id="a1"] p:not(.node-subtitle)').fill('Filho antigo editado');
 await until(async()=>{const raw=await rawDisk('legado');return Array.isArray(raw.roots)&&raw.title==='Fluxo legado'&&raw.tree===undefined&&raw.roots[0].children[0].title==='Filho antigo editado'&&raw.roots[0].children[0].images?.length===1&&raw.roots[0].children[0].image===undefined;},'formato antigo não migrado ao salvar');
 for(const extra of ['multi-raiz','legado'])await page.request.delete(`${base}/api/presentations/${extra}`);
 await page.goto(`${base}/?p=cidades-para-pessoas`);await page.locator('.node').first().waitFor();

 // EDIT-25: árvores abertas não se sobrepõem (deslocamento visual) e voltam à origem ao recolher
 const mk=(prefix,title,kids)=>({id:`${prefix}0`,title,children:Array.from({length:kids},(_,i)=>({id:`${prefix}${i+1}`,title:`${title} ramo ${i+1}`,children:Array.from({length:3},(_,k)=>({id:`${prefix}${i+1}-${k+1}`,title:`${title} detalhe ${i+1}.${k+1}`,children:[]}))}))});
 const rootA=mk('a','Fluxo A',3),rootB=mk('b','Fluxo B',2);
 rootA.x=0;rootA.y=0;rootB.x=1000;rootB.y=0; // B fica ao lado de A quando A está fechada
 await writeFile(path.join(dir,'colisao.json'),JSON.stringify({id:'colisao',title:'Colisão',roots:[rootA,rootB]}));
 await page.goto(`${base}/?p=colisao`);await page.locator('.node').first().waitFor();
 const leftOf=id=>page.locator(`[data-id="${id}"]`).evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
 const rects=()=>page.evaluate(()=>[...document.querySelectorAll('.node')].map(el=>({id:el.dataset.id,r:el.getBoundingClientRect()})));
 const overlaps=async()=>{const all=await rects();for(const a of all.filter(n=>n.id.startsWith('a')))for(const b of all.filter(n=>n.id.startsWith('b'))){const A=a.r,B=b.r;if(A.left<B.right&&B.left<A.right&&A.top<B.bottom&&B.top<A.bottom)return `${a.id}×${b.id}`;}return null;};
 await page.locator('#collapse').click();
 const home=await leftOf('b0');assert.equal(home.x,1000); // fechado: na posição salva
 assert.equal(await overlaps(),null);
 await page.locator('#expand').click(); // abre tudo: A cresce e B se afasta para não sobrepor
 const moved=await leftOf('b0');
 assert.ok(moved.x!==home.x||moved.y!==home.y,'B deveria se afastar quando A abre');
 assert.equal(await overlaps(),null,'árvores abertas não podem se sobrepor');
 assert.equal(JSON.parse(await readFile(path.join(dir,'colisao.json'),'utf8')).roots[1].x,1000); // nada foi salvo: é só visual
 await page.locator('#collapse').click(); // recolhe: volta à origem
 const back=await leftOf('b0');assert.deepEqual(back,home);
 // abrir só um ramo pelo próprio card também reposiciona com animação e volta ao fechar
 await page.locator('[data-id="a1"] .toggle').click();await page.locator('[data-id="a2"] .toggle').click();await page.locator('[data-id="a3"] .toggle').click();
 await page.waitForTimeout(1500);
 assert.equal(await overlaps(),null);
 // a ordem original é preservada: quem estava abaixo continua abaixo (e quem estava à direita continua à direita)
 const vertical={id:'ordem',title:'Ordem',roots:[mk('a','Cima',1),mk('b','Baixo',3)]};
 vertical.roots[0].x=0;vertical.roots[0].y=0;vertical.roots[1].x=0;vertical.roots[1].y=250; // B abaixo de A (mas a árvore dele, aberta, cresce para cima e alcança A)
 await writeFile(path.join(dir,'ordem.json'),JSON.stringify(vertical));
 await page.goto(`${base}/?p=ordem`);await page.locator('.node').first().waitFor();
 await page.locator('#collapse').click();
 const aHome=await leftOf('a0'),bHome=await leftOf('b0');assert.ok(bHome.y>aHome.y);
 await page.locator('#expand').click(); // B cresce para cima, sobre A: continua abaixo de A
 const aOpen=await leftOf('a0'),bOpen=await leftOf('b0');
 assert.ok(bOpen.y>aOpen.y,`B deveria continuar abaixo de A (A=${aOpen.y}, B=${bOpen.y})`);
 assert.equal(await overlaps(),null);
 assert.deepEqual(aOpen,aHome); // A (que estava acima) não é jogado para baixo
 await page.locator('#collapse').click();
 assert.deepEqual(await leftOf('b0'),bHome); // e tudo volta à origem
 const wide={id:'ordem',title:'Ordem',roots:[mk('a','Esquerda',3),mk('b','Direita',3)]};
 wide.roots[0].x=0;wide.roots[0].y=200;wide.roots[1].x=1000;wide.roots[1].y=0; // B à direita e mais acima
 await writeFile(path.join(dir,'ordem.json'),JSON.stringify(wide));
 await page.goto(`${base}/?p=ordem`);await page.locator('.node').first().waitFor();
 await page.locator('#expand').click();
 assert.ok((await leftOf('b0')).x>(await leftOf('a0')).x,'quem estava à direita deve continuar à direita');
 assert.equal(await overlaps(),null);
 await page.request.delete(`${base}/api/presentations/ordem`);
 await page.request.delete(`${base}/api/presentations/colisao`);
 await page.goto(`${base}/?p=cidades-para-pessoas`);await page.locator('.node').first().waitFor();

 // EDIT-26: salvar em outra pasta da máquina (e abrir/editar de lá)
 const extRoot=await mkdtemp(path.join(tmpdir(),'cm-ext-')),extDir=path.join(extRoot,'meus mapas'); // pasta nova, com espaço no nome
 const cfgFolders=async()=>JSON.parse(await readFile(configFile,'utf8')).folders;
 await saveAs('#doc-copy','Externa',{folderPath:extDir}); // continua na atual
 await until(async()=>existsSync(path.join(extDir,'externa.json')),'cópia não foi gravada na outra pasta');
 assert.deepEqual(await cfgFolders(),[path.resolve(extDir)]); // a pasta foi registrada
 {
  const doc=await readFile(path.join(extDir,'externa.json'),'utf8').then(JSON.parse);
  assert.equal(doc.id,'externa');assert.equal(doc.title,'Externa');
  const srcs=[];(function walk(n){for(const m of n.images||[])srcs.push(m.src);n.children.forEach(walk);})(doc.roots[0]);
  const local=srcs.filter(s=>s.includes('assets/'));
  assert.ok(local.length>0&&local.every(s=>s.startsWith('externa/assets/')),'em pastas extras as imagens são gravadas relativas ao arquivo');
  const copied=await readdir(path.join(extDir,'externa','assets'));
  assert.ok(copied.length>=local.length); // as imagens foram copiadas junto
 }
 assert.equal(await page.locator('#doc-title').textContent(),originalTitle); // continuou na original
 // o menu lista a pasta e dá para abrir de lá
 await page.locator('#doc-button').click();
 await page.locator('.doc-folder').waitFor();
 assert.match(await page.locator('.doc-folder').first().textContent(),/meus mapas/);
 await page.locator('#doc-list button',{hasText:'Externa'}).click();
 await until(async()=>(await page.locator('#doc-title').textContent())==='Externa','não abriu a apresentação da outra pasta');
 assert.match(page.url(),/p=[0-9a-f]{6}~externa/);
 await page.locator('#expand').click();await page.waitForTimeout(400);
 assert.equal(await page.locator('.node img').evaluateAll(els=>els.length>0&&els.every(i=>i.complete&&i.naturalWidth>0)),true); // as imagens carregam da outra pasta
 // editar grava na outra pasta, mantendo os caminhos relativos
 await sw.click();
 await page.locator('[data-id="root"] h1').fill('Externa editada');
 await until(async()=>(await readFile(path.join(extDir,'externa.json'),'utf8').then(JSON.parse)).roots[0].title==='Externa editada','edição não foi gravada na outra pasta');
 await page.locator('[data-id="nature"] input[type=file]').setInputFiles({name:'nova-externa.png',mimeType:'image/png',buffer:png});
 await until(async()=>(await readdir(path.join(extDir,'externa','assets'))).some(f=>f.startsWith('nova-externa')),'upload não foi para a outra pasta');
 await until(async()=>JSON.stringify(await readFile(path.join(extDir,'externa.json'),'utf8')).includes('externa/assets/nova-externa'),'caminho da nova imagem deveria ser relativo');
 assert.equal(JSON.stringify(await readFile(path.join(extDir,'externa.json'),'utf8')).includes('presentations/'),false);
 // salvar como a partir da pasta externa para a biblioteca do app
 await saveAs('#doc-saveas','De volta para casa',{folder:''}); // biblioteca principal, abre a nova
 await until(async()=>existsSync(path.join(dir,'de-volta-para-casa.json')),'não gravou na biblioteca principal');
 {const back=JSON.parse(await readFile(path.join(dir,'de-volta-para-casa.json'),'utf8'));const srcs=[];(function walk(n){for(const m of n.images||[])srcs.push(m.src);n.children.forEach(walk);})(back.roots[0]);
  assert.ok(srcs.filter(s=>s.includes('assets/')).every(s=>s.startsWith('presentations/de-volta-para-casa/assets/')));}
 // caminho relativo é recusado com mensagem
 await saveAs('#doc-copy','Relativa',{folderPath:'pasta/relativa',keepOpen:true});
 await page.locator('#saveas-error:not(:empty)').waitFor();
 assert.match(await page.locator('#saveas-error').textContent(),/caminho completo/i);
 await page.keyboard.press('Escape');await page.locator('#saveas-modal').waitFor({state:'hidden'});
 assert.equal((await readdir(dir)).some(f=>f.startsWith('relativa')),false);
 // o servidor recusa pedidos sem o cabeçalho (outras páginas não podem escrever)
 {const bare=await browser.newContext();const res=await bare.request.post(`${base}/api/libraries`,{data:{dir:path.join(extRoot,'invasor')}});assert.equal(res.status(),403);await bare.close();} // sem o cabeçalho x-context-maps
 assert.equal(existsSync(path.join(extRoot,'invasor')),false);
 // tirar a pasta da lista não apaga os arquivos
 await page.locator('#doc-button').click();await page.locator('.doc-folder button').first().click();
 await until(async()=>(await cfgFolders()).length===0,'pasta não foi removida da lista');
 assert.equal(existsSync(path.join(extDir,'externa.json')),true);
 await page.request.delete(`${base}/api/presentations/de-volta-para-casa`);
 await rm(extRoot,{recursive:true,force:true});
 await page.goto(`${base}/?p=cidades-para-pessoas`);await page.locator('.node').first().waitFor();

 await page.locator('#doc-button').click();await page.locator('#doc-delete').click(); // EDIT-10: excluir apresentação
 await until(async()=>!(await readdir(dir)).includes('cidades-para-pessoas.json'),'arquivo não removido');
 await until(async()=>(await page.locator('#doc-title').textContent())==='Minha apresentação','apresentação restante não aberta');

 const traversal=await page.request.get(`${base}/presentations/..%2fserver.mjs`);assert.equal(traversal.status(),404); // segurança básica
 assert.equal((await page.request.get(`${base}/server.mjs`)).status(),404);
 assert.deepEqual(errors,[]);console.log('PASS EDIT-01..26');
}finally{await browser.close();server.kill();await rm(dir,{recursive:true,force:true});await rm(configDir,{recursive:true,force:true});}
