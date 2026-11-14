// Sessões do Claude Code nos cards: importar uma sessão da máquina (trecho + ponto de abertura), miniatura,
// abrir a conversa na janela lateral no ponto marcado, ver a pergunta feita à pessoa com a resposta, trocar o ponto.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
import {sessionFromSvg} from '../session-core.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-ss-'));
const port=4206,base=`http://127.0.0.1:${port}`,sessionsDir=path.join(work,'claude-projects');
await mkdir(path.join(sessionsDir,'C--projetos-loja'),{recursive:true});
await copyFile(path.join(here,'fixtures','session-sample.jsonl'),path.join(sessionsDir,'C--projetos-loja','sessao-1.jsonl'));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),COLLECTIONS_DIR:path.join(work,'collections'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json'),CLAUDE_PROJECTS_DIR:sessionsDir},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const browser=await launch();
try{
 // SESS-01: a API lista e lê as sessões só com o cabeçalho do app (são conversas privadas)
 assert.equal((await fetch(`${base}/api/sessions`)).status,403);
 const listed=await call('GET','/sessions');
 assert.deepEqual(listed.sessions.map(s=>[s.project,s.id,s.title]),[['C--projetos-loja','sessao-1','Mapa do fluxo de pedidos']]);
 assert.equal((await fetch(`${base}/api/sessions/C--projetos-loja/nao-existe`,{headers:H})).status,404);

 const made=await call('POST','/presentations',{title:'Sessões'});
 await call('PUT',`/presentations/${made.id}`,{title:'Sessões',roots:[{id:'r',title:'Skills',children:[{id:'c1',title:'Mapa de pedidos',children:[]}]}]});
 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?30000:15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?p=${made.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();
 await page.locator('#edit-switch').click();await page.locator('#fit').click();
 const card=async()=>JSON.parse(await readFile(path.join(work,'presentations',`${made.id}.json`),'utf8')).roots[0].children[0];
 const stored=async()=>sessionFromSvg(await readFile(path.join(work,(await card()).images[0].src),'utf8'));

 // SESS-02: "Session" no menu do card abre a janela com as sessões da máquina; escolher uma mostra a conversa
 await page.locator('[data-id="c1"]').hover();await page.locator('[data-id="c1"] .edit-fab').click();
 await page.locator('#radial-menu [aria-label^="Add a Claude session"]').click();
 const dlg=page.locator('.ss-modal');await dlg.waitFor();
 const add=dlg.getByRole('button',{name:'Add to card'});assert.equal(await add.isDisabled(),true);
 await dlg.locator('.ss-session',{hasText:'Mapa do fluxo de pedidos'}).click();
 await dlg.locator('.ss-item').first().waitFor();
 assert.equal(await dlg.locator('.ss-item').count(),14);
 assert.equal(await dlg.locator('.ss-title').inputValue(),'Mapa do fluxo de pedidos');
 assert.match(await dlg.locator('.ss-info').textContent(),/Whole session: 14 items/);
 // a pergunta feita à pessoa aparece com as opções, e as escolhidas marcadas
 const ask=dlg.locator('.ss-item.ss-ask');
 assert.deepEqual(await ask.locator('.ss-q-title').allTextContents(),['Qual fluxo você quer mapear primeiro?','Quais resultados de erro entram no fluxograma?']);
 assert.deepEqual(await ask.locator('li.is-picked b').allTextContents(),['Criar pedido (Recommended)','401 Unauthorized','412 Precondition Failed']);
 assert.equal(await ask.locator('li').count(),6);
 // há um segredo num comando: a opção de ocultar aparece marcada
 assert.match(await dlg.locator('.ss-mask').textContent(),/secret \(1 item\)/);assert.equal(await dlg.locator('.ss-mask input').isChecked(),true);

 // SESS-03: trecho (da skill até o curl) e ponto de abertura na pergunta; adicionar salva um arquivo só (miniatura + transcrição)
 const pick=async(sel,button)=>{await dlg.locator(sel).first().click({position:{x:12,y:8}});await dlg.locator('.ss-bar button',{hasText:button}).click();};
 await pick('.ss-item.ss-tool.is-skill','Start here');
 await pick('.ss-item.ss-ask','Open here');
 await dlg.locator('.ss-item.ss-tool',{hasText:'Conferir a resposta real'}).click({position:{x:12,y:8}});await dlg.locator('.ss-bar button',{hasText:'End here'}).click();
 assert.match(await dlg.locator('.ss-info').textContent(),/Excerpt: 8 items/);
 assert.equal(await dlg.locator('.ss-item.is-out').count(),6);assert.equal(await dlg.locator('.ss-item.is-anchor').getAttribute('data-i'),'4');
 await dlg.locator('.ss-title').fill('Skill context-maps em uso');
 await add.click();await dlg.waitFor({state:'detached'});
 for(let i=0;i<60&&!(await card()).images?.length;i++)await new Promise(r=>setTimeout(r,100));
 const entry=(await card()).images[0];
 assert.deepEqual([entry.kind,entry.title,entry.anchor],['session','Skill context-maps em uso',2]);assert.match(entry.src,/\.svg$/);assert.equal(entry.session,undefined);
 const saved=await stored();
 assert.deepEqual(saved.session.items.map(i=>i.k),['tool','assistant','ask','plan','assistant','tool','tool','tool']);assert.equal(saved.anchor,2);
 assert.match(saved.session.items[7].input,/Bearer •••/);assert.doesNotMatch(JSON.stringify(saved),/eyJhbGci/);
 const thumb=await (await fetch(`${base}/${entry.src}`)).text();assert.match(thumb,/Skill context-maps em uso/);assert.match(thumb,/✓ Criar pedido/);
 assert.equal(await page.locator('[data-id="c1"] .image-button.is-session').count(),1);

 // SESS-04: clicar no card abre a conversa na janela lateral, já no ponto marcado (a pergunta), com as ferramentas recolhidas
 await page.locator('#edit-switch').click();
 await page.locator('[data-id="c1"] .image-button.is-session').click();
 const viewer=page.locator('.ss-viewer');await viewer.locator('.ss-item').first().waitFor();
 assert.equal((await viewer.locator('.oa-head strong').textContent()).trim(),'Skill context-maps em uso');
 assert.equal(await viewer.locator('.ss-item').count(),8);
 const anchorRow=viewer.locator('.ss-item.is-anchor');assert.equal(await anchorRow.getAttribute('data-i'),'2');assert.equal(await anchorRow.evaluate(e=>e.classList.contains('ss-ask')),true);
 await page.waitForFunction(()=>{const l=document.querySelector('.ss-viewer .ss-list'),a=l.querySelector('.is-anchor');const r=a.getBoundingClientRect(),lr=l.getBoundingClientRect();return r.top>=lr.top-2&&r.top<lr.top+80;});
 assert.deepEqual(await viewer.locator('.ss-ask li.is-picked b').allTextContents(),['Criar pedido (Recommended)','401 Unauthorized','412 Precondition Failed']);
 assert.equal(await viewer.locator('.ss-tool.is-skill .ss-tool-name').textContent(),'★ Skill');
 assert.equal(await viewer.locator('.ss-tool details[open]').count(),0);
 // rolar para cima mostra o que veio antes; abrir uma ferramenta mostra a entrada e o resultado
 await viewer.locator('.ss-list').evaluate(e=>{e.scrollTop=0;});
 const read=viewer.locator('.ss-item.ss-tool',{hasText:'orders.js'});await read.locator('summary').click();
 assert.match(await read.locator('.ss-result').textContent(),/status\(412\)/);
 await viewer.locator('.dw-gear',{hasText:'Tools'}).click();assert.equal(await viewer.locator('.ss-tool details[open]').count(),4);
 await viewer.locator('.dw-toggle',{hasText:'Marked point'}).click();
 await page.waitForFunction(()=>{const l=document.querySelector('.ss-viewer .ss-list'),a=l.querySelector('.is-anchor');const r=a.getBoundingClientRect(),lr=l.getBoundingClientRect();return r.top>=lr.top-2&&r.top<lr.top+80;});
 // fica ao lado do mapa como as outras janelas laterais; Esc fecha
 assert.ok((await viewer.boundingBox()).x>=740);
 await viewer.locator('.oa-close').focus();await page.keyboard.press('Escape');await viewer.waitFor({state:'detached'});

 // SESS-05: "Change" no modo de edição reabre a sessão guardada para trocar o ponto de abertura (sem importar de novo)
 await page.locator('#edit-switch').click();
 await page.locator('.image-tools button',{hasText:'Change'}).click();await dlg.waitFor();
 await dlg.locator('.ss-item').first().waitFor();
 assert.equal(await dlg.locator('.ss-item').count(),8);assert.equal(await dlg.locator('.ss-sessions').count(),0);
 assert.equal(await dlg.locator('.ss-item.is-anchor').getAttribute('data-i'),'2');
 await dlg.locator('.ss-item.ss-tool',{hasText:'orders.js'}).dblclick({position:{x:12,y:8}}); // duplo clique: abrir aqui
 await dlg.getByRole('button',{name:'Save'}).click();await dlg.waitFor({state:'detached'});
 for(let i=0;i<60&&(await card()).images[0].anchor!==5;i++)await new Promise(r=>setTimeout(r,100));
 assert.equal((await card()).images[0].anchor,5);assert.equal((await card()).images.length,1);
 assert.equal((await stored()).session.items.length,8);

 // SESS-06: um arquivo .jsonl escolhido à mão também serve (sem passar pelo servidor)
 await page.locator('[data-id="c1"]').hover();await page.locator('[data-id="c1"] .edit-fab').click();
 await page.locator('#radial-menu [aria-label^="Add a Claude session"]').click();await dlg.waitFor();
 await dlg.locator('input[type=file]').setInputFiles(path.join(here,'fixtures','session-sample.jsonl'));
 await dlg.locator('.ss-item').nth(13).waitFor();
 await add.click();await dlg.waitFor({state:'detached'});
 for(let i=0;i<60&&(await card()).images.length<2;i++)await new Promise(r=>setTimeout(r,100));
 assert.deepEqual((await card()).images.map(i=>[i.kind,i.anchor]),[['session',5],['session',0]]);

 assert.deepEqual(errors,[]);
 console.log('PASS SESS-01..06 Claude sessions on cards: list, import an excerpt with an opening point, thumbnail, side viewer with the questions asked, change the point');
}finally{await browser.close();server.kill();await rm(work,{recursive:true,force:true});}
