// Executar pastas no cliente de API (run e run recursivo) com relatório interativo, e importar pastas no formato Bruno pela interface.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-run-'));
const port=4197,base=`http://127.0.0.1:${port}`;

// API alvo: /login devolve um token, /me só aceita esse token, /fail devolve 500, /slow demora
const seen=[];
const target=createServer((req,res)=>{
 seen.push({method:req.method,url:req.url,auth:req.headers.authorization||''});
 const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(req.url==='/slow'){setTimeout(()=>send(200,{slow:true}),4000);return;}
 if(req.url==='/login')return send(200,{token:'abc'});
 if(req.url==='/me')return req.headers.authorization==='Bearer abc'?send(200,{me:true}):send(401,{error:'no token'});
 if(req.url==='/fail')return send(500,{error:'boom'});
 send(200,{ok:true,url:req.url});
});
await new Promise(r=>target.listen(0,'127.0.0.1',r));
const host=`http://127.0.0.1:${target.address().port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
// cria uma request já com a configuração pedida
async function add(parent,name,url,patch={}){
 const made=await call('POST','/collections/suite/items',{type:'request',parent,name,method:patch.method||'get',url});
 const model=await call('GET',`/collections/suite/request?path=${encodeURIComponent(made.path)}`);
 await call('PUT',`/collections/suite/request?path=${encodeURIComponent(made.path)}`,{...model,...patch});
 return made.path;
}
const status200=[{name:'res.status',value:'eq 200',enabled:true}];
const browser=await launch();
try{
 await call('POST','/collections',{name:'Suite'});
 await call('PUT','/collections/suite/environments/local',{vars:[{name:'host',value:host,enabled:true}]});
 await add('','Health','{{host}}/health',{assertions:status200});
 const users=await call('POST','/collections/suite/items',{type:'folder',name:'Users'});
 await add('users','Login','{{host}}/login',{method:'post',assertions:status200,bodyMode:'json',body:{json:'{"user":"ana"}'},varsPost:[{name:'token',value:'res.body.token',enabled:true}]});
 await add('users','Me','{{host}}/me',{assertions:status200,headers:[{name:'Authorization',value:'Bearer {{token}}',enabled:true}]});
 const admin=await call('POST','/collections/suite/items',{type:'folder',name:'Admin',parent:users.path});
 await add(admin.path,'Ban','{{host}}/fail',{method:'post',assertions:status200});
 await add('users','Broken','http://127.0.0.1:1/unreachable',{assertions:status200});
 const slow=await call('POST','/collections/suite/items',{type:'folder',name:'Slowpoke'});
 await add(slow.path,'Slow one','{{host}}/slow');
 await add(slow.path,'Never reached','{{host}}/health');

 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},acceptDownloads:true,permissions:['clipboard-read','clipboard-write'],extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?15000:7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 await page.locator('.api-row-name',{hasText:'Users'}).waitFor();
 const rows=()=>page.locator('.api-run-item');
 const meta=()=>page.locator('.api-run-meta');
 const finished=()=>page.locator('.api-run.is-ok, .api-run.is-bad').waitFor();
 const runFolder=async(folder,label)=>{ // os botões aparecem ao passar o mouse na linha da pasta
  const row=page.locator('.api-row',{hasText:folder}).first();await row.hover();
  await row.getByRole('button',{name:`${label}: ${folder}`}).click();
 };
 const chip=name=>page.locator('.api-run-chip',{hasText:name});

 // RUN-01: executar a pasta e as subpastas, em ordem, com as variáveis passando de uma request para a seguinte
 await runFolder('Users','Run this folder and its subfolders');
 await page.locator('.api-run').waitFor();await finished();
 assert.match(await meta().textContent(),/With subfolders/);assert.match(await meta().textContent(),/Environment: local/);
 assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Login','Me','Ban','Broken']);
 assert.deepEqual(await page.locator('.api-run-item').evaluateAll(els=>els.map(e=>e.className.match(/is-(passed|failed|error)/)[1])),['passed','passed','failed','error']);
 assert.deepEqual(seen.map(s=>s.url),['/login','/me','/fail']);assert.equal(seen[1].auth,'Bearer abc'); // o token do Login chegou ao Me
 assert.equal(await page.locator('.api-run-tile',{hasText:'passed'}).locator('strong').textContent(),'2/4');
 assert.equal(await page.locator('.api-run-tile',{hasText:'failed'}).locator('strong').textContent(),'1');
 assert.equal(await page.locator('.api-run-tile',{hasText:'errors'}).locator('strong').textContent(),'1');
 assert.equal(await page.locator('.api-run.is-bad').count(),1);
 assert.deepEqual(await page.locator('.api-run-group').allTextContents(),['🗂 Users','📁 admin','🗂 Users']); // agrupado por pasta
 assert.match(await page.locator('.api-run [role=status]').textContent(),/Finished: 2\/4 passed, 1 failed, 1 with errors/);

 // RUN-02: só esta pasta (sem subpastas)
 seen.length=0;
 await page.locator('.api-run-actions button[aria-label="Close the report"]').click();
 await page.locator('.api-run').waitFor({state:'detached'});
 await runFolder('Users','Run this folder');
 await finished();
 assert.match(await meta().textContent(),/This folder only/);
 assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Login','Me','Broken']); // sem a Ban, que está na subpasta
 assert.deepEqual(seen.map(s=>s.url),['/login','/me']);

 // RUN-03: executar a coleção inteira pelo menu e filtrar o relatório
 seen.length=0;
 await page.locator('.api-menu-wrap button[aria-haspopup=menu]').click();
 await page.locator('.api-menu button',{hasText:'Run collection'}).click();
 // a pasta Slowpoke demora 4 s: espera chegar nela e pára a execução
 await page.locator('.api-run-item.is-running',{hasText:'Slow one'}).waitFor();
 await page.locator('.api-run-actions button',{hasText:'Stop'}).click();
 await finished();
 assert.match(await meta().textContent(),/Cancelled/);
 assert.deepEqual(await page.locator('.api-run-item').evaluateAll(els=>els.map(e=>e.className.match(/is-(passed|failed|error|skipped)/)[1])),['passed','passed','passed','failed','error','skipped','skipped']);
 assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Health','Login','Me','Ban','Broken','Slow one','Never reached']);
 assert.equal(await page.locator('.api-run-actions button',{hasText:'Stop'}).isVisible(),false);
 assert.equal(await page.locator('.api-run-actions button',{hasText:'Run again'}).isVisible(),true);
 assert.equal((await meta().textContent()).includes('Cancelled'),true);
 await chip('Failed').click();assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Ban']);
 assert.equal(await chip('Failed').getAttribute('aria-pressed'),'true');
 await chip('Errors').click();assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Broken']);
 await chip('Passed').click();assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Health','Login','Me']);
 await chip('All').click();
 await page.locator('.api-run-filters input[type=search]').fill('log');assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Login']);
 await page.locator('.api-run-filters input[type=search]').fill('zzz');assert.equal(await page.locator('.api-run-list .api-empty-small').count(),1);
 await page.locator('.api-run-filters input[type=search]').fill('');

 // RUN-04: detalhes de uma request que falhou
 const ban=page.locator('.api-run-item',{hasText:'Ban'});
 await ban.locator('.api-run-item-main').click();
 assert.equal(await ban.locator('.api-run-item-main').getAttribute('aria-expanded'),'true');
 assert.match(await ban.locator('.api-run-sent').textContent(),new RegExp(`POST ${host.replace(/[.]/g,'\\.')}/fail`));
 assert.match(await ban.locator('.api-run-checks li.is-fail').textContent(),/res\.status eq 200/);
 assert.match(await ban.locator('.api-run-checks li.is-fail').textContent(),/expected res\.status \(500\) to eq 200/);
 assert.equal(await ban.locator('.api-resp-body').isVisible(),true); // o corpo da resposta já aparece aberto
 assert.match(await ban.locator('.api-resp-body').textContent(),/boom/);
 assert.match(await ban.locator('.api-run-respline').textContent(),/^500 /);
 assert.equal(await ban.locator('.api-req-body').count(),0); // a Ban não envia corpo
 assert.equal(await ban.locator('.api-resp-headers').isVisible(),false); // cabeçalhos ficam recolhidos
 const login=page.locator('.api-run-item',{hasText:'Login'});
 await login.locator('.api-run-item-main').click();
 assert.equal(await login.locator('.api-req-body').isVisible(),true); // corpo enviado visível, formatado
 assert.match(await login.locator('.api-req-body').textContent(),/"user": "ana"/);
 assert.match(await login.locator('.api-resp-body').textContent(),/"token": "abc"/);
 await login.locator('summary',{hasText:'Request headers'}).click();assert.match(await login.locator('.api-req-headers').textContent(),/content-type: application\/json/i);
 await login.locator('.api-run-item-main').click();
 const broken=page.locator('.api-run-item',{hasText:'Broken'});
 await broken.locator('.api-run-item-main').click();assert.equal(await broken.locator('.api-run-error').count(),1);
 await ban.locator('.api-run-item-main').click();assert.equal(await ban.locator('.api-run-detail').count(),0); // fecha de novo

 // RUN-05: a barra de progresso tem um trecho por request e leva até a linha
 const segs=page.locator('.api-run-seg');
 assert.equal(await segs.count(),7);
 assert.deepEqual(await segs.evaluateAll(els=>els.map(e=>e.className.match(/is-(\w+)/)[1])),['passed','passed','passed','failed','error','skipped','skipped']);
 await chip('Passed').click();
 await segs.nth(3).click(); // volta para "Todas" e abre a Ban
 assert.equal(await chip('All').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.api-run-item',{hasText:'Ban'}).locator('.api-run-item-main').getAttribute('aria-expanded'),'true');
 assert.equal(await page.evaluate(()=>document.activeElement.closest('.api-run-item')?.textContent.includes('Ban')),true);

 // RUN-06: executar de novo só as que falharam
 seen.length=0;
 await page.locator('.api-run-actions button',{hasText:'Run failed only'}).click();
 await finished();
 assert.deepEqual(seen.map(s=>s.url),['/fail']); // a Ban de novo; a Broken não chega ao alvo
 assert.deepEqual(await page.locator('.api-run-item').evaluateAll(els=>els.map(e=>e.className.match(/is-(passed|failed|error|skipped)/)[1])),['passed','passed','passed','failed','error','skipped','skipped']); // o resto fica como estava
 // ...e só uma request pelo detalhe
 seen.length=0;
 await page.locator('.api-run-item',{hasText:'Health'}).locator('.api-run-item-main').click();
 await page.locator('.api-run-item',{hasText:'Health'}).getByRole('button',{name:'Run only this'}).click();
 await finished();assert.deepEqual(seen.map(s=>s.url),['/health']);

 // RUN-07: parar na primeira falha e repetir com intervalo
 seen.length=0;
 await page.locator('.api-run-options input[type=checkbox]').check();
 await page.locator('.api-run-actions button',{hasText:'Run again'}).click();
 await finished();
 assert.match(await meta().textContent(),/Stopped at the first failure/);
 assert.deepEqual(seen.map(s=>s.url),['/health','/login','/me','/fail']); // pára depois da Ban
 assert.deepEqual(await segs.evaluateAll(els=>els.map(e=>e.className.match(/is-(\w+)/)[1])),['passed','passed','passed','failed','skipped','skipped','skipped']);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cm-api-run')).stopOnFail),true); // lembra a opção
 await page.locator('.api-run-options input[type=checkbox]').uncheck();
 await page.locator('.api-run-options input[type=number]').fill('300');await page.locator('.api-run-options input[type=number]').blur();

 // RUN-08: relatório em JSON e resumo copiado (sem corpos nem cabeçalhos)
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.api-run-actions button',{hasText:'Export JSON'}).click()]);
 assert.equal(download.suggestedFilename(),'suite-report.json');
 const report=JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(),'utf8'));
 assert.equal(report.title,'Suite');assert.equal(report.environment,'local');assert.equal(report.status,'stopped');
 assert.deepEqual([report.summary.total,report.summary.passed,report.summary.failed,report.summary.skipped],[7,3,1,3]);
 assert.deepEqual(report.requests.map(r=>r.status),['passed','passed','passed','failed','skipped','skipped','skipped']);
 assert.equal(JSON.stringify(report).includes('boom'),false);
 await page.locator('.api-run-actions button',{hasText:'Copy summary'}).click();
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 assert.match(copied,/^Suite: 3\/7 passed, 1 failed, 0 with errors/);assert.match(copied,/✗ POST Ban \(500,/);

 // RUN-09: abrir a request pelo relatório e voltar ao relatório pelo cabeçalho
 await page.locator('.api-run-item',{hasText:'Ban'}).locator('.api-run-item-main').click();
 await page.locator('.api-run-item',{hasText:'Ban'}).getByRole('button',{name:'Open request'}).click();
 await page.locator('.api-url').waitFor();assert.equal(await page.locator('.api-url').inputValue(),'{{host}}/fail');
 assert.equal(await page.locator('.api-run').count(),0);
 await page.locator('.api-tab-report .api-tab-main').click();
 await page.locator('.api-run').waitFor();assert.equal(await page.locator('.api-run-item').count(),7); // o relatório continua o mesmo

 // RUN-10: o Stop cancela a request em andamento sem esperar a resposta
 seen.length=0;
 await page.locator('.api-row',{hasText:'Slowpoke'}).hover();
 await page.locator('.api-row',{hasText:'Slowpoke'}).getByRole('button',{name:'Run this folder: Slowpoke'}).click();
 await page.locator('.api-run-item.is-running').waitFor();
 const t0=Date.now();
 await page.locator('.api-run-actions button',{hasText:'Stop'}).click();await finished();
 assert.ok(Date.now()-t0<3000,'Stop cancela a request em andamento sem esperar os 4 s');
 assert.deepEqual(await page.locator('.api-run-item-name').allTextContents(),['Slow one','Never reached']);
 assert.deepEqual(await page.locator('.api-run-item').evaluateAll(els=>els.map(e=>e.className.match(/is-(passed|failed|error|skipped)/)[1])),['skipped','skipped']);
 assert.equal(await page.locator('.api-row',{hasText:'Slowpoke'}).count(),1);
 await page.locator('.api-run-actions button[aria-label="Close the report"]').click();

 // RUN-12: a execução usa o que está aberto nas abas, mesmo sem salvar (o arquivo não muda)
 await page.locator('.api-req-title strong',{hasText:'Ban'}).waitFor();
 await page.locator('.api-url').fill('{{host}}/health?unsaved=1');
 seen.length=0;
 await runFolder('Users','Run this folder and its subfolders');await finished();
 assert.deepEqual(seen.map(s=>s.url),['/login','/me','/health?unsaved=1']);
 assert.equal((await call('GET','/collections/suite/request?path=users/admin/ban.bru')).url,'{{host}}/fail');
 await page.locator('.api-run-actions button[aria-label="Close the report"]').click();
 await page.keyboard.press('ControlOrMeta+s');await page.locator('.api-tab-dirty').waitFor({state:'detached'}); // salva para seguir

 // RUN-11: importar uma pasta do Bruno pela interface (coleção completa e pasta solta dentro da coleção aberta)
 const dir=path.join(work,'incoming');
 const bru=(name,url)=>`meta {\n  name: ${name}\n  type: http\n  seq: 1\n}\n\nget {\n  url: ${url}\n}\n\nassert {\n  res.status: eq 200\n}\n`;
 const bruno=path.join(dir,'Imported Shop');await mkdir(path.join(bruno,'cart'),{recursive:true});await mkdir(path.join(bruno,'environments'),{recursive:true});await mkdir(path.join(bruno,'node_modules'),{recursive:true});
 await writeFile(path.join(bruno,'bruno.json'),'{"version":"1","name":"Imported Shop","type":"collection"}');
 await writeFile(path.join(bruno,'home.bru'),bru('Home','{{host}}/home'));
 await writeFile(path.join(bruno,'cart','folder.bru'),'meta {\n  name: Cart\n  seq: 2\n}\n');
 await writeFile(path.join(bruno,'cart','add.bru'),bru('Add item','{{host}}/cart/add'));
 await writeFile(path.join(bruno,'environments','local.bru'),`vars {\n  host: ${host}\n}\n`);
 await writeFile(path.join(bruno,'node_modules','junk.bru'),bru('Junk','{{host}}/junk'));
 const folderInput=page.locator('#api-panel input[webkitdirectory]');
 await folderInput.setInputFiles(bruno);
 await page.locator('#api-panel select[aria-label="Collection"]').filter({hasText:'Imported Shop'}).waitFor();
 assert.equal(await page.locator('#api-panel select[aria-label="Collection"]').inputValue(),'imported-shop');
 assert.deepEqual(await page.locator('.api-row-name').allTextContents(),['Home','📁 Cart','Add item']); // node_modules ficou de fora
 const detail=await call('GET','/collections/imported-shop');assert.deepEqual(detail.environments,['local']);
 // e rodar a coleção importada: o ambiente local aponta para o alvo
 seen.length=0;
 await page.locator('.api-collection-row').getByRole('button',{name:/Run collection/}).click();
 await finished();
 assert.deepEqual(seen.map(s=>s.url),['/home','/cart/add']);assert.equal(await page.locator('.api-run.is-ok').count(),1);
 assert.equal(await page.locator('.api-run-tile',{hasText:'checks'}).locator('strong').textContent(),'2/2');

 const loose=path.join(dir,'Loose Folder');await mkdir(path.join(loose,'deep'),{recursive:true});
 await writeFile(path.join(loose,'one.bru'),bru('One','{{host}}/one'));await writeFile(path.join(loose,'deep','two.bru'),bru('Two','{{host}}/two'));
 await page.locator('.api-run-actions button[aria-label="Close the report"]').click();
 await folderInput.setInputFiles(loose);
 await page.locator('.api-row-name',{hasText:'Loose Folder'}).waitFor();
 assert.equal(await page.locator('#api-panel select[aria-label="Collection"]').inputValue(),'imported-shop'); // entrou na coleção aberta
 assert.deepEqual((await page.locator('.api-row-name').allTextContents()).sort(),['Add item','Home','One','📁 Cart','📁 Loose Folder','📁 deep']);
 // uma pasta sem arquivos .bru é recusada com um aviso
 const empty=path.join(dir,'Empty Dir');await mkdir(empty,{recursive:true});await writeFile(path.join(empty,'readme.txt'),'x');
 await folderInput.setInputFiles(empty);
 await page.locator('#toast',{hasText:/No Bruno files/}).waitFor();

 assert.deepEqual(errors,[]);
 console.log('PASS RUN-01..12 folder runs, report and Bruno folder import');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
