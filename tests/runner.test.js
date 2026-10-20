// Execução de pastas do cliente de API: escolha das requests, classificação, parada na falha, cancelamento e relatório.
import test from 'node:test';
import assert from 'node:assert/strict';
import {collectRequests,groupOf,classify,summarize,runSequence,reportJson,reportText} from '../runner.js';

const tree=[
 {type:'request',path:'health.bru',name:'Health',method:'get'},
 {type:'folder',path:'users',name:'Users',children:[
  {type:'request',path:'users/list.bru',name:'List',method:'get'},
  {type:'folder',path:'users/admin',name:'Admin',children:[{type:'request',path:'users/admin/ban.bru',name:'Ban',method:'post'}]},
  {type:'request',path:'users/create.bru',name:'Create',method:'post'}
 ]}
];
const names=list=>list.map(r=>r.name);
const ok=(extra={})=>({status:200,timeMs:5,extra:{logs:[],tests:[],asserts:[],errors:[],...extra}});
const pending=list=>list.map(r=>({...r,status:'pending'}));

test('collectRequests: recursive follows the tree order, flat only takes direct requests', () => {
 assert.deepEqual(names(collectRequests(tree,{recursive:true})),['Health','List','Ban','Create']);
 assert.deepEqual(names(collectRequests(tree,{recursive:false})),['Health']);
 const users=tree[1];
 assert.deepEqual(names(collectRequests(users.children,{recursive:false,base:'users'})),['List','Create']);
 assert.deepEqual(collectRequests(users.children,{recursive:true,base:'users'}).map(r=>r.group),['','admin','']);
 assert.deepEqual(collectRequests([],{}),[]);
});
test('groupOf: folder relative to the executed folder', () => {
 assert.equal(groupOf('health.bru',''),'');
 assert.equal(groupOf('users/admin/ban.bru',''),'users/admin');
 assert.equal(groupOf('users/admin/ban.bru','users'),'admin');
 assert.equal(groupOf('users/list.bru','users'),'');
});
test('classify: transport and script errors, failed checks, passed', () => {
 assert.equal(classify(ok()),'passed');
 assert.equal(classify(ok({asserts:[{passed:true}],tests:[{passed:true}]})),'passed');
 assert.equal(classify(ok({asserts:[{passed:true}],tests:[{passed:false}]})),'failed');
 assert.equal(classify(ok({errors:[{where:'tests',message:'boom'}]})),'error');
 assert.equal(classify({error:'network',extra:{errors:[]}}),'error');
 assert.equal(classify(undefined),'error');
 assert.equal(classify({status:404,extra:{asserts:[],tests:[],errors:[]}}),'passed'); // só asserts e testes reprovam
});
test('runSequence: runs in order, classifies and reports each change', async () => {
 const items=pending(collectRequests(tree)),order=[],changes=[];
 const status=await runSequence(items,{execute:async item=>{order.push(item.name);return item.name==='Ban'?ok({asserts:[{passed:false,error:'x'}]}):ok();},onChange:i=>changes.push(`${i.name}:${i.status}`)});
 assert.equal(status,'done');assert.deepEqual(order,['Health','List','Ban','Create']);
 assert.deepEqual(items.map(i=>i.status),['passed','passed','failed','passed']);
 assert.deepEqual(changes.slice(0,4),['Health:running','Health:passed','List:running','List:passed']);
 const s=summarize(items);
 assert.deepEqual([s.total,s.passed,s.failed,s.errors,s.skipped,s.pending,s.checksTotal,s.checksPassed,s.timeMs],[4,3,1,0,0,0,1,0,20]);
});
test('runSequence: stop on first failure skips the rest', async () => {
 const items=pending(collectRequests(tree));
 const status=await runSequence(items,{stopOnFail:true,execute:async item=>item.name==='List'?{error:'network',detail:'refused',timeMs:1,extra:{errors:[]}}:ok()});
 assert.equal(status,'stopped');
 assert.deepEqual(items.map(i=>i.status),['passed','error','skipped','skipped']);
 assert.equal(summarize(items).skipped,2);
});
test('runSequence: a thrown error becomes an error result and the run goes on', async () => {
 const items=pending(collectRequests(tree));
 const status=await runSequence(items,{execute:async item=>{if(item.name==='Health')throw new Error('kaput');return ok();}});
 assert.equal(status,'done');assert.equal(items[0].status,'error');assert.match(items[0].out.detail,/kaput/);assert.equal(items[1].status,'passed');
});
test('runSequence: cancelling in the middle skips the current and the remaining requests', async () => {
 const items=pending(collectRequests(tree)),ctrl=new AbortController();
 const status=await runSequence(items,{signal:ctrl.signal,execute:async item=>{
  if(item.name==='List'){ctrl.abort();return {error:'cancelled',timeMs:1,extra:{errors:[]}};}
  return ok();
 }});
 assert.equal(status,'cancelled');assert.deepEqual(items.map(i=>i.status),['passed','skipped','skipped','skipped']);
});
test('runSequence: the delay waits between requests but not after the last, and cancelling cuts it short', async () => {
 const items=pending(collectRequests(tree).slice(0,2)),started=Date.now();
 await runSequence(items,{delayMs:80,execute:async()=>ok()});
 const took=Date.now()-started;assert.ok(took>=70&&took<400,`delay of one gap (${took} ms)`);
 const again=pending(collectRequests(tree).slice(0,2)),ctrl=new AbortController();
 const t0=Date.now();setTimeout(()=>ctrl.abort(),20);
 const status=await runSequence(again,{signal:ctrl.signal,delayMs:5000,execute:async()=>ok()});
 assert.equal(status,'cancelled');assert.ok(Date.now()-t0<1500);assert.deepEqual(again.map(i=>i.status),['passed','skipped']);
});
test('report: JSON without bodies or headers, and a short text summary', async () => {
 const items=pending(collectRequests(tree));
 await runSequence(items,{execute:async item=>({...ok({asserts:[{expression:'res.status',assertion:'eq 200',passed:item.name!=='Ban',error:'bad'}]}),sent:{method:'GET',url:`http://x/${item.name}`},headers:[['secret','1']],bodyText:'BODY'})});
 const run={title:'Users',env:'local',recursive:true,status:'done',startedAt:'2026-01-01T00:00:00.000Z',items};
 const json=reportJson(run);
 assert.equal(json.summary.failed,1);assert.equal(json.requests.length,4);
 assert.deepEqual(json.requests[2].checks,[{name:'res.status eq 200',passed:false,error:'bad'}]);
 assert.equal(JSON.stringify(json).includes('BODY'),false);assert.equal(JSON.stringify(json).includes('secret'),false);
 const text=reportText(run,(key,...a)=>`${key}:${a.join(',')}`);
 assert.match(text,/^Users: apiRunSummaryLine:3,4,1,0/);assert.match(text,/✗ POST Ban \(200, 5 ms\)/);
});
