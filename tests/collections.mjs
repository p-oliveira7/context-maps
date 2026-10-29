// API de coleções (formato Bruno): CRUD, ambientes e segredos, exportar/importar ZIP, caminhos maliciosos.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readZip,writeZip} from '../zip.mjs';
import {parseBru} from '../bru.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-coll-'));
const data=path.join(work,'presentations'),collections=path.join(work,'collections'),port=4192,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:data,CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1'};
const call=(method,route,body,extra={})=>fetch(`${base}/api/collections${route}`,{method,headers:{...H,...(body&&!Buffer.isBuffer(body)?{'content-type':'application/json'}:{}),...extra},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
const json=async(method,route,body)=>{const r=await call(method,route,body);assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
try{
 // criar coleção, pasta e requests
 const made=await json('POST','',{name:'Minha API'});
 assert.equal(made.id,'minha-api');assert.ok(existsSync(path.join(collections,'minha-api','bruno.json')));
 const folder=await json('POST','/minha-api/items',{type:'folder',name:'Usuários'});
 assert.equal(folder.path,'usuarios');
 const r1=await json('POST','/minha-api/items',{type:'request',parent:'usuarios',name:'Listar usuários',method:'get',url:'{{host}}/users'});
 const r2=await json('POST','/minha-api/items',{type:'request',parent:'usuarios',name:'Criar usuário',method:'post',url:'{{host}}/users'});
 const r3=await json('POST','/minha-api/items',{type:'request',name:'Saúde',method:'get',url:'{{host}}/health'});
 assert.deepEqual([r1.path,r2.path,r3.path],['usuarios/listar-usuarios.bru','usuarios/criar-usuario.bru','saude.bru']);
 let detail=await json('GET','/minha-api');
 assert.equal(detail.name,'Minha API');
 assert.deepEqual(detail.tree.map(i=>[i.type,i.name]),[['folder','Usuários'],['request','Saúde']]);
 assert.deepEqual(detail.tree[0].children.map(i=>[i.name,i.method]),[['Listar usuários','get'],['Criar usuário','post']]);
 assert.deepEqual((await json('GET','')).map(c=>[c.id,c.requests]),[['minha-api',3]]);

 // ler, editar (com blocos que o app não edita) e gravar uma request
 const rawPath=path.join(collections,'minha-api','usuarios','criar-usuario.bru');
 const original=await readFile(rawPath,'utf8');
 const withExtras=original+'\nassert {\n  res.status: eq 201\n}\n\nscript:pre-request {\n  req.setHeader("x","1");\n}\n';
 await (await import('node:fs/promises')).writeFile(rawPath,withExtras);
 const req=await json('GET','/minha-api/request?path=usuarios/criar-usuario.bru');
 assert.equal(req.method,'post');assert.equal(req.scriptPre,'req.setHeader("x","1");');
 req.bodyMode='json';req.body={json:'{\n  "name": "Ana"\n}'};req.headers=[{name:'Content-Type',value:'application/json',enabled:true}];req.url='{{host}}/v2/users';
 assert.equal((await call('PUT','/minha-api/request?path=usuarios/criar-usuario.bru',req)).status,200);
 const saved=await readFile(rawPath,'utf8');
 assert.ok(saved.includes('assert {\n  res.status: eq 201\n}'));assert.ok(saved.includes('script:pre-request {'));assert.ok(saved.includes('body:json {\n  {\n    "name": "Ana"'));
 assert.equal(parseBru(saved).url,'{{host}}/v2/users');
 assert.equal((await call('PUT','/minha-api/request?path=usuarios/criar-usuario.bru',{name:'x',method:'FOO'})).status,400);

 // renomear e reordenar
 assert.equal((await call('PATCH','/minha-api/items',{path:'usuarios',name:'Pessoas'})).status,200);
 assert.equal((await call('PATCH','/minha-api/items',{path:'saude.bru',name:'Health check'})).status,200);
 assert.equal((await call('POST','/minha-api/reorder',{parent:'usuarios',order:['usuarios/criar-usuario.bru','usuarios/listar-usuarios.bru']})).status,200);
 detail=await json('GET','/minha-api');
 assert.deepEqual(detail.tree.map(i=>i.name),['Pessoas','Health check']);
 assert.deepEqual(detail.tree[0].children.map(i=>i.name),['Criar usuário','Listar usuários']);

 // ambientes: o valor do segredo não vai para o .bru
 assert.equal((await call('PUT','/minha-api/environments/local',{vars:[{name:'host',value:'http://localhost:3000',enabled:true},{name:'token',value:'SEGREDO-123',secret:true,enabled:true}]})).status,200);
 const envFile=await readFile(path.join(collections,'minha-api','environments','local.bru'),'utf8');
 assert.ok(envFile.includes('host: http://localhost:3000'));assert.ok(!envFile.includes('SEGREDO-123'));assert.ok(envFile.includes('vars:secret [\n  token\n]'));
 assert.ok((await readFile(path.join(collections,'.secrets','minha-api.json'),'utf8')).includes('SEGREDO-123'));
 const env=await json('GET','/minha-api/environments/local');
 assert.deepEqual(env.vars.map(v=>[v.name,v.value,v.secret]),[['host','http://localhost:3000',false],['token','SEGREDO-123',true]]);
 assert.deepEqual(await json('GET','/minha-api/environments'),['local']);

 // exportar: ZIP no formato do Bruno, sem segredos; importar cria outra coleção com nome único
 const zipRes=await call('GET','/minha-api/export');assert.equal(zipRes.status,200);
 const zipBytes=Buffer.from(await zipRes.arrayBuffer()),entries=readZip(zipBytes);
 const names=entries.map(e=>e.name).sort();
 assert.ok(names.includes('minha-api/bruno.json')&&names.includes('minha-api/saude.bru')&&names.includes('minha-api/environments/local.bru'));
 assert.equal(names.some(n=>n.includes('.secrets')),false);assert.equal(entries.some(e=>e.data.toString().includes('SEGREDO-123')),false);
 const imp=await (await call('POST','/import',zipBytes)).json();
 assert.deepEqual([imp.id,imp.name],['minha-api-2','Minha API (2)']);
 const impDetail=await json('GET','/minha-api-2');assert.deepEqual(impDetail.tree.map(i=>i.name),['Pessoas','Health check']);
 assert.deepEqual(impDetail.environments,['local']);
 assert.equal((await json('GET','/minha-api-2/environments/local')).vars.find(v=>v.name==='token').value,''); // segredo não viaja
 assert.equal((await call('POST','/import',Buffer.from('não é zip'))).status,400);
 assert.equal((await call('POST','/import',writeZip([{name:'x/leiame.md',data:Buffer.from('oi')}]))).status,400); // sem bruno.json

 // caminhos e arquivos maliciosos
 for(const bad of ['../x.bru','usuarios/../../x.bru','.secrets/minha-api.json','/etc/passwd','C:/x.bru','usuarios/.oculto.bru'])
  assert.equal((await call('GET',`/minha-api/request?path=${encodeURIComponent(bad)}`)).status,400,`deveria recusar ${bad}`);
 assert.equal((await call('DELETE','/minha-api/items?path=')).status,400); // não apaga a raiz
 assert.equal((await call('GET','/..%2fx')).status>=400,true);
 const evil=writeZip([{name:'mal/bruno.json',data:Buffer.from('{"name":"Mal"}')},{name:'mal/ok.bru',data:Buffer.from('meta {\n  name: Ok\n  type: http\n}\n\nget {\n  url: u\n}\n')},{name:'mal/../../fora.bru',data:Buffer.from('x')},{name:'mal/.env',data:Buffer.from('TOKEN=1')},{name:'mal/run.js',data:Buffer.from('process.exit()')}]);
 const evilRes=await (await call('POST','/import',evil)).json();
 assert.deepEqual((await readdir(path.join(collections,evilRes.id))).sort(),['bruno.json','ok.bru']); // só .bru/.json/.md seguros
 assert.equal(existsSync(path.join(work,'fora.bru')),false);
 assert.equal((await fetch(`${base}/api/collections`)).status,200); // leitura não exige o cabeçalho
 assert.equal((await fetch(`${base}/api/collections`,{method:'POST',headers:{'content-type':'application/json'},body:'{"name":"X"}'})).status,403); // escrita sem cabeçalho é recusada

 // importar pasta (formato Bruno): coleção inteira, pasta solta dentro da coleção aberta e pasta solta como coleção nova
 const bru=(name,seq,url)=>`meta {\n  name: ${name}\n  type: http\n  seq: ${seq}\n}\n\nget {\n  url: ${url}\n}\n`;
 const file=(p,content)=>({path:p,content});
 const demo=[file('Bruno Demo/bruno.json','{"version":"1","name":"Bruno Demo","type":"collection"}'),file('Bruno Demo/ping.bru',bru('Ping',1,'{{host}}/ping')),
  file('Bruno Demo/auth/folder.bru','meta {\n  name: Auth\n  seq: 2\n}\n'),file('Bruno Demo/auth/login.bru',bru('Login',1,'{{host}}/login')),
  file('Bruno Demo/environments/dev.bru','vars {\n  host: http://localhost:1\n}\n'),
  file('Bruno Demo/.git/config','x'),file('Bruno Demo/run.js','process.exit()'),file('Bruno Demo/../evil.bru','x'),{path:'Bruno Demo/binary.bru',content:42}];
 const demoMade=await (await call('POST','/import-folder',{files:demo})).json();
 assert.deepEqual([demoMade.id,demoMade.name],['bruno-demo','Bruno Demo']);
 const demoDetail=await json('GET','/bruno-demo');
 assert.deepEqual(demoDetail.tree.map(i=>[i.type,i.name]),[['request','Ping'],['folder','Auth']]);assert.deepEqual(demoDetail.environments,['dev']);
 assert.deepEqual((await readdir(path.join(collections,'bruno-demo'))).sort(),['auth','bruno.json','environments','ping.bru']); // .git, .js e ".." ficam de fora
 assert.equal(existsSync(path.join(work,'evil.bru')),false);
 const loose=name=>[file(`${name}/list.bru`,bru('List orders',1,'{{host}}/orders')),file(`${name}/v2/get.bru`,bru('Get order',1,'{{host}}/v2/orders/1')),file(`${name}/environments/dev.bru`,'vars {\n  x: 1\n}\n'),file(`${name}/notes.txt`,'ignored')];
 const into=await (await call('POST','/import-folder',{files:loose('Orders'),into:{collection:'bruno-demo',parent:''}})).json();
 assert.deepEqual([into.id,into.folder,into.files],['bruno-demo','orders',2]); // environments/ e .txt não entram
 let after=await json('GET','/bruno-demo');
 assert.deepEqual(after.tree.map(i=>i.name),['Ping','Auth','Orders']);
 assert.deepEqual(after.tree[2].children.map(i=>[i.type,i.name]),[['request','List orders'],['folder','v2']]);assert.deepEqual(after.environments,['dev']);
 const again=await (await call('POST','/import-folder',{files:loose('Orders'),into:{collection:'bruno-demo',parent:'auth'}})).json();
 assert.equal(again.folder,'auth/orders');
 assert.equal((await json('GET','/bruno-demo')).tree[1].children.some(i=>i.name==='Orders'),true);
 const fresh=await (await call('POST','/import-folder',{files:loose('Billing')})).json();
 assert.deepEqual([fresh.id,fresh.name,fresh.folder],['billing','Billing',undefined]);
 assert.deepEqual((await json('GET','/billing')).tree.map(i=>i.name),['List orders','v2']);assert.deepEqual((await json('GET','/billing')).environments,['dev']); // coleção nova leva o ambiente
 assert.equal((await call('POST','/import-folder',{files:[file('Docs/readme.md','x'),file('Docs/data.json','{}')]})).status,400); // sem .bru
 assert.equal((await call('POST','/import-folder',{files:[]})).status,400);assert.equal((await call('POST','/import-folder',{})).status,400);
 assert.equal((await call('POST','/import-folder',{files:loose('Orders'),into:{collection:'bruno-demo',parent:'nao-existe'}})).status,404);
 assert.equal((await call('POST','/import-folder',{files:loose('Orders'),into:{collection:'bruno-demo',parent:'../x'}})).status,400);
 assert.equal((await call('POST','/import-folder',{files:loose('Orders'),into:{collection:'nao-existe',parent:''}})).status,404);
 assert.equal((await call('GET','/import-folder')).status,405);
 assert.equal((await fetch(`${base}/api/collections/import-folder`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({files:loose('X')})})).status,403);
 for(const id of ['bruno-demo','billing'])assert.equal((await call('DELETE',`/${id}`)).status,200);

 // mocks da coleção: mocks.json normalizado, no detalhe, exportado e limpo ao apagar a request ou a pasta
 const mk={requests:{'usuarios/listar-usuarios.bru':{mode:'on',scenarios:[{id:'a',name:'OK',status:200,body:'{"ok":true}'},{id:'b',name:'Vazio',status:204}]},'saude.bru':{scenarios:[{id:'x',kind:'timeout'}]},'../fora.bru':{scenarios:[{id:'z'}]}}};
 const put=await call('PUT','/minha-api/mocks',mk);assert.equal(put.status,200);const savedMocks=await put.json();
 assert.deepEqual(Object.keys(savedMocks.requests).sort(),['saude.bru','usuarios/listar-usuarios.bru']); // o caminho fora da coleção é descartado
 assert.equal(savedMocks.requests['saude.bru'].scenarios[0].kind,'timeout');
 assert.ok(existsSync(path.join(collections,'minha-api','mocks.json')));
 assert.deepEqual(await json('GET','/minha-api/mocks'),savedMocks);assert.deepEqual((await json('GET','/minha-api')).mocks,savedMocks);
 assert.equal((await fetch(`${base}/api/collections/minha-api/mocks`,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'})).status,403); // sem o cabeçalho do app
 assert.equal((await call('PUT','/minha-api/mocks',{requests:{'big.bru':{scenarios:Array.from({length:40},(_,i)=>({id:`s${i}`,body:'x'.repeat(65000)}))}}})).status,413); // arquivo grande demais
 assert.equal((await call('GET','/nao-existe/mocks')).status>=400,true);
 const mockZip=Buffer.from(await (await call('GET','/minha-api/export')).arrayBuffer());
 assert.ok(readZip(mockZip).some(e=>e.name==='minha-api/mocks.json')); // viaja com o pacote
 const mockImp=await (await call('POST','/import',mockZip)).json();
 assert.deepEqual(await json('GET',`/${mockImp.id}/mocks`),savedMocks);
 const tmpReq=await json('POST','/minha-api/items',{type:'request',name:'Temp',method:'get',url:'x'});
 const tmpDir=await json('POST','/minha-api/items',{type:'folder',name:'Temp dir'});
 const inner=await json('POST','/minha-api/items',{type:'request',parent:tmpDir.path,name:'Inner',method:'get',url:'y'});
 await call('PUT','/minha-api/mocks',{requests:{...savedMocks.requests,[tmpReq.path]:{scenarios:[{id:'t',status:200}]},[inner.path]:{scenarios:[{id:'i',status:200}]}}});
 assert.equal(Object.keys((await json('GET','/minha-api/mocks')).requests).length,4);
 await call('DELETE',`/minha-api/items?path=${tmpReq.path}`);assert.equal(Object.keys((await json('GET','/minha-api/mocks')).requests).includes(tmpReq.path),false);
 await call('DELETE',`/minha-api/items?path=${tmpDir.path}`);assert.deepEqual(Object.keys((await json('GET','/minha-api/mocks')).requests).sort(),['saude.bru','usuarios/listar-usuarios.bru']); // a pasta leva os mocks de dentro
 await call('PUT','/minha-api/mocks',{requests:{}});assert.equal(existsSync(path.join(collections,'minha-api','mocks.json')),false); // sem mocks, o arquivo some
 assert.deepEqual(await json('GET','/minha-api/mocks'),{version:1,requests:{}});
 await call('DELETE',`/${mockImp.id}`);

 // COLL-09: configurações da coleção (verificação SSL/TLS) ficam no bruno.json e viajam no ZIP
 assert.deepEqual(await json('GET','/minha-api/settings'),{verifyTls:true});
 assert.deepEqual(await json('PUT','/minha-api/settings',{verifyTls:false}),{verifyTls:false});
 const brunoCfg=JSON.parse(await readFile(path.join(collections,'minha-api','bruno.json'),'utf8'));
 assert.deepEqual(brunoCfg.contextMaps,{verifyTls:false});assert.equal(brunoCfg.name,'Minha API'); // o resto do bruno.json fica igual
 assert.deepEqual((await json('GET','/minha-api')).settings,{verifyTls:false});
 const tlsZip=readZip(Buffer.from(await (await call('GET','/minha-api/export')).arrayBuffer()));
 assert.deepEqual(JSON.parse(tlsZip.find(e=>e.name==='minha-api/bruno.json').data.toString()).contextMaps,{verifyTls:false});
 assert.deepEqual(await json('PUT','/minha-api/settings',{verifyTls:true}),{verifyTls:true});
 assert.equal('contextMaps' in JSON.parse(await readFile(path.join(collections,'minha-api','bruno.json'),'utf8')),false); // ligado de novo: a chave some
 assert.equal((await call('PUT','/nao-existe/settings',{verifyTls:false})).status>=400,true);
 // excluir
 assert.equal((await call('DELETE','/minha-api/items?path=usuarios')).status,200);
 assert.equal((await json('GET','/minha-api')).tree.length,1);
 for(const id of ['minha-api','minha-api-2',evilRes.id])assert.equal((await call('DELETE',`/${id}`)).status,200);
 assert.deepEqual(await json('GET',''),[]);assert.equal(existsSync(path.join(collections,'.secrets','minha-api.json')),false);
 console.log('PASS COLL-01..09 collections API');
}finally{server.kill();await rm(work,{recursive:true,force:true});}
