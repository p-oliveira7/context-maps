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

 // excluir
 assert.equal((await call('DELETE','/minha-api/items?path=usuarios')).status,200);
 assert.equal((await json('GET','/minha-api')).tree.length,1);
 for(const id of ['minha-api','minha-api-2',evilRes.id])assert.equal((await call('DELETE',`/${id}`)).status,200);
 assert.deepEqual(await json('GET',''),[]);assert.equal(existsSync(path.join(collections,'.secrets','minha-api.json')),false);
 console.log('PASS COLL-01..06 collections API');
}finally{server.kill();await rm(work,{recursive:true,force:true});}
