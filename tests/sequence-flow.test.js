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

import {tracePath,statusInLabel} from '../sequence-flow.js';
const FLOW=`sequenceDiagram
  participant C
  participant A
  participant P
  %% @step s1 {"collection":"shop","request":"orders.bru"}
  C->>A: POST /orders
  A->>P: charge
  P-->>A: 200 OK
  alt payment approved
    A-->>C: 201 Created
  else declined
    A-->>C: 402 Payment required
    Note right of C: shows the error
  end
`;
const trace=(status,outcome,error='')=>tracePath(parseSequence(FLOW),new Map([['s1',{status,outcome,error}]])).state;

test('statusInLabel lê o código no começo do texto', () => {
 assert.equal(statusInLabel('402 Payment required'),402);
 assert.equal(statusInLabel('5. 201 Created'),201);
 assert.equal(statusInLabel('POST /orders'),0);
 assert.equal(statusInLabel('retry 500 times'),0);
});

test('tracePath: 201 acende o caminho até o 201 e apaga o ramo recusado', () => {
 // passos: 0 POST, 1 charge, 2 200 OK, 3 alt, 4 201, 5 else, 6 402, 7 note, 8 end
 assert.deepEqual(trace(201,'ok'),['ok','ok','ok','ok','ok','skip','skip','skip','ok']);
});

test('tracePath: 402 segue pelo ramo recusado e termina em vermelho', () => {
 assert.deepEqual(trace(402,'fail'),['ok','ok','ok','ok','skip','ok','fail','ok','ok']);
});

test('tracePath: sem resposta ainda não acende nada; chamada com erro pára o caminho', () => {
 assert.deepEqual(tracePath(parseSequence(FLOW),new Map()).state.every(s=>s===''),true);
 const err=trace(0,'fail','timeout');
 assert.deepEqual(err,['fail','','','','','','','','']);
});

test('tracePath: sem códigos nos ramos, sucesso vai no 1º e falha no último; opt e break', () => {
 const src=`sequenceDiagram\n  %% @step s1 {"collection":"a","request":"x.bru"}\n  A->>B: go\n  alt fine\n    B-->>A: yes\n  else bad\n    B-->>A: no\n  end\n  break nope\n    A->>B: abort\n  end\n  opt extra\n    A->>B: more\n  end\n`;
 const m=parseSequence(src);
 const ok=tracePath(m,new Map([['s1',{status:200,outcome:'ok'}]])).state;
 assert.deepEqual(ok,['ok','ok','ok','skip','skip','ok','skip','skip','skip','ok','ok','ok']);
 const bad=tracePath(m,new Map([['s1',{status:500,outcome:'fail'}]])).state;
 assert.deepEqual(bad,['ok','ok','skip','ok','ok','ok','ok','ok','ok','ok','ok','ok']);
});

test('tracePath: blocos aninhados escolhem o ramo pelos códigos de cada nível', () => {
 const src=`sequenceDiagram
  %% @step s1 {"collection":"a","request":"x.bru"}
  A->>B: create
  alt created
    B-->>A: 201 Created
    %% @step s2 {"collection":"a","request":"y.bru"}
    A->>B: reserve
    alt reserved
      B-->>A: 200 Reserved
    else out of stock
      B-->>A: 409 Conflict
    end
  else invalid
    B-->>A: 422 Unprocessable
  end
`;
 const m=parseSequence(src);
 // 0 create, 1 alt, 2 201, 3 reserve, 4 alt, 5 200, 6 else, 7 409, 8 end, 9 else, 10 422, 11 end
 const bad=tracePath(m,new Map([['s1',{status:422,outcome:'fail'}]])).state;
 assert.equal(bad[2],'skip');assert.equal(bad[10],'fail');assert.equal(bad[5],'skip'); // o 4xx do ramo de dentro não puxa o ramo errado
 const deep=tracePath(m,new Map([['s1',{status:201,outcome:'ok'}],['s2',{status:409,outcome:'fail'}]])).state;
 assert.equal(deep[2],'ok');assert.equal(deep[10],'skip');assert.equal(deep[5],'skip');assert.equal(deep[7],'fail');
 const half=tracePath(m,new Map([['s1',{status:201,outcome:'ok'}]])).state; // s2 ainda não rodou: pára ali
 assert.equal(half[2],'ok');assert.equal(half[3],'');assert.equal(half[7],'');
});
