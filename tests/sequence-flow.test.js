import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBind,normalizeRule,evaluateOutcome,newStepId,parseStepComment,stepComment} from '../sequence-flow.js';
import {parseSequence,stringifySequence,layoutSequence,renderSequenceSvg} from '../sequence.js';

const bind={collection:'shop',request:'pay/charge.bru',rules:[{when:'status',op:'eq',value:'402',result:'fail'},{when:'body',path:'res.body.data.paid',op:'eq',value:'true',result:'ok'}]};

test('normalizeBind descarta o inválido e limita as regras', () => {
 assert.equal(normalizeBind(null),null);
 assert.equal(normalizeBind({collection:'a',request:'../x.bru'}),null);
 assert.equal(normalizeBind({collection:'',request:'x.bru'}),null);
 const b=normalizeBind({collection:'a',request:'x.bru',rules:[{when:'status',op:'range',value:'2XX',result:'ok'},{when:'status',value:'abc',result:'ok'},{when:'nada'},...Array.from({length:30},()=>({when:'asserts',op:'pass',result:'ok'}))]});
 assert.equal(b.rules.length,12);assert.deepEqual(b.rules[0],{when:'status',op:'range',value:'2xx',result:'ok'});
 assert.equal(normalizeRule({when:'body',path:'',result:'ok'}),null);
});

test('evaluateOutcome: primeira regra que combina vence; sem regra vale o status', () => {
 assert.equal(evaluateOutcome(bind,{status:402,body:{}}),'fail');
 assert.equal(evaluateOutcome(bind,{status:200,body:{data:{paid:true}}}),'ok');
 assert.equal(evaluateOutcome(bind,{status:200,body:{}}),'ok'); // nenhuma regra combinou: 200 é ok
 assert.equal(evaluateOutcome({rules:[]},{status:404}),'fail');
 assert.equal(evaluateOutcome({rules:[]},{status:302}),'ok');
 assert.equal(evaluateOutcome(bind,{error:'timeout'}),'fail');
 assert.equal(evaluateOutcome({rules:[{when:'status',op:'range',value:'4xx',result:'ok'}]},{status:404}),'ok'); // 404 esperado pode ser sucesso
 assert.equal(evaluateOutcome({rules:[{when:'asserts',op:'fail',result:'fail'}]},{status:200,assertionsPassed:false}),'fail');
 assert.equal(evaluateOutcome({rules:[{when:'body',path:'items[0].id',op:'exists',result:'fail'}]},{status:200,body:{items:[{id:1}]}}),'fail');
 assert.equal(evaluateOutcome({rules:[{when:'body',path:'body.token',op:'missing',result:'fail'}]},{status:200,body:{}}),'fail');
});

test('comentário @step: ida e volta no texto Mermaid, sem estragar o diagrama', () => {
 const src=`sequenceDiagram\n  participant A\n  participant B\n  %% @step s1 ${JSON.stringify(bind)}\n  A->>B: cobrar\n  B-->>A: ok\n`;
 const m=parseSequence(src);
 assert.equal(m.steps[0].id,'s1');assert.deepEqual(m.steps[0].bind,bind);assert.equal(m.steps[1].bind,undefined);
 assert.equal(parseSequence(stringifySequence(m)).steps[0].bind.request,'pay/charge.bru');
 assert.match(stringifySequence(m),/%% @step s1 \{/);
 const svg=renderSequenceSvg(layoutSequence(m));assert.match(svg,/data-id="s1" data-bound="1"/);
 assert.equal(parseStepComment('%% outro comentário'),null);
 assert.equal(parseStepComment('%% @step s2').bind,null);
 assert.equal(stepComment({id:'s2'}),'');
});

test('bind sem id ganha um id ao serializar e newStepId não repete', () => {
 const m=parseSequence('sequenceDiagram\n  A->>B: x\n  B->>A: y\n');
 m.steps[0].id='s1';m.steps[1].bind=normalizeBind({collection:'a',request:'x.bru'});
 assert.equal(newStepId(m),'s2');
 assert.match(stringifySequence(m),/%% @step s2 /);
});
