// Cliente de API no painel dividido: coleções, ambientes e segredos, envio pelo servidor local, edição salva com Ctrl+S.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-api-'));
const port=4196,base=`http://127.0.0.1:${port}`,collections=path.join(work,'collections');

// API alvo: devolve o que recebeu
const seen=[];
const target=createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);
 const body=Buffer.concat(chunks).toString();
 seen.push({method:req.method,url:req.url,headers:req.headers,body});
 if(req.url.startsWith('/slow')){setTimeout(()=>{res.end('late');},5000);return;}
 if(req.url.startsWith('/binary')){res.writeHead(200,{'content-type':'application/octet-stream'});return res.end(Buffer.from([1,2,3,4]));}
 res.writeHead(req.url.startsWith('/missing')?404:200,{'content-type':'application/json','x-echo':'1'});
 res.end(JSON.stringify({method:req.method,url:req.url,headers:req.headers,body}));
});
await new Promise(r=>target.listen(0,'127.0.0.1',r));
const host=`http://127.0.0.1:${target.address().port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONFIG:'',CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const browser=await launch();
try{
 // coleção de exemplo: ambiente com um segredo e duas requests
 await call('POST','/collections',{name:'Demo'});
 await call('PUT','/collections/demo/environments/local',{vars:[{name:'host',value:host,enabled:true},{name:'token',value:'SEGREDO-XYZ',secret:true,enabled:true}]});
 const list=await call('POST','/collections/demo/items',{type:'request',name:'Listar',method:'get',url:'{{host}}/users?page=1'});
 const first=await call('GET',`/collections/demo/request?path=${list.path}`);
 first.authMode='bearer';first.bearer={token:'{{token}}'};first.headers=[{name:'X-Custom',value:'abc',enabled:true},{name:'X-Off',value:'no',enabled:false}];
 await fetch(`${base}/api/collections/demo/request?path=${list.path}`,{method:'PUT',headers:H,body:JSON.stringify(first)});
 await call('POST','/collections/demo/items',{type:'request',name:'Outra',method:'get',url:'{{host}}/other'});

 const ctx=await browser.newContext({locale:'pt-BR',viewport:{width:1400,height:800},extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?15000:6000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // trocar de coleção ou renomear com alterações abertas pergunta antes: aqui escolhemos "Não salvar"
 const ddOpen=async id=>{ // o card mostra só o símbolo da API; ao clicar, a lista de pastas e requests
  await page.locator(`[data-id="${id}"] .api-dd`).click();
  const pop=page.locator('.api-dd-pop');await pop.locator('.api-dd-item').first().waitFor();return pop;
 };
 const discardUnsaved=async()=>{const d=page.locator('.api-unsaved-card');try{await d.waitFor({timeout:1000});await d.getByRole('button',{name:'Não salvar'}).click();await d.waitFor({state:'detached'});}catch{}};
 await page.goto(base);await page.locator('.node').first().waitFor();

 // API-01: o botão divide a tela (mapa à esquerda, painel à direita) e fecha com Esc
 const mapWidth=async()=>(await page.locator('#viewport').boundingBox()).width;
 const full=await mapWidth();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#api-panel').getAttribute('role'),'complementary');
 const half=await mapWidth();assert.ok(half<full*0.6&&half>full*0.4,`o mapa deveria ocupar ~metade (${half} de ${full})`);
 const tb=await page.locator('.toolbar').boundingBox();assert.ok(tb.x+tb.width<=half+2,'a barra de ferramentas deve ficar sobre o mapa');
 await page.waitForFunction(()=>document.activeElement?.closest('#api-panel')); // o foco entra no painel
 await page.keyboard.press('Escape');await page.locator('#api-panel').waitFor({state:'hidden'});assert.equal(await mapWidth(),full);
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});

 // API-02: árvore, ambiente e envio com variáveis, auth e cabeçalhos
 await page.locator('.api-row-name',{hasText:'Listar'}).click();
 await page.locator('.api-req-title strong',{hasText:'Listar'}).waitFor();assert.equal(await page.locator('.api-url').inputValue(),'{{host}}/users?page=1');
 await page.locator('#api-panel select[aria-label="Ambiente"]').selectOption('local');
 await page.locator('.api-send').click();
 await page.locator('.api-status strong',{hasText:'200'}).waitFor();
 const echoed=JSON.parse(await page.locator('.api-resp-body').textContent());
 assert.equal(echoed.url,'/users?page=1');assert.equal(echoed.headers.authorization,'Bearer SEGREDO-XYZ');assert.equal(echoed.headers['x-custom'],'abc');
 assert.equal('x-off' in echoed.headers,false); // cabeçalho desligado não é enviado
 assert.match(await page.locator('.api-response').textContent(),/ms/);
 await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Cabeçalhos'}).click();
 assert.match(await page.locator('.api-resp-body').textContent(),/x-echo: 1/);

 // API-03: editar a URL sincroniza os parâmetros e salva no arquivo .bru com Ctrl+S
 await page.locator('.api-url').fill('{{host}}/users?page=1&limit=5');
 await page.locator('#api-tab-params').click();
 assert.equal(await page.locator('.api-kv-row input[type=text]').nth(2).inputValue(),'limit');
 const file=path.join(collections,'demo','listar.bru');
 await page.keyboard.press('ControlOrMeta+s'); // as requests só são gravadas com Ctrl+S
 for(let i=0;i<40&&!(await readFile(file,'utf8')).includes('limit=5');i++)await new Promise(r=>setTimeout(r,100));
 const saved=await readFile(file,'utf8');
 assert.ok(saved.includes('url: {{host}}/users?page=1&limit=5')&&saved.includes('limit: 5'),saved);
 assert.ok(saved.includes('auth:bearer {\n  token: {{token}}\n}')&&saved.includes('~X-Off: no'));

 // API-04: nova request pela interface, corpo JSON com variável da request e variável embutida
 await page.locator('.api-tree-tools button[aria-label="Nova request"]').click();
 await page.locator('#api-newreq-name').fill('Criar item');await page.keyboard.press('Enter'); // a janela de nova request
 await page.locator('.api-row-name',{hasText:'Criar item'}).waitFor();
 await page.locator('.api-req-title strong',{hasText:'Criar item'}).waitFor(); // a request nova abre no editor
 await page.locator('#api-panel .api-method-select').selectOption('post');
 await page.locator('.api-url').fill('{{host}}/echo');
 await page.locator('#api-tab-body').click();await page.locator('#api-tabpanel select').selectOption('json');
 await page.locator('.api-textarea').fill('{"id": {{id}}, "when": "{{$isoTimestamp}}"}');
 await page.locator('#api-tab-vars').click();await page.locator('.api-add').first().click();
 const inputs=page.locator('.api-kv-row input[type=text]');await inputs.nth(0).fill('id');await inputs.nth(1).fill('7');
 await page.locator('.api-send').click();
 await page.locator('.api-status strong',{hasText:'200'}).waitFor().catch(async e=>{throw new Error(`${e.message}
--- resposta: ${await page.locator('.api-response').textContent()}
--- seen: ${JSON.stringify(seen.at(-1))}`);});
 await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Corpo'}).click(); // a aba escolhida (Cabeçalhos) continua entre respostas
 const echoed2=JSON.parse(await page.locator('.api-resp-body').textContent());
 assert.equal(echoed2.method,'POST');assert.equal(echoed2.headers['content-type'],'application/json');
 const sent=JSON.parse(echoed2.body);assert.equal(sent.id,7);assert.match(sent.when,/^\d{4}-\d\d-\d\dT/);

 // API-05: editor de ambientes: o segredo vai para o arquivo local, não para o .bru
 await page.locator('#api-panel button[aria-label="Editar ambientes"]').click();
 await page.locator('.api-modal').waitFor();
 await page.locator('.api-modal button',{hasText:'Adicionar variável'}).click();
 const envInputs=page.locator('.api-modal .api-env-table input[type=text],.api-modal .api-env-table input[type=password]');
 const count=await envInputs.count();
 await page.locator('.api-modal .api-env-table .api-kv-row').last().locator('input').nth(1).fill('apiKey');
 await page.locator('.api-modal .api-env-table .api-kv-row').last().locator('input').nth(2).fill('CHAVE-999');
 await page.locator('.api-modal .api-env-table .api-kv-row').last().locator('input[type=checkbox]').nth(1).check();
 void count;
 await page.locator('.api-modal button.primary').click();await page.locator('.api-modal').waitFor({state:'detached'});
 const envFile=await readFile(path.join(collections,'demo','environments','local.bru'),'utf8');
 assert.ok(envFile.includes('vars:secret [\n  token,\n  apiKey\n]')&&!envFile.includes('SEGREDO-XYZ')&&!envFile.includes('CHAVE-999'),envFile);
 assert.ok((await readFile(path.join(collections,'.secrets','demo.json'),'utf8')).includes('CHAVE-999'));

 // API-06: erros (conexão recusada, tempo esgotado via cancelamento) e respostas 404/binárias
 await page.locator('.api-row-name',{hasText:'Outra'}).click();
 await page.locator('.api-req-title strong',{hasText:'Outra'}).waitFor(); // espera o editor trocar de request
 await page.locator('.api-url').fill('http://127.0.0.1:1/x');await page.locator('.api-send').click();
 await page.locator('.api-status.is-error').waitFor().catch(async e=>{throw new Error(`${e.message}
--- resposta: ${await page.locator('.api-response').innerHTML()}
--- url: ${await page.locator('.api-url').inputValue()}
--- btn: ${await page.locator('.api-send').textContent()}`);});assert.match(await page.locator('.api-status').textContent(),/falhou/i);
 await page.locator('.api-url').fill('{{host}}/missing');await page.locator('.api-send').click();
 await page.locator('.api-status.is-warn strong',{hasText:'404'}).waitFor();
 await page.locator('.api-url').fill('{{host}}/binary');await page.locator('.api-send').click();
 await page.locator('.api-resp-body',{hasText:'binária'}).waitFor();
 await page.locator('.api-url').fill('{{host}}/slow');await page.locator('.api-send').click();
 await page.locator('.api-send',{hasText:'Cancelar'}).click();
 await page.locator('.api-status.is-error',{hasText:/Cancelada/}).waitFor();

 // API-07: renomear, reordenar arrastando e excluir
 page.once('dialog',d=>d.accept('Primeira'));
 await page.locator('.api-row',{hasText:'Listar'}).hover();
 await page.locator('.api-row',{hasText:'Listar'}).locator('button[aria-label^="Renomear"]').click();
 await discardUnsaved(); // há alterações não salvas na aba dela
 await page.locator('.api-row-name',{hasText:'Primeira'}).waitFor();
 const order=async()=>(await call('GET','/collections/demo')).tree.map(i=>i.name);
 assert.deepEqual(await order(),['Primeira','Outra','Criar item']);
 await page.locator('.api-row',{hasText:'Criar item'}).dragTo(page.locator('.api-row',{hasText:'Primeira'}),{targetPosition:{x:20,y:3}});
 for(let i=0;i<30&&(await order())[0]!=='Criar item';i++)await new Promise(r=>setTimeout(r,100));
 assert.equal((await order())[0],'Criar item');
 await page.waitForTimeout(600); // a árvore se redesenha depois de reordenar
 page.once('dialog',d=>d.accept());
 await page.locator('.api-row',{hasText:'Outra'}).hover();
 await page.locator('.api-row',{hasText:'Outra'}).locator('button[aria-label^="Excluir"]').click();
 for(let i=0;i<30&&(await order()).includes('Outra');i++)await new Promise(r=>setTimeout(r,100));
 assert.equal((await order()).includes('Outra'),false);

 // API-08: largura do painel por teclado e persistência; fechar libera o mapa
 const w0=(await page.locator('#api-panel').boundingBox()).width;
 await page.locator('.api-resizer').focus();await page.keyboard.press('ArrowLeft');
 assert.ok((await page.locator('#api-panel').boundingBox()).width>w0+20);
 await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
 await page.locator('#api-panel').waitFor({state:'hidden'});assert.equal(await mapWidth(),full);

 // API-10: anexar coleções e pastas a um card (arrastar do painel ou pela roda), tile como imagem, texto e HTML exportado
 {
  await call('POST','/collections',{name:'Grupo API'});
  const folder=await call('POST','/collections/grupo-api/items',{type:'folder',name:'Pedidos'});
  await call('POST','/collections/grupo-api/items',{type:'request',parent:folder.path,name:'Listar pedidos',method:'get',url:'{{host}}/orders'});
  await call('POST','/collections/grupo-api/items',{type:'request',parent:folder.path,name:'Criar pedido',method:'post',url:'{{host}}/orders'});
  await call('POST','/collections/grupo-api/items',{type:'request',name:'Saúde',method:'get',url:'{{host}}/health'});
  const doc={title:'Com API',roots:[{id:'r',title:'Sistema',children:[{id:'c1',title:'Pedidos',children:[]},{id:'c2',title:'Saúde',children:[]}]}]};
  const made=await call('POST','/presentations',{title:'Com API'});
  await call('PUT',`/presentations/${made.id}`,doc);
  await page.goto(`${base}/?p=${made.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();
  await page.locator('#edit-switch').click();
  await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('#api-panel select[aria-label="Coleção"]').selectOption('grupo-api');
  await discardUnsaved();
  await page.locator('.api-row[data-path="pedidos"]').waitFor();
  // arrastar a pasta do painel para o card
  await page.locator('.api-row[data-path="pedidos"]').dragTo(page.locator('[data-id="c1"]'));
  await page.locator('[data-id="c1"] .api-dd').waitFor();
  assert.equal(await page.locator('[data-id="c1"] .api-tile').count(),0); // não é mais um bloco grande
  assert.equal(await page.locator('[data-id="c1"] .api-dd').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('[data-id="c1"] .api-dd').locator('svg path').getAttribute('d'),await page.locator('#api-btn svg path').getAttribute('d')); // o mesmo símbolo do botão API do rodapé
  let pop=await ddOpen('c1');
  assert.equal(await page.locator('[data-id="c1"] .api-dd').getAttribute('aria-expanded'),'true');
  assert.deepEqual(await pop.locator('.api-dd-item.is-folder .api-dd-name').allTextContents(),['Pedidos']);
  assert.deepEqual(await pop.locator('.api-dd-item.is-request .api-dd-name').allTextContents(),['Listar pedidos','Criar pedido']);
  assert.equal(await page.evaluate(()=>document.activeElement.closest('.api-dd-pop')!==null),true); // o foco entra na lista
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent.includes('Listar pedidos')),true);
  await page.keyboard.press('Escape');await pop.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('api-dd')),true); // o foco volta ao símbolo
  const saved=async id=>JSON.parse(await readFile(path.join(work,'presentations',`${id}.json`),'utf8'));
  for(let i=0;i<40&&!(await saved(made.id)).roots[0].children[0].apis;i++)await new Promise(r=>setTimeout(r,100));
  const ref=(await saved(made.id)).roots[0].children[0].apis[0];
  assert.deepEqual([ref.collection,ref.path,ref.name],['grupo-api','pedidos','Pedidos']);
  assert.deepEqual(ref.snapshot.requests.map(r=>r.name),['Listar pedidos','Criar pedido']); // resumo guardado para uso offline
  assert.deepEqual(ref.snapshot.items.map(i=>[i.type,i.name]),[['request','Listar pedidos'],['request','Criar pedido']]); // e a lista do dropdown
  // pela roda de ações: a faixa avisa o alvo e o ⤓ da coleção anexa
  await page.locator('[data-id="c2"]').hover();await page.locator('[data-id="c2"] .edit-fab').click();
  await page.locator('#radial-menu [aria-label^="Anexar ao card"]').click();
  await page.locator('.api-attach-banner').waitFor({state:'visible'});assert.match(await page.locator('.api-attach-banner').textContent(),/Saúde/);
  await page.locator('.api-collection-row .api-attach').click();
  await page.locator('[data-id="c2"] .api-dd').waitFor();assert.equal(await page.locator('.api-attach-banner').isVisible(),false);
  pop=await ddOpen('c2');assert.equal(await pop.locator('.api-dd-item.is-request').count(),3);assert.equal(await pop.locator('.api-dd-item.is-folder').count(),2); // a coleção e a pasta Pedidos
  await page.keyboard.press('Escape');
  // sem alvo, o ⤓ só explica o caminho
  await page.locator('.api-collection-row .api-attach').click();
  await page.locator('#toast-text',{hasText:/roda do card/}).waitFor();
  // clicar no tile (modo exibição) abre o cliente de API na pasta
  await page.locator('#edit-switch').click();
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
  pop=await ddOpen('c1');
  await pop.locator('.api-dd-item.is-folder').first().click(); // a pasta: abre o cliente nela
  await pop.waitFor({state:'detached'});
  await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('.api-row.is-active,.api-row[aria-expanded=true]',{hasText:'Pedidos'}).waitFor();
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
  pop=await ddOpen('c1');
  await pop.locator('.api-dd-item.is-request',{hasText:'Listar pedidos'}).click(); // a request: abre o cliente já nela
  await page.locator('.api-req-title strong',{hasText:'Listar pedidos'}).waitFor();
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
  // clicar fora fecha a lista, e mexer no mapa também
  pop=await ddOpen('c1');await page.mouse.click(5,5);await pop.waitFor({state:'detached'});
  pop=await ddOpen('c1');await page.mouse.move(400,400);await page.mouse.wheel(0,40);await pop.waitFor({state:'detached'});
  // modo texto lista a API
  await page.locator('#mode').click();assert.match(await page.locator('.reading-api').first().textContent(),/API: Pedidos \(2 requests\)/);await page.locator('#mode').click();
  // HTML exportado: o tile aparece com o resumo, sem servidor, e não é um botão
  const html=await (await page.request.get(`${base}/api/presentations/${made.id}/export?format=html`)).text();
  const exported=path.join(work,'exportado-api.html');await (await import('node:fs/promises')).writeFile(exported,html);
  const offline=await ctx.browser().newContext({locale:'pt-BR',viewport:{width:1400,height:800},offline:true});
  const off=await offline.newPage();const offErrors=[];off.on('pageerror',e=>offErrors.push(e.message));
  await off.goto(`file:///${exported.replaceAll(String.fromCharCode(92),'/')}`);await off.locator('.node').first().waitFor();await off.locator('#expand').click();
  await off.locator('[data-id="c1"] .api-dd').click();
  await off.locator('.api-dd-pop .api-dd-name',{hasText:'Listar pedidos'}).waitFor();
  assert.equal(await off.locator('.api-dd-pop button.api-dd-item').count(),0);assert.equal(await off.locator('.api-dd-note.is-offline').count(),0); // só leitura: nada é clicável
  assert.equal(await off.locator('#api-btn').isVisible(),false);
  assert.deepEqual(offErrors,[]);await offline.close();
  // remover o tile e desfazer/refazer; excluir a coleção deixa o tile avisando
  await page.locator('#edit-switch').click();
  await page.locator('[data-id="c2"] .api-item').hover();await page.locator('[data-id="c2"] .api-item .image-tools button').click();
  await page.locator('[data-id="c2"] .api-dd').waitFor({state:'detached'});
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;document.activeElement?.blur();});
  await page.keyboard.press('Control+z');await page.locator('[data-id="c2"] .api-dd').waitFor();
  await call('DELETE','/collections/grupo-api');
  await page.reload();await page.locator('.node').first().waitFor();await page.locator('#expand').click();
  pop=await ddOpen('c1');await pop.locator('.api-dd-note.is-offline').waitFor(); // coleção apagada: a lista guardada continua, avisando
  assert.equal(await pop.locator('.api-dd-item.is-request').count(),2);
  assert.equal((await fetch(`${base}/api/presentations/${made.id}`,{method:'PUT',headers:H,body:JSON.stringify({title:'x',roots:[{id:'r',title:'r',children:[],apis:[{collection:'../x'}]}]})})).status,400); // referência inválida é recusada
  await call('DELETE',`/presentations/${made.id}`);
  await page.goto(base);await page.locator('.node').first().waitFor();
 }
 // API-11: scripts (pré, pós, testes), asserts e variáveis pós-resposta, executados no sandbox
 {
  await call('POST','/collections',{name:'Scripts'});
  await call('PUT','/collections/scripts/environments/local',{vars:[{name:'host',value:host,enabled:true}]});
  const made=await call('POST','/collections/scripts/items',{type:'request',name:'Com scripts',method:'post',url:'{{host}}/echo'});
  const model=await call('GET',`/collections/scripts/request?path=${made.path}`);
  Object.assign(model,{
   bodyMode:'json',body:{json:'{"n": {{n}}}'},headers:[{name:'X-Stamp',value:'{{stamp}}',enabled:true}],varsPre:[{name:'n',value:'5',enabled:true}],
   varsPost:[{name:'got',value:'res.body.headers.x-stamp',enabled:true},{name:'literal',value:'fixo-{{n}}',enabled:true}],
   assertions:[{name:'res.status',value:'eq 200',enabled:true},{name:'res.body.method',value:'eq POST',enabled:true},{name:'res.headers.x-echo',value:'eq 1',enabled:true},{name:'res.body.url',value:'eq /echo',enabled:true},{name:'res.status',value:'eq 404',enabled:true}],
   scriptPre:"req.setHeader('X-Run','pre');\nbru.setVar('stamp','42');\nconsole.log('pre-request ok');",
   scriptPost:"bru.setVar('seen', res.body.method);\nconsole.warn('post-response', res.status);",
   tests:"test('status is 200', () => { expect(res.status).to.equal(200); });\ntest('echo has the stamp', () => { expect(res('headers.x-stamp')).to.equal('42'); });\ntest('this one fails', () => { expect(res.body.method).to.equal('GET'); });"
  });
  assert.equal((await fetch(`${base}/api/collections/scripts/request?path=${made.path}`,{method:'PUT',headers:H,body:JSON.stringify(model)})).status,200);
  await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('#api-panel select[aria-label="Coleção"]').selectOption('scripts');
  await discardUnsaved();
  await page.locator('.api-row-name',{hasText:'Com scripts'}).click();
  await page.locator('.api-req-title strong',{hasText:'Com scripts'}).waitFor();
  const before=seen.length;
  await page.locator('.api-send').click();
  await page.locator('.api-status strong',{hasText:'200'}).waitFor();
  const got=seen.slice(before).at(-1);
  assert.equal(got.headers['x-run'],'pre');assert.equal(got.headers['x-stamp'],'42'); // a variável criada pelo script vale na mesma request
  assert.equal(JSON.parse(got.body).n,5);
  assert.match(await page.locator('.api-status').textContent(),/✗ 6\/8 passaram/); // 4 de 5 asserts + 2 de 3 testes
  await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Testes'}).click();
  const tests=page.locator('.api-tests');
  await tests.locator('li.is-pass',{hasText:'res.status eq 200'}).waitFor();
  assert.equal(await tests.locator('li.is-fail').count(),2);
  assert.match(await tests.locator('li.is-fail',{hasText:'eq 404'}).textContent(),/expected res\.status \(200\) to eq 404/);
  assert.match(await tests.locator('li.is-fail',{hasText:'this one fails'}).textContent(),/expected "POST" to equal "GET"/);
  await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Console'}).click();
  const consoleText=await page.locator('.api-console').textContent();
  assert.match(consoleText,/\[pre-request\] pre-request ok/);assert.match(consoleText,/\[post-response\] post-response 200/);
  // variáveis de execução ficam visíveis na aba Variáveis
  await page.locator('#api-tab-vars').click();
  const runtime=await page.locator('#api-tabpanel .api-pre').first().textContent();
  assert.match(runtime,/stamp = 42/);assert.match(runtime,/got = 42/);assert.match(runtime,/literal = fixo-5/);assert.match(runtime,/seen = POST/);
  // desligar "Scripts": o request sai sem o cabeçalho do pré-script e sem testes de script (os asserts declarativos continuam)
  await page.locator('.api-scripts-toggle input').uncheck();
  const mark=seen.length;
  await page.locator('.api-send').click();
  await page.locator('.api-status strong',{hasText:'200'}).waitFor();
  assert.equal('x-run' in seen.slice(mark).at(-1).headers,false);
  assert.match(await page.locator('.api-status').textContent(),/4\/5 passaram/);
  await page.locator('.api-scripts-toggle input').check();
  // editar os scripts pela interface grava os blocos no .bru
  await page.locator('#api-tab-scripts').click();
  await page.locator('#api-tabpanel textarea').first().fill("req.setHeader('X-Edited','yes');");
  const scriptFile=path.join(collections,'scripts','com-scripts.bru');
  await page.keyboard.press('ControlOrMeta+s');
  for(let i=0;i<40&&!(await readFile(scriptFile,'utf8')).includes('X-Edited');i++)await new Promise(r=>setTimeout(r,100));
  const bru=await readFile(scriptFile,'utf8');
  assert.ok(bru.includes("script:pre-request {\n  req.setHeader('X-Edited','yes');\n}")&&bru.includes('assert {\n  res.status: eq 200')&&bru.includes('vars:post-response {'),bru);
  // módulo não disponível: o erro aparece no console e o envio acontece mesmo assim
  await page.locator('#api-tabpanel textarea').first().fill("require('lodash');");
  await page.locator('.api-send').click();
  await page.locator('.api-status strong',{hasText:'200'}).waitFor();
  await page.locator('.api-resp-tabs button[role=tab]',{hasText:/Console/}).click();
  assert.match(await page.locator('.api-console').textContent(),/Erro no script \(pre-request\).*not available in the sandbox/);
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
  await page.locator('#api-panel').waitFor({state:'hidden'});
 }
 // API-12: {{variáveis}} coloridas (vermelho sem valor, verde com valor), painel ao passar o mouse e edição do valor
 {
  await call('POST','/collections',{name:'Vars'});
  await call('PUT','/collections/vars/environments/dev',{vars:[{name:'host',value:host,enabled:true},{name:'key',value:'SECRET1',secret:true,enabled:true}]});
  const made=await call('POST','/collections/vars/items',{type:'request',name:'Com variáveis',method:'get',url:'{{host}}/v?a={{missing}}&k={{key}}&t={{$timestamp}}'});
  const model=await call('GET',`/collections/vars/request?path=${made.path}`);
  Object.assign(model,{headers:[{name:'X-Req',value:'{{reqVar}}',enabled:true},{name:'X-Ghost',value:'{{ghost}}',enabled:true}],varsPre:[{name:'reqVar',value:'rv',enabled:true}],bodyMode:'json',body:{json:'{"x":"{{nope}}"}'}});
  assert.equal((await fetch(`${base}/api/collections/vars/request?path=${made.path}`,{method:'PUT',headers:H,body:JSON.stringify(model)})).status,200);
  await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('#api-panel select[aria-label="Coleção"]').selectOption('vars');
  await discardUnsaved();
  await page.locator('.api-row-name',{hasText:'Com variáveis'}).click();
  await page.locator('.api-req-title strong',{hasText:'Com variáveis'}).waitFor();
  const urlVars=page.locator('.api-urlbar .api-var');
  await urlVars.first().waitFor();
  const kinds=async()=>Object.fromEntries(await urlVars.evaluateAll(els=>els.map(e=>[e.dataset.name,e.className.replace('api-var ','')])));
  assert.deepEqual(await kinds(),{host:'is-defined',missing:'is-undefined',key:'is-defined','$timestamp':'is-dynamic'});
  const color=name=>urlVars.filter({hasText:`{{${name}}}`}).evaluate(e=>getComputedStyle(e).color);
  assert.equal(await color('missing'),'rgb(229, 115, 115)');assert.equal(await color('host'),'rgb(111, 207, 151)'); // vermelho e verde
  const scrollUrl=toEnd=>page.evaluate(end=>{const el=document.querySelector('.api-url');el.scrollLeft=end?el.scrollWidth:0;el.dispatchEvent(new Event('scroll'));},toEnd); // campos estreitos escondem parte da URL
  const hover=async(locator,{end=false}={})=>{await scrollUrl(end);const b=await locator.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);};
  const pop=page.locator('.api-var-pop');

  // passar o mouse em uma variável com valor mostra o valor e deixa editar (salva no ambiente)
  await hover(urlVars.filter({hasText:'{{host}}'}));await pop.waitFor();
  assert.match(await pop.locator('.api-var-pop-head').textContent(),/\{\{host\}\}.*Ambiente/);
  assert.equal(await pop.locator('input').inputValue(),host);
  await pop.locator('input').fill(`${host}/`);await pop.getByRole('button',{name:'Salvar'}).click();
  await pop.waitFor({state:'detached'});
  assert.match(await readFile(path.join(collections,'vars','environments','dev.bru'),'utf8'),new RegExp(`host: ${host.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/`));
  assert.equal((await kinds()).host,'is-defined');

  // sem valor: o painel avisa e escolhe onde guardar; ao salvar na request a variável fica verde
  await page.mouse.move(5,5);await pop.waitFor({state:'detached'});
  await hover(urlVars.filter({hasText:'{{missing}}'}));await pop.waitFor();
  assert.match(await pop.locator('.api-var-pop-head').textContent(),/Sem valor ainda/);
  assert.equal(await pop.locator('select').inputValue(),'env'); // com ambiente escolhido, o padrão é o ambiente
  await pop.locator('select').selectOption('request');await pop.locator('input').fill('xyz');await pop.getByRole('button',{name:'Salvar'}).click();
  await pop.waitFor({state:'detached'});
  assert.equal((await kinds()).missing,'is-defined');
  await page.keyboard.press('ControlOrMeta+s');
  for(let i=0;i<40&&!(await readFile(path.join(collections,'vars','com-variaveis.bru'),'utf8')).includes('missing: xyz');i++)await new Promise(r=>setTimeout(r,100));
  assert.match(await readFile(path.join(collections,'vars','com-variaveis.bru'),'utf8'),/vars:pre-request \{\n  reqVar: rv\n  missing: xyz\n\}/);
  const mark=seen.length;
  await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
  const sentUrl=seen.slice(mark).at(-1);assert.match(sentUrl.url,/^\/\/v\?a=xyz&k=SECRET1&t=\d+$/); // host terminava em "/", daí "//v"
  assert.equal(sentUrl.headers['x-req'],'rv');

  // segredo: o valor vem escondido, dá para mostrar e editar; o arquivo do ambiente continua sem o valor
  await page.mouse.move(5,5);await pop.waitFor({state:'detached'});
  await hover(urlVars.filter({hasText:'{{key}}'}),{end:true});await pop.waitFor();
  assert.equal(await pop.locator('input').getAttribute('type'),'password');
  await pop.getByRole('button',{name:'Mostrar'}).click();assert.equal(await pop.locator('input').getAttribute('type'),'text');
  assert.equal(await pop.locator('input').inputValue(),'SECRET1');
  await pop.locator('input').fill('SECRET2');await pop.getByRole('button',{name:'Salvar'}).click();await pop.waitFor({state:'detached'});
  assert.ok(!(await readFile(path.join(collections,'vars','environments','dev.bru'),'utf8')).includes('SECRET'));
  assert.ok((await readFile(path.join(collections,'.secrets','vars.json'),'utf8')).includes('SECRET2'));

  // variável embutida: informa que é dinâmica
  await page.mouse.move(5,5);await pop.waitFor({state:'detached'});
  await hover(urlVars.filter({hasText:'{{$timestamp}}'}),{end:true});await pop.waitFor();
  assert.match(await pop.textContent(),/Embutida.*Gerada a cada envio/);
  await page.mouse.move(5,5);await pop.waitFor({state:'detached'});

  // teclado: Ctrl+. com o cursor dentro da variável abre o painel já no valor; Esc fecha e devolve o foco
  const urlInput=page.locator('.api-url');await urlInput.focus();
  await urlInput.evaluate(el=>{const at=el.value.indexOf('{{missing}}')+3;el.setSelectionRange(at,at);});
  await page.keyboard.press('Control+.');await pop.waitFor();
  await page.waitForFunction(()=>document.activeElement?.closest('.api-var-pop')!==null);
  await page.keyboard.press('Escape');await pop.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('api-url')),true);

  // cabeçalhos, corpo e digitação: o destaque acompanha o texto
  await page.locator('#api-tab-headers').click();
  const headerVars=page.locator('#api-tabpanel .api-var');
  assert.deepEqual(await headerVars.evaluateAll(els=>els.map(e=>[e.dataset.name,e.className.replace('api-var ','')])),[['reqVar','is-defined'],['ghost','is-undefined']]);
  await page.locator('#api-tab-body').click();
  assert.equal(await page.locator('#api-tabpanel .api-var.is-undefined').first().textContent(),'{{nope}}');
  await page.locator('.api-textarea').focus();await page.keyboard.press('Control+End');await page.keyboard.type(' {{reqVar}}');
  await page.waitForFunction(()=>[...document.querySelectorAll('#api-tabpanel .api-var')].some(e=>e.textContent==='{{reqVar}}'&&e.classList.contains('is-defined')));

  // trocar para "sem ambiente" deixa as variáveis do ambiente vermelhas; voltar deixa verdes
  await page.locator('#api-panel select[aria-label="Ambiente"]').selectOption('');
  await page.waitForFunction(()=>document.querySelector('.api-urlbar .api-var[data-name="host"]')?.classList.contains('is-undefined'));
  await page.locator('#api-panel select[aria-label="Ambiente"]').selectOption('dev');
  await page.waitForFunction(()=>document.querySelector('.api-urlbar .api-var[data-name="host"]')?.classList.contains('is-defined'));
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
  await page.locator('#api-panel').waitFor({state:'hidden'});
 }
 // API-13: abrir pelo card mantém zoom e foco do mapa, expande só o alvo e destaca a linha; request avulsa também pode ser anexada
 {
  await call('POST','/collections',{name:'Foco'});
  const fa=await call('POST','/collections/foco/items',{type:'folder',name:'Alfa'});
  const fb=await call('POST','/collections/foco/items',{type:'folder',name:'Beta'});
  await call('POST','/collections/foco/items',{type:'request',parent:fa.path,name:'Alfa um',method:'get',url:'{{host}}/a1'});
  await call('POST','/collections/foco/items',{type:'request',parent:fa.path,name:'Alfa dois',method:'get',url:'{{host}}/a2'});
  const b1=await call('POST','/collections/foco/items',{type:'request',parent:fb.path,name:'Beta um',method:'post',url:'{{host}}/b1'});
  await call('POST','/collections/foco/items',{type:'request',name:'Raiz solta',method:'get',url:'{{host}}/root'});
  const pres=await call('POST','/presentations',{title:'Foco API'});
  const apis=ref=>[{collection:'foco',path:ref.path,name:ref.name}];
  const doc={title:'Foco API',roots:[{id:'r',title:'Sistema',children:[
   {id:'k1',title:'Pasta Alfa',apis:apis({path:fa.path,name:'Alfa'}),children:[]},
   {id:'k2',title:'Request Beta',children:[]},
   {id:'k3',title:'Coleção toda',apis:[{collection:'foco',path:'',name:'Foco'}],children:[]}]}]};
  await call('PUT',`/presentations/${pres.id}`,doc);
  await page.goto(`${base}/?p=${pres.id}`);await page.locator('.node').first().waitFor();await page.locator('#expand').click();await page.waitForTimeout(500);
  await page.locator('#edit-switch').click();

  // anexar uma request avulsa pelo ⤓ da linha (a roda de ações do card k2 define o alvo)
  await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('#api-panel select[aria-label="Coleção"]').selectOption('foco');
  await discardUnsaved();
  await page.locator('[data-id="k2"]').hover();await page.locator('[data-id="k2"] .edit-fab').click();
  await page.locator('#radial-menu [aria-label^="Anexar ao card"]').click();
  await page.locator('.api-row',{hasText:'Beta um'}).hover();
  await page.locator('.api-row',{hasText:'Beta um'}).locator('.api-attach').click();
  await page.locator('[data-id="k2"] .api-dd').waitFor();
  const popB=await ddOpen('k2');assert.match(await popB.textContent(),/Beta um/);assert.equal(await popB.locator('.api-dd-item.is-request').count(),1);
  await page.keyboard.press('Escape');
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();await page.locator('#api-panel').waitFor({state:'hidden'});
  await page.locator('#edit-switch').click();await page.waitForTimeout(400);
  const saved=async()=>JSON.parse(await readFile(path.join(work,'presentations',`${pres.id}.json`),'utf8'));
  for(let i=0;i<40&&!(await saved()).roots[0].children[1].apis;i++)await new Promise(r=>setTimeout(r,100));
  assert.deepEqual((await saved()).roots[0].children[1].apis.map(a=>[a.collection,a.path,a.name]),[['foco',b1.path,'Beta um']]);

  // clicar no card da pasta: o zoom do mapa não muda, o card continua visível e só a pasta Alfa abre, piscando
  const zoom=()=>page.locator('#zoom-level').textContent();
  const z0=await zoom();
  const inMap=async id=>{const b=await page.locator(`[data-id="${id}"]`).boundingBox(),w=(await page.locator('#viewport').boundingBox()).width;return b.x>=0&&b.x+b.width<=w+1;};
  await ddOpen('k1');await page.locator('.api-dd-pop .api-dd-item').first().click();
  await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('.api-row[data-path="alfa"].is-flash').waitFor();
  await page.waitForTimeout(700);
  assert.equal(await zoom(),z0,'abrir o painel não deve trocar o zoom');
  assert.equal(await inMap('k1'),true,'o card clicado continua visível');
  assert.equal(await page.locator('.api-row',{hasText:'Alfa um'}).count(),1); // Alfa aberta
  assert.equal(await page.locator('.api-row',{hasText:'Beta um'}).count(),0);  // Beta fechada
  await page.locator('.api-row[data-path="alfa"].is-flash').waitFor({state:'detached',timeout:5000}); // o destaque some sozinho

  // request avulsa: abre a pasta dela (e só ela), seleciona e destaca a request
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();await page.locator('#api-panel').waitFor({state:'hidden'});
  await page.waitForTimeout(600);assert.equal(await zoom(),z0);
  await ddOpen('k2');await page.locator('.api-dd-pop .api-dd-item').first().click();
  await page.locator('#api-panel').waitFor({state:'visible'});
  const row=page.locator('.api-row',{hasText:'Beta um'});
  await row.waitFor();await page.locator('.api-row[aria-selected=true]',{hasText:'Beta um'}).waitFor();
  assert.equal(await row.evaluate(el=>el.classList.contains('is-flash')||getComputedStyle(el).animationName.includes('api-flash')),true);
  assert.equal(await page.locator('.api-row',{hasText:'Alfa um'}).count(),0);
  assert.equal(await page.locator('.api-req-title strong',{hasText:'Beta um'}).count(),1);
  await page.waitForTimeout(500);assert.equal(await zoom(),z0);
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();await page.locator('#api-panel').waitFor({state:'hidden'});

  // coleção inteira: as pastas de primeiro nível abrem e o cabeçalho da coleção pisca
  await ddOpen('k3');await page.locator('.api-dd-pop .api-dd-item').first().click();
  await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('.api-collection-row.is-flash').waitFor();
  assert.equal(await page.locator('.api-row',{hasText:'Alfa um'}).count(),1);assert.equal(await page.locator('.api-row',{hasText:'Beta um'}).count(),1);
  await page.waitForTimeout(600);assert.equal(await zoom(),z0);
  assert.equal(await inMap('k3'),true);

  // pelo botão API (sem card) o zoom também fica, e o conteúdo acompanha a nova largura
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();await page.locator('#api-panel').waitFor({state:'hidden'});
  await page.waitForTimeout(600);
  await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});await page.waitForTimeout(600);
  assert.equal(await zoom(),z0);
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();await page.locator('#api-panel').waitFor({state:'hidden'});
  await call('DELETE',`/presentations/${pres.id}`);
  await page.goto(base);await page.locator('.node').first().waitFor();
 }
 // API-09: o proxy só aceita http/https e exige o cabeçalho do app
 assert.equal((await fetch(`${base}/api/send`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:`${host}/x`})})).status,403);
 assert.equal((await fetch(`${base}/api/send`,{method:'POST',headers:H,body:JSON.stringify({url:'file:///etc/passwd'})})).status,400);
 assert.equal((await fetch(`${base}/api/send`,{method:'POST',headers:H,body:JSON.stringify({url:`${host}/x`,method:'TRACE'})})).status,400);
 assert.equal((await fetch(`${base}/api/send`,{headers:H})).status,405);
 assert.equal(seen.some(s=>s.url==='/x'),false);
 assert.equal(existsSync(path.join(collections,'.secrets')),true);
 // API-14: o painel abre um pouco abaixo do topo (o topo da tela fica livre) e a altura se ajusta pela borda de CIMA: arrastar, teclado, Home, duplo clique volta ao padrão, e a escolha é lembrada
 if(!(await page.locator('#api-panel').isVisible())){await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});}
 const vh=()=>page.evaluate(()=>{const r=document.querySelector('#api-panel').getBoundingClientRect();return {panel:r.height,top:r.top,bottom:r.bottom,win:innerHeight,short:document.body.classList.contains('api-short'),viewportRight:getComputedStyle(document.querySelector('#viewport')).right};});
 let hv=await vh();assert.equal(hv.short,true);assert.ok(Math.abs(hv.top-56)<4,`abre com 56px livres no topo (${hv.top})`);assert.ok(hv.bottom>=hv.win-1,'ancorado embaixo');assert.notEqual(hv.viewportRight,'0px','o mapa continua ao lado');
 const grip=await page.locator('.api-resizer-v').boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,420,{steps:8});await page.mouse.up();
 hv=await vh();assert.ok(Math.abs(hv.top-420)<12,`a borda de cima seguiu o arrasto (${hv.top})`);assert.ok(hv.bottom>=hv.win-1);
 assert.equal(await page.locator('#api-panel .api-head').isVisible(),true);
 await page.locator('.api-resizer-v').focus();await page.keyboard.press('End');
 hv=await vh();assert.ok(hv.panel>=219&&hv.panel<=225,`altura mínima (${hv.panel})`);
 await page.keyboard.press('ArrowUp');hv=await vh();assert.ok(hv.panel>255&&hv.panel<265,`seta para cima aumenta (${hv.panel})`);
 await page.keyboard.press('ArrowDown');hv=await vh();assert.ok(hv.panel>=219&&hv.panel<=225,'seta para baixo diminui');
 await page.keyboard.press('ArrowUp');
 await page.reload();await page.locator('.node').first().waitFor();await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 hv=await vh();assert.ok(hv.panel>255&&hv.panel<265,`altura lembrada (${hv.panel})`);
 await page.locator('.api-resizer-v').dblclick(); // duplo clique: padrão
 hv=await vh();assert.ok(Math.abs(hv.top-56)<4,`duplo clique volta ao padrão (${hv.top})`);
 await page.locator('.api-resizer-v').focus();await page.keyboard.press('Home'); // Home: altura toda
 hv=await vh();assert.equal(hv.short,false);assert.ok(hv.panel>=hv.win-1);
 await page.locator('.api-resizer-v').dblclick();
 assert.deepEqual(errors,[]);
 console.log('PASS API-01..14 API client panel');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
