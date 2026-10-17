// Cliente de API no painel dividido: coleções, ambientes e segredos, envio pelo servidor local, edição com autosave.
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

 // API-03: editar a URL sincroniza os parâmetros e salva sozinho no arquivo .bru
 await page.locator('.api-url').fill('{{host}}/users?page=1&limit=5');
 await page.locator('#api-tab-params').click();
 assert.equal(await page.locator('.api-kv-row input[type=text]').nth(2).inputValue(),'limit');
 const file=path.join(collections,'demo','listar.bru');
 for(let i=0;i<40&&!(await readFile(file,'utf8')).includes('limit=5');i++)await new Promise(r=>setTimeout(r,100));
 const saved=await readFile(file,'utf8');
 assert.ok(saved.includes('url: {{host}}/users?page=1&limit=5')&&saved.includes('limit: 5'),saved);
 assert.ok(saved.includes('auth:bearer {\n  token: {{token}}\n}')&&saved.includes('~X-Off: no'));

 // API-04: nova request pela interface, corpo JSON com variável da request e variável embutida
 page.once('dialog',d=>d.accept('Criar item'));
 await page.locator('.api-tree-tools button[aria-label="Nova request"]').click();
 await page.locator('.api-row-name',{hasText:'Criar item'}).waitFor();
 await page.locator('.api-req-title strong',{hasText:'Criar item'}).waitFor(); // a request nova abre no editor
 await page.locator('#api-panel .api-method-select').selectOption('post');
 await page.locator('.api-url').fill('{{host}}/echo');
 await page.locator('#api-tab-body').click();await page.locator('#api-tabpanel select').selectOption('json');
 await page.locator('.api-textarea').fill('{"id": {{id}}, "when": "{{$isoTimestamp}}"}');
 await page.locator('#api-tab-vars').click();await page.locator('.api-add').click();
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
 await page.locator('.api-row-name',{hasText:'Primeira'}).waitFor();
 const order=async()=>(await call('GET','/collections/demo')).tree.map(i=>i.name);
 assert.deepEqual(await order(),['Primeira','Outra','Criar item']);
 await page.locator('.api-row',{hasText:'Criar item'}).dragTo(page.locator('.api-row',{hasText:'Primeira'}),{targetPosition:{x:20,y:3}});
 for(let i=0;i<30&&(await order())[0]!=='Criar item';i++)await new Promise(r=>setTimeout(r,100));
 assert.equal((await order())[0],'Criar item');
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
  await page.locator('.api-row[data-path="pedidos"]').waitFor();
  // arrastar a pasta do painel para o card
  await page.locator('.api-row[data-path="pedidos"]').dragTo(page.locator('[data-id="c1"]'));
  await page.locator('[data-id="c1"] .api-tile').waitFor();
  const tile=page.locator('[data-id="c1"] .api-tile');
  await tile.locator('.api-tile-req',{hasText:'Listar pedidos'}).waitFor();
  assert.match(await tile.textContent(),/Pedidos/);assert.match(await tile.textContent(),/2 requests/);
  const saved=async id=>JSON.parse(await readFile(path.join(work,'presentations',`${id}.json`),'utf8'));
  for(let i=0;i<40&&!(await saved(made.id)).roots[0].children[0].apis;i++)await new Promise(r=>setTimeout(r,100));
  const ref=(await saved(made.id)).roots[0].children[0].apis[0];
  assert.deepEqual([ref.collection,ref.path,ref.name],['grupo-api','pedidos','Pedidos']);
  assert.deepEqual(ref.snapshot.requests.map(r=>r.name),['Listar pedidos','Criar pedido']); // resumo guardado para uso offline
  // pela roda de ações: a faixa avisa o alvo e o ⤓ da coleção anexa
  await page.locator('[data-id="c2"]').hover();await page.locator('[data-id="c2"] .edit-fab').click();
  await page.locator('#radial-menu [aria-label^="Anexar ao card"]').click();
  await page.locator('.api-attach-banner').waitFor({state:'visible'});assert.match(await page.locator('.api-attach-banner').textContent(),/Saúde/);
  await page.locator('.api-collection-row .api-attach').click();
  await page.locator('[data-id="c2"] .api-tile').waitFor();assert.equal(await page.locator('.api-attach-banner').isVisible(),false);
  assert.match(await page.locator('[data-id="c2"] .api-tile').textContent(),/3 requests/);
  // sem alvo, o ⤓ só explica o caminho
  await page.locator('.api-collection-row .api-attach').click();
  await page.locator('#toast-text',{hasText:/roda do card/}).waitFor();
  // clicar no tile (modo exibição) abre o cliente de API na pasta
  await page.locator('#edit-switch').click();
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
  await page.locator('[data-id="c1"] .api-tile').click();
  await page.locator('#api-panel').waitFor({state:'visible'});
  await page.locator('.api-row.is-active,.api-row[aria-expanded=true]',{hasText:'Pedidos'}).waitFor();
  await page.locator('#api-panel button[aria-label="Fechar o cliente de API"]').click();
  // modo texto lista a API
  await page.locator('#mode').click();assert.match(await page.locator('.reading-api').first().textContent(),/API: Pedidos \(2 requests\)/);await page.locator('#mode').click();
  // HTML exportado: o tile aparece com o resumo, sem servidor, e não é um botão
  const html=await (await page.request.get(`${base}/api/presentations/${made.id}/export?format=html`)).text();
  const exported=path.join(work,'exportado-api.html');await (await import('node:fs/promises')).writeFile(exported,html);
  const offline=await ctx.browser().newContext({locale:'pt-BR',viewport:{width:1400,height:800},offline:true});
  const off=await offline.newPage();const offErrors=[];off.on('pageerror',e=>offErrors.push(e.message));
  await off.goto(`file:///${exported.replaceAll(String.fromCharCode(92),'/')}`);await off.locator('.node').first().waitFor();await off.locator('#expand').click();
  await off.locator('[data-id="c1"] .api-tile .api-tile-req',{hasText:'Listar pedidos'}).waitFor();
  assert.equal(await off.locator('[data-id="c1"] button.api-tile').count(),0);assert.equal(await off.locator('#api-btn').isVisible(),false);
  assert.deepEqual(offErrors,[]);await offline.close();
  // remover o tile e desfazer/refazer; excluir a coleção deixa o tile avisando
  await page.locator('#edit-switch').click();
  await page.locator('[data-id="c2"] .api-item').hover();await page.locator('[data-id="c2"] .api-item .image-tools button').click();
  await page.locator('[data-id="c2"] .api-tile').waitFor({state:'detached'});
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;document.activeElement?.blur();});
  await page.keyboard.press('Control+z');await page.locator('[data-id="c2"] .api-tile').waitFor();
  await call('DELETE','/collections/grupo-api');
  await page.reload();await page.locator('.node').first().waitFor();await page.locator('#expand').click();
  await page.locator('[data-id="c1"] .api-tile-foot',{hasText:/não encontrada|saved snapshot|resumo salvo/}).waitFor();
  assert.equal((await fetch(`${base}/api/presentations/${made.id}`,{method:'PUT',headers:H,body:JSON.stringify({title:'x',roots:[{id:'r',title:'r',children:[],apis:[{collection:'../x'}]}]})})).status,400); // referência inválida é recusada
  await call('DELETE',`/presentations/${made.id}`);
  await page.goto(base);await page.locator('.node').first().waitFor();
 }
 // API-09: o proxy só aceita http/https e exige o cabeçalho do app
 assert.equal((await fetch(`${base}/api/send`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:`${host}/x`})})).status,403);
 assert.equal((await fetch(`${base}/api/send`,{method:'POST',headers:H,body:JSON.stringify({url:'file:///etc/passwd'})})).status,400);
 assert.equal((await fetch(`${base}/api/send`,{method:'POST',headers:H,body:JSON.stringify({url:`${host}/x`,method:'TRACE'})})).status,400);
 assert.equal((await fetch(`${base}/api/send`,{headers:H})).status,405);
 assert.equal(seen.some(s=>s.url==='/x'),false);
 assert.equal(existsSync(path.join(collections,'.secrets')),true);
 assert.deepEqual(errors,[]);
 console.log('PASS API-01..10 API client panel');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
