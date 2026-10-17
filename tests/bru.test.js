// Formato .bru (Bruno): leitura, gravação e ida e volta sem perder blocos que o app ainda não edita.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBru,stringifyBru,parseEnv,stringifyEnv} from '../bru.mjs';

const SAMPLE=`meta {
  name: Create user
  type: http
  seq: 2
}

post {
  url: {{host}}/users?x=1
  body: json
  auth: bearer
}

params:query {
  x: 1
  ~debug: true
}

headers {
  Content-Type: application/json
  ~X-Skip: 1
}

auth:bearer {
  token: {{token}}
}

body:json {
  {
    "name": "Ana",

    "tags": ["a", "b"]
  }
}

vars:pre-request {
  id: 42
}

assert {
  res.status: eq 201
}

script:pre-request {
  const a = 1;
  req.setHeader('x', a);
}

tests {
  test("ok", function() {
    expect(res.status).to.equal(201);
  });
}

docs {
  # Title
  Some docs
}

auth:oauth2 {
  grant_type: password
}
`;

test('BRU-01: reads method, url, params, headers, auth, body, scripts and docs',()=>{
 const m=parseBru(SAMPLE);
 assert.deepEqual([m.name,m.type,m.seq,m.method,m.url,m.bodyMode,m.authMode],['Create user','http',2,'post','{{host}}/users?x=1','json','bearer']);
 assert.deepEqual(m.query,[{name:'x',value:'1',enabled:true},{name:'debug',value:'true',enabled:false}]); // ~ = desligado
 assert.equal(m.headers[1].enabled,false);assert.equal(m.headers[0].value,'application/json');
 assert.equal(m.bearer.token,'{{token}}');
 assert.equal(m.body.json,'{\n  "name": "Ana",\n\n  "tags": ["a", "b"]\n}'); // recuo de 2 espaços removido, linha em branco mantida
 assert.deepEqual(m.varsPre,[{name:'id',value:'42',enabled:true}]);
 assert.match(m.scriptPre,/^const a = 1;\nreq\.setHeader/);assert.match(m.tests,/expect\(res\.status\)/);assert.match(m.docs,/^# Title/);
});
test('BRU-02: round trip keeps everything, including blocks the app does not edit',()=>{
 const m=parseBru(SAMPLE);
 assert.deepEqual(m.extras.map(b=>b.name),['auth:oauth2']); // assert agora é editável (m.assertions); o resto continua guardado como está
 assert.deepEqual(m.assertions,[{name:'res.status',value:'eq 201',enabled:true}]);
 const again=parseBru(stringifyBru(m));
 assert.deepEqual(again,m);
 const text=stringifyBru(m);
 assert.ok(text.includes('assert {\n  res.status: eq 201\n}'));assert.ok(text.includes('auth:oauth2 {\n  grant_type: password\n}'));
 assert.ok(text.includes('  ~debug: true'));assert.ok(text.includes('  "tags": ["a", "b"]'));
});
test('BRU-03: edits are written back (new header, changed url, new body mode)',()=>{
 const m=parseBru(SAMPLE);
 m.url='{{host}}/v2/users';m.headers.push({name:'X-Trace',value:'abc',enabled:true});m.bodyMode='text';m.body.text='plain';m.method='put';
 const again=parseBru(stringifyBru(m));
 assert.equal(again.method,'put');assert.equal(again.url,'{{host}}/v2/users');assert.equal(again.headers.at(-1).name,'X-Trace');assert.equal(again.body.text,'plain');assert.equal(again.body.json,m.body.json);
});
test('BRU-04: minimal and empty requests',()=>{
 const m=parseBru('meta {\n  name: Ping\n  type: http\n}\n\nget {\n  url: http://x\n  body: none\n  auth: none\n}\n');
 assert.deepEqual([m.name,m.method,m.url,m.query],['Ping','get','http://x',undefined]);
 assert.equal(parseBru(stringifyBru({name:'Novo',type:'http',method:'get',url:'',bodyMode:'none',authMode:'none'})).url,'');
 assert.deepEqual(parseBru('').name,'');
 const crlf=parseBru('meta {\r\n  name: A\r\n}\r\n\r\nget {\r\n  url: u\r\n}\r\n');assert.equal(crlf.method,'get');
});
test('BRU-05: environments keep secret names in the file, never their values',()=>{
 const src='vars {\n  host: http://localhost:3000\n  ~old: 1\n}\nvars:secret [\n  token,\n  apiKey\n]\n';
 const env=parseEnv(src);
 assert.deepEqual(env.vars.map(v=>[v.name,v.value,v.enabled]),[['host','http://localhost:3000',true],['old','1',false]]);
 assert.deepEqual(env.secrets,['token','apiKey']);
 const out=stringifyEnv({vars:[{name:'host',value:'h',enabled:true},{name:'token',value:'SEGREDO',secret:true}],secrets:['token']});
 assert.ok(!out.includes('SEGREDO'));assert.ok(out.includes('vars:secret [\n  token\n]'));
 assert.deepEqual(parseEnv(out).secrets,['token']);
});
