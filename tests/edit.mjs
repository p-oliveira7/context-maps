import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=await mkdtemp(path.join(tmpdir(),'response-maps-'));
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
 await until(async()=>(await onDisk(id)).tree.children[2].image,'imagem não salva');
 const src=(await onDisk(id)).tree.children[2].image.src;assert.match(src,/^presentations\/cidades-para-pessoas\/assets\/foto-teste-.*\.png$/);
 assert.equal((await page.request.get(`${base}/${src}`)).status(),200);
 assert.equal(await page.locator('[data-id="community"] .image-button img').count(),1);

 await page.locator('[data-id="future"] .color-input').evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));},'#00aa55'); // cor do ramo
 await until(async()=>(await onDisk(id)).tree.children[3].color==='#00aa55','cor não salva');

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
 assert.deepEqual(errors,[]);console.log('PASS EDIT-01..10');
}finally{await browser.close();server.kill();await rm(dir,{recursive:true,force:true});}
