// Partes puras do suporte a scripts: expect (chai-lite), caminhos e asserts declarativos do Bruno.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chaiLite} from '../chai-lite.js';
import {getPath,parsePath,parseAssertion,runAssertions,evalValueExpression,OPERATORS} from '../assertions.js';

const {expect}=chaiLite();
const fails=(fn,pattern)=>assert.throws(fn,pattern);

test('SCR-01: expect covers the common Chai assertions',()=>{
 expect(1).to.equal(1);expect(1).to.not.equal(2);expect({a:{b:2}}).to.eql({a:{b:2}});expect({a:1}).to.deep.equal({a:1});
 expect('abc').to.include('b');expect([1,2]).to.include(2);expect({a:1,b:2}).to.include({a:1});expect('abc').to.contain('c');
 expect([1,2,3]).to.have.length(3);expect([1,2]).to.have.lengthOf(2);expect('xy').to.have.lengthOf(2);
 expect({a:{b:2}}).to.have.property('a').that.eql({b:2});expect({a:1}).to.have.property('a',1);expect({a:1}).to.not.have.property('z');
 expect(5).to.be.above(3).and.below(9);expect(5).to.be.within(1,5);expect(5).to.be.at.least(5);expect(5).to.be.at.most(5);
 expect(null).to.be.null;expect(undefined).to.be.undefined;expect(true).to.be.true;expect(false).to.be.false;expect(1).to.be.ok;expect(0).to.not.be.ok;expect(0).to.exist;expect(null).to.not.exist;
 expect([]).to.be.empty;expect('').to.be.empty;expect({}).to.be.empty;expect([1]).to.not.be.empty;
 expect('x').to.be.a('string');expect([]).to.be.an('array');expect({}).to.be.an('object');expect(1).to.be.a('number');
 expect(200).to.be.oneOf([200,201]);expect('a1').to.match(/\d/);expect({a:1,b:2}).to.have.keys('a','b');expect({a:1,b:2}).to.contain.keys('a');
 expect(()=>{throw new Error('boom')}).to.throw('boom');expect(()=>{}).to.not.throw();expect(new Date()).to.be.instanceOf(Date);expect(NaN).to.be.NaN;
});
test('SCR-02: failing assertions explain what was expected',()=>{
 fails(()=>expect(1).to.equal(2),/expected 1 to equal 2/);
 fails(()=>expect([1]).to.have.length(3),/to have length 3 \(got 1\)/);
 fails(()=>expect('abc').to.not.include('b'),/not to include "b"/);
 fails(()=>expect({a:1}).to.have.property('b'),/to have property "b"/);
 fails(()=>expect(1).to.be.a('string'),/to be a string \(it is number\)/);
 fails(()=>expect(5).to.be.above(9),/to be above 9/);
 fails(()=>expect({a:1}).to.eql({a:2}),/deeply equal/);
});
test('SCR-03: paths read nested values, arrays and case-insensitive headers',()=>{
 const scope={res:{status:201,headers:{'content-type':'application/json'},body:{items:[{id:1},{id:7,tags:['a','b']}],'odd key':true},responseTime:12}};
 assert.deepEqual(parsePath('res.body.items[1].tags[-1]'),['res','body','items',1,'tags',-1]);
 assert.equal(getPath(scope,'res.status'),201);assert.equal(getPath(scope,'res.body.items[1].id'),7);assert.equal(getPath(scope,'res.body.items[1].tags[-1]'),'b');
 assert.equal(getPath(scope,'res.headers.Content-Type'),'application/json');assert.equal(getPath(scope,'res.body["odd key"]'),true);
 assert.equal(getPath(scope,'res.body.nope.deeper'),undefined);assert.equal(getPath(scope,'res.responseTime'),12);
});
test('SCR-04: assert block operators (Bruno syntax)',()=>{
 assert.deepEqual(parseAssertion('eq 200'),{op:'eq',operand:200});
 assert.deepEqual(parseAssertion('in [1, 2, 3]'),{op:'in',operand:[1,2,3]});
 assert.deepEqual(parseAssertion('contains hello world'),{op:'contains',operand:'hello world'});
 assert.deepEqual(parseAssertion('isJson'),{op:'isJson',operand:undefined});
 assert.equal(parseAssertion('bogus 1'),null);
 const scope={res:{status:200,headers:{'content-type':'application/json; charset=utf-8'},body:{name:'Ana',age:30,tags:['x','y'],empty:'',obj:{a:1}},responseTime:80}};
 const entries=[
  ['res.status','eq 200'],['res.status','neq 500'],['res.status','gte 200'],['res.status','lt 300'],['res.status','in [200,201]'],['res.status','notIn 404,500'],
  ['res.body.name','eq Ana'],['res.body.name','startsWith An'],['res.body.name','endsWith na'],['res.body.name','contains n'],['res.body.name','matches ^A.a$'],['res.body.name','notMatches ^b'],
  ['res.body.age','between [18, 65]'],['res.body.tags','length 2'],['res.body.tags','contains x'],['res.body.tags','isArray'],['res.body.empty','isEmpty'],['res.body.name','isNotEmpty'],
  ['res.body.obj','isJson'],['res.body.age','isNumber'],['res.body.name','isString'],['res.body.nope','isUndefined'],['res.body.name','isDefined'],['res.body.name','isTruthy'],['res.body.empty','isFalsy'],
  ['res.headers.content-type','contains json'],['res.responseTime','lt 1000']
 ].map(([name,value])=>({name,value,enabled:true}));
 const results=runAssertions(entries,scope);
 assert.deepEqual(results.filter(r=>!r.passed),[]);
 const failing=runAssertions([{name:'res.status',value:'eq 404',enabled:true},{name:'res.status',value:'wat',enabled:true},{name:'res.body.name',value:'eq {{who}}',enabled:true},{name:'res.status',value:'eq 1',enabled:false}],scope,x=>x.replace('{{who}}','Bia'));
 assert.equal(failing.length,3); // o desligado é ignorado
 assert.deepEqual(failing.map(r=>r.passed),[false,false,false]);
 assert.match(failing[0].error,/expected res\.status \(200\) to eq 404/);assert.match(failing[1].error,/invalid assertion/);assert.match(failing[2].error,/"Ana"/);
 assert.ok(Object.keys(OPERATORS).length>=28);
});
test('SCR-05: post-response variable expressions',()=>{
 const scope={res:{body:{token:'abc',user:{id:9}}},req:{url:'http://x'}};
 assert.equal(evalValueExpression('res.body.token',scope),'abc');assert.equal(evalValueExpression('res.body.user.id',scope),9);
 assert.equal(evalValueExpression('req.url',scope),'http://x');
 assert.equal(evalValueExpression('literal {{k}}',scope,x=>x.replace('{{k}}','v')),'literal v');
});

import {buildRaw,resolveRaw,buildRequest,toScriptReq,applyScriptReq,makeScope,parseResponseBody,resolveVars} from '../pipeline.js';
test('SCR-06: raw request keeps {{variables}} until resolved; scripts can change it first',()=>{
 const model={method:'post',url:'{{host}}/users/:id?x=1',bodyMode:'formUrlEncoded',formUrlEncoded:[{name:'q',value:'{{term}} é',enabled:true},{name:'off',value:'1',enabled:false}],
  pathParams:[{name:'id',value:'{{uid}}',enabled:true}],headers:[{name:'X-A',value:'{{a}}',enabled:true},{name:'X-Off',value:'no',enabled:false}],authMode:'bearer',bearer:{token:'{{tok}}'}};
 const raw=buildRaw(model,[{name:'X-Coll',value:'c',enabled:true}]);
 assert.equal(raw.url,'{{host}}/users/:id?x=1');assert.deepEqual(raw.form,[{name:'q',value:'{{term}} é'}]);
 assert.deepEqual(raw.headers.map(h=>h.name).sort(),['Authorization','Content-Type','X-A','X-Coll']);
 const vars=new Map([['host','http://h'],['uid','a b'],['a','1'],['tok','T'],['term','caf']]);
 const res=resolveRaw(raw,vars);
 assert.equal(res.url,'http://h/users/a%20b?x=1');assert.equal(res.body,'q=caf%20%C3%A9');
 assert.equal(res.headers.find(h=>h.name==='Authorization').value,'Bearer T');assert.equal(res.headers.find(h=>h.name==='Content-Type').value,'application/x-www-form-urlencoded');
 assert.equal(buildRequest(model,vars,[]).url,res.url);
 // o script altera o request cru (e a variável criada por ele vale na mesma resolução)
 const script=toScriptReq(raw);assert.equal(script.headers['X-A'],'{{a}}');
 applyScriptReq(raw,{...script,url:script.url+'&s={{stamp}}',headers:{...script.headers,'X-New':'n'},body:'{"x":1}',method:'PUT',timeout:2000});
 vars.set('stamp','42');const after=resolveRaw(raw,vars);
 assert.deepEqual([after.method,after.url,after.body,after.timeout],['PUT','http://h/users/a%20b?x=1&s=42','{"x":1}',2000]);
 assert.ok(after.headers.some(h=>h.name==='X-New'));
 const basic=resolveRaw(buildRaw({method:'get',url:'u',authMode:'basic',basic:{username:'ana',password:'p{{w}}'}}),new Map([['w','!']]));
 assert.equal(basic.headers[0].value,`Basic ${btoa('ana:p!')}`);
 assert.equal(resolveVars('{{missing}} {{$guid}}',new Map()).startsWith('{{missing}} '),true);
});
test('SCR-07: response scope for asserts and post-response variables',()=>{
 const scope=makeScope({status:200,statusText:'OK',headers:[['Content-Type','application/json'],['X-Id','7']],bodyText:'{"user":{"id":7}}',contentType:'application/json',timeMs:15,url:'http://h/u'},{method:'GET',url:'http://h/u',headers:[{name:'A',value:'b'}],body:undefined});
 assert.deepEqual([getPath(scope,'res.status'),getPath(scope,'res.body.user.id'),getPath(scope,'res.headers.x-id'),getPath(scope,'res.responseTime'),getPath(scope,'req.headers.A')],[200,7,'7',15,'b']);
 assert.equal(parseResponseBody({bodyText:'plain',contentType:'text/plain'}),'plain');assert.equal(parseResponseBody({binary:true}),'');assert.deepEqual(parseResponseBody({bodyText:'[1]',contentType:'text/html'}),[1]);
});
