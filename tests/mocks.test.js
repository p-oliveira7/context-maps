// Mocks do API client: normalização do arquivo, quando o mock responde, contagens e a resposta simulada.
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMocks,emptyMocks,effectiveMock,mockBadge,mockCounts,scenarioResponse,scenarioFromPreset,PRESETS,statusText,newScenarioId,MAX_SCENARIOS} from '../mocks.js';

const sample=()=>normalizeMocks({requests:{
 'users/list.bru':{mode:'auto',active:'b',scenarios:[{id:'a',name:'OK',status:200,body:'{"a":1}'},{id:'b',name:'Empty',status:200,body:'[]',delayMs:50}]},
 'users/create.bru':{mode:'on',scenarios:[{id:'x',name:'Created',status:201}]},
 'health.bru':{mode:'off',scenarios:[{id:'h',name:'Down',status:503}]}
}});

test('normalizeMocks: keeps known fields, fixes bad values and drops what is not a request', () => {
 const m=normalizeMocks({requests:{
  'a.bru':{mode:'weird',active:'nope',scenarios:[{name:'No id',status:999,delayMs:-5,headers:[{name:' X ',value:'1'},{name:'',value:'x'},'junk'],body:'x'.repeat(10)},{id:'dup'},{id:'dup',kind:'timeout',delayMs:99999999}]},
  '../evil.bru':{scenarios:[{id:'a'}]},'.hidden/x.bru':{scenarios:[{id:'a'}]},'folder/notbru.json':{scenarios:[{id:'a'}]},'c:/x.bru':{scenarios:[{id:'a'}]},'empty.bru':{scenarios:[]},'str.bru':'oops'}});
 assert.deepEqual(Object.keys(m.requests),['a.bru']);
 const e=m.requests['a.bru'];
 assert.equal(e.mode,'auto');assert.equal(e.active,e.scenarios[0].id); // "active" desconhecido volta para o primeiro
 assert.deepEqual([e.scenarios[0].status,e.scenarios[0].delayMs,e.scenarios[0].name],[599,0,'No id']);
 assert.deepEqual(e.scenarios[0].headers,[{name:'X',value:'1'}]);
 assert.deepEqual(e.scenarios.map(s=>s.id),['s1','dup','dupx']); // ids únicos
 assert.deepEqual([e.scenarios[2].kind,e.scenarios[2].status,e.scenarios[2].delayMs],['timeout',0,60000]);
 assert.deepEqual(normalizeMocks(null),emptyMocks());assert.deepEqual(normalizeMocks({requests:[]}),emptyMocks());
 const many=normalizeMocks({requests:{'m.bru':{scenarios:Array.from({length:99},(_,i)=>({id:`s${i}`,status:200}))}}});
 assert.equal(many.requests['m.bru'].scenarios.length,MAX_SCENARIOS);
 assert.equal(normalizeMocks({requests:{'b.bru':{scenarios:[{id:'a',body:'x'.repeat(300000)}]}}}).requests['b.bru'].scenarios[0].body.length,256*1024);
 assert.deepEqual(normalizeMocks(JSON.parse(JSON.stringify(sample()))),sample()); // idempotente
});
test('effectiveMock: auto follows the collection mode, on always, off never', () => {
 const m=sample();
 assert.equal(effectiveMock(m,'users/list.bru',false),null);assert.equal(effectiveMock(m,'users/list.bru',true).id,'b'); // o cenário ativo
 assert.equal(effectiveMock(m,'users/create.bru',false).id,'x');assert.equal(effectiveMock(m,'users/create.bru',true).id,'x');
 assert.equal(effectiveMock(m,'health.bru',true),null);assert.equal(effectiveMock(m,'unknown.bru',true),null);assert.equal(effectiveMock(emptyMocks(),'a.bru',true),null);
 assert.deepEqual(['users/list.bru','users/create.bru','health.bru','nope.bru'].map(p=>mockBadge(m,p,false)),['ready','on','ready','']);
 assert.deepEqual(['users/list.bru','users/create.bru','health.bru','nope.bru'].map(p=>mockBadge(m,p,true)),['on','on','ready','']);
});
test('mockCounts: counts the effective and the ready mocks under a tree', () => {
 const tree=[{type:'request',path:'health.bru'},{type:'folder',path:'users',children:[{type:'request',path:'users/list.bru'},{type:'request',path:'users/create.bru'},{type:'request',path:'users/none.bru'}]}];
 assert.deepEqual(mockCounts(tree,sample(),false),{on:1,ready:2});assert.deepEqual(mockCounts(tree,sample(),true),{on:2,ready:1});
 assert.deepEqual(mockCounts(tree[1].children,sample(),true),{on:2,ready:0});assert.deepEqual(mockCounts([],sample(),true),{on:0,ready:0});
});
test('scenarioResponse: same shape as /api/send, with variables, content type and size', () => {
 const interp=text=>text.replace('{{id}}','42');
 const r=scenarioResponse({kind:'response',status:201,headers:[{name:'X-Req',value:'{{id}}'}],body:'{"id":"{{id}}"}',delayMs:120},interp,{url:'http://x/y'});
 assert.deepEqual([r.status,r.statusText,r.url,r.timeMs,r.truncated,r.mock],[201,'Created','http://x/y',120,false,true]);
 assert.equal(r.bodyText,'{"id":"42"}');assert.equal(r.contentType,'application/json');assert.equal(r.size,11);
 assert.deepEqual(r.headers,[['x-req','42'],['content-type','application/json']]);
 assert.equal(scenarioResponse({kind:'response',status:200,headers:[{name:'Content-Type',value:'text/html'}],body:'<b>é</b>',delayMs:0}).contentType,'text/html');
 assert.equal(scenarioResponse({kind:'response',status:200,headers:[],body:'plain'}).contentType,'text/plain');
 assert.equal(scenarioResponse({kind:'response',status:200,headers:[],body:'é'}).size,2); // bytes, não caracteres
 assert.deepEqual(scenarioResponse({kind:'timeout',delayMs:5000}),{error:'timeout',detail:'5',mock:true});
 assert.deepEqual(scenarioResponse({kind:'network'}),{error:'network',detail:'Connection refused (mock)',mock:true});
 assert.equal(statusText(404),'Not Found');assert.equal(statusText(299),'');
});
test('presets and ids: a scenario from every preset is valid and ids stay unique', () => {
 const list=[];
 for(const p of PRESETS)list.push(scenarioFromPreset(p,list,p.key));
 assert.equal(new Set(list.map(s=>s.id)).size,PRESETS.length);
 const n=normalizeMocks({requests:{'p.bru':{scenarios:list}}}).requests['p.bru'].scenarios;
 assert.deepEqual(n.map(s=>[s.kind,s.status]),PRESETS.map(p=>[p.kind,p.status]));
 assert.equal(list[0].headers[0].name,'Content-Type');assert.equal(list.find(s=>s.name==='timeout').delayMs,5000);
 assert.equal(newScenarioId([{id:'s1'},{id:'s3'}]),'s4');assert.equal(newScenarioId([]),'s1');
});
