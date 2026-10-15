import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(path.join(tmpdir(),'context-maps-'));
const port=4190, base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:dir},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const onDisk=async id=>JSON.parse(await readFile(path.join(dir,`${id}.json`),'utf8'));
const until=async(fn,message)=>{for(let i=0;i<40;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}assert.fail(message);};
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let confirmAnswer=true,promptAnswer='Minha apresentação';
 page.on('dialog',d=>d.type()==='prompt'?d.accept(promptAnswer):confirmAnswer?d.accept():d.dismiss());
 await page.goto(base);
 const sw=page.locator('#edit-switch'),ids=()=>page.locator('.node').evaluateAll(els=>els.map(e=>e.dataset.id).sort());
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

 await page.locator('[data-id="mobility"] [aria-label^="Adicionar filho"]').click(); // EDIT-04: adicionar filho
 assert.equal((await ids()).length,9);
 await page.keyboard.type('Metrô integrado');await page.keyboard.press('Enter');
 await until(async()=>(await onDisk(id)).tree.children[0].children.at(-1)?.title==='Metrô integrado','filho não salvo');

 const deep=(await onDisk(id)).tree.children[0].children.at(-1).id; // profundidade arbitrária
 await page.locator(`[data-id="${deep}"] [aria-label^="Adicionar filho"]`).click();
 await page.keyboard.type('Terceiro nível');await page.keyboard.press('Enter');
 await until(async()=>(await onDisk(id)).tree.children[0].children.at(-1).children[0]?.title==='Terceiro nível','neto não salvo');
 assert.equal((await ids()).length,10);

 await page.locator('[data-id="mobility-1"] [aria-label^="Adicionar irmão"]').click(); // irmão
 assert.equal((await onDisk(id)).tree.children[0].children.length>=0,true);
 await page.keyboard.press('Escape');
 await until(async()=>(await onDisk(id)).tree.children[0].children.length===5,'irmão não salvo');

 await page.locator(`[data-id="${deep}"] [aria-label^="Excluir ideia"]`).click(); // EDIT-05: excluir com confirmação
 await until(async()=>(await onDisk(id)).tree.children[0].children.length===4,'exclusão não salva');
 confirmAnswer=false;await page.locator('[data-id="mobility-1"] [aria-label^="Excluir ideia"]').click();
 assert.equal((await onDisk(id)).tree.children[0].children.length,4);confirmAnswer=true;

 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'); // EDIT-06: imagem
 await page.locator('[data-id="community"] input[type=file]').setInputFiles({name:'foto teste.png',mimeType:'image/png',buffer:png});
 await until(async()=>(await onDisk(id)).tree.children[2].images?.length===1,'imagem não salva');
 const src=(await onDisk(id)).tree.children[2].images[0].src;assert.match(src,/^presentations\/cidades-para-pessoas\/assets\/foto-teste-.*\.png$/);
 assert.equal((await page.request.get(`${base}/${src}`)).status(),200);
 assert.equal(await page.locator('[data-id="community"] .image-button img').count(),1);

 // EDIT-11: editor de diagramas Mermaid
 await page.locator('[data-id="community"] .toggle').click();
 await page.locator('[data-id="community-1"] [aria-label^="Adicionar diagrama"]').click();
 const modal=page.locator('#diagram-editor');await modal.waitFor();
 await page.locator('#diagram-preview svg').waitFor({timeout:30000});
 assert.equal(await page.locator('#diagram-apply').isEnabled(),true);
 await page.locator('#diagram-source').fill('flowchart LR\n  X[Entrada] --> Y[Saída]');
 await page.locator('#diagram-preview svg').filter({hasText:'Entrada'}).waitFor({timeout:30000});
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
 await page.locator('[data-id="community-1"] [aria-label^="Adicionar diagrama"]').click();
 await page.locator('#diagram-preview svg').waitFor({timeout:30000});
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
 await page.locator('[data-id="community-2"] [aria-label^="Adicionar link"]').click();
 await until(async()=>(await onDisk(id)).tree.children[2].children[1].links?.[0]?.url==='https://example.com/docs','link não salvo');
 assert.equal(await page.locator('[data-id="community-2"] .link-chip a').getAttribute('href'),'https://example.com/docs');
 promptAnswer='javascript:alert(1)';
 await page.locator('[data-id="community-2"] [aria-label^="Adicionar link"]').click();
 await new Promise(r=>setTimeout(r,700));
 assert.equal((await onDisk(id)).tree.children[2].children[1].links.length,1); // protocolo inseguro recusado
 promptAnswer='exemplo.org/guia';
 await page.locator('[data-id="community-2"] [aria-label^="Adicionar link"]').click();
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

 await page.locator('[data-id="future"] .color-input').evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));},'#00aa55'); // cor do ramo
 await until(async()=>(await onDisk(id)).tree.children[3].color==='#00aa55','cor não salva');
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
 await page.locator('[data-id="root"] [aria-label^="Adicionar filho"]').click();
 await until(async()=>(await rootKids()).length===before+1,'filho não criado');
 const imgId=(await rootKids()).at(-1).id;
 await page.locator(`[data-id="${imgId}"] input[type=file]`).setInputFiles({name:'solo.png',mimeType:'image/png',buffer:png});
 await until(async()=>(await rootKids()).at(-1).images?.length===1,'imagem do card sem título não salva');
 await page.locator(`[data-id="${imgId}"] p:not(.node-subtitle)`).fill('');
 await page.locator(`[data-id="${imgId}"] p:not(.node-subtitle)`).evaluate(e=>e.blur());
 await until(async()=>(await rootKids()).at(-1).title==='','título vazio não mantido com imagem');
 await page.locator('[data-id="root"] [aria-label^="Adicionar filho"]').click();
 await until(async()=>(await rootKids()).length===before+2,'segundo filho não criado');
 const subId=(await rootKids()).at(-1).id;
 await page.locator(`[data-id="${subId}"] .node-subtitle`).fill('Só texto secundário');
 await page.locator(`[data-id="${subId}"] p:not(.node-subtitle)`).fill('');
 await page.locator(`[data-id="${subId}"] p:not(.node-subtitle)`).evaluate(e=>e.blur());
 await until(async()=>{const n=(await rootKids()).at(-1);return n.title===''&&n.subtitle==='Só texto secundário';},'card só com subtítulo não salvo');
 await page.locator('[data-id="root"] [aria-label^="Adicionar filho"]').click();
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
 // EDIT-15: inserir pai e inserir antes
 await page.locator('[data-id="future"] .toggle').click();
 const futureKids=async()=>(await onDisk(id)).tree.children[3].children;
 await until(async()=>(await futureKids()).length===3,'filhos de future não carregados');
 const f1=(await futureKids())[0].id;
 await page.locator(`[data-id="${f1}"] [aria-label^="Inserir pai de"]`).click();
 await until(async()=>(await futureKids())[0].id!==f1&&(await futureKids())[0].children[0]?.id===f1,'pai não inserido');
 assert.equal((await futureKids()).length,3);
 const f2=(await futureKids())[1].id;
 await page.locator(`[data-id="${f2}"] [aria-label^="Inserir antes de"]`).click();
 await until(async()=>(await futureKids()).length===4&&(await futureKids())[2].id===f2,'irmão antes não inserido');
 assert.equal((await futureKids())[1].children.length,0);
 // ramo de primeiro nível: o novo pai herda a cor e o ramo vira filho
 await page.locator('[data-id="future"] [aria-label^="Inserir pai de"]').click();
 await until(async()=>(await onDisk(id)).tree.children[3].children[0]?.id==='future','pai do ramo não inserido');
 assert.equal((await onDisk(id)).tree.children[3].color,'#00aa55');
 assert.equal((await onDisk(id)).tree.children[3].children[0].color,undefined);
 assert.equal(await page.locator('[data-id="root"] [aria-label^="Inserir pai de"]').count(),0); // raiz não tem pai

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
 await page.locator('[data-id="root"] [aria-label^="Adicionar filho"]').click();await page.keyboard.type('Primeira ideia');await page.keyboard.press('Enter');
 await until(async()=>(await onDisk('minha-apresentacao')).tree.children[0]?.title==='Primeira ideia','ideia não salva');
 await page.locator('#doc-button').click();await page.locator('#doc-list button[data-id="cidades-para-pessoas"]').click();
 await until(async()=>(await page.locator('#doc-title').textContent())==='E se a cidade fosse feita para as pessoas?','troca de apresentação');
 assert.equal((await onDisk(id)).tree.children[0].title,'Mobilidade urbana');

 await page.locator('#doc-button').click();await page.locator('#doc-delete').click(); // EDIT-10: excluir apresentação
 await until(async()=>!(await readdir(dir)).includes('cidades-para-pessoas.json'),'arquivo não removido');
 await until(async()=>(await page.locator('#doc-title').textContent())==='Minha apresentação','apresentação restante não aberta');

 const traversal=await page.request.get(`${base}/presentations/..%2fserver.mjs`);assert.equal(traversal.status(),404); // segurança básica
 assert.equal((await page.request.get(`${base}/server.mjs`)).status(),404);
 assert.deepEqual(errors,[]);console.log('PASS EDIT-01..17');
}finally{await browser.close();server.kill();await rm(dir,{recursive:true,force:true});}
