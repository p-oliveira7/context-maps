// Edição do diagrama de sequência: participantes, passos, blocos, mover e desfazer/refazer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSequence,stringifySequence} from '../sequence.js';
import {createHistory,matchEnd,groupOf,depthOf,describeStep,addParticipant,renameParticipant,setParticipantKind,moveParticipant,removeParticipant,participantUse,addMessage,addNote,updateStep,removeStep,wrapInGroup,addGroup,addElse,moveStep,uniqueParticipantId} from '../sequence-edit.js';

const base=()=>parseSequence(`sequenceDiagram
  actor U as User
  participant API
  participant DB
  U->>API: one
  API->>DB: two
  alt ok
    DB-->>API: three
  else bad
    DB-->>API: four
  end
  Note over U,API: five
  API->>U: six`);
const texts=m=>m.steps.map(s=>s.type==='message'?s.text:s.type==='note'?`note:${s.text}`:s.type);
const roundTrips=m=>assert.deepEqual(parseSequence(stringifySequence(m)).steps.map(s=>s.type),m.steps.map(s=>s.type));

test('history: push, undo, redo, limit and no-op pushes', () => {
 const m=base(),h=createHistory(m);
 assert.equal(h.canUndo,false);assert.equal(h.push(m),false); // nada mudou
 addMessage(m,{text:'x'});assert.equal(h.push(m),true);
 addMessage(m,{text:'y'});h.push(m);
 assert.equal(h.canUndo,true);assert.equal(h.canRedo,false);
 const u=h.undo();assert.equal(texts(u).at(-1),'x');assert.equal(h.canRedo,true);
 const u2=h.undo();assert.equal(texts(u2).includes('x'),false);assert.equal(h.undo(),null);
 assert.equal(texts(h.redo()).at(-1),'x');
 const branch=h.undo();addMessage(branch,{text:'other'});h.push(branch);assert.equal(h.canRedo,false); // um novo passo corta o "refazer"
 const small=createHistory(m,3);for(let i=0;i<6;i++){addMessage(m,{text:`n${i}`});small.push(m);}
 let steps=0;while(small.undo())steps++;assert.equal(steps,2);
});
test('queries: matching end, enclosing group, depth and descriptions', () => {
 const m=base(),g=m.steps.findIndex(s=>s.type==='group'),e=m.steps.findIndex(s=>s.type==='end');
 assert.equal(matchEnd(m,g),e);assert.equal(matchEnd(m,0),-1);
 const els=m.steps.findIndex(s=>s.type==='else');
 assert.equal(groupOf(m,els),g);assert.equal(groupOf(m,g+1),g);assert.equal(groupOf(m,0),-1);
 assert.deepEqual([depthOf(m,g),depthOf(m,g+1),depthOf(m,els),depthOf(m,e)],[0,1,0,0]);
 assert.equal(describeStep(m,0),'User → API: one');assert.equal(describeStep(m,g+1),'DB ⇢ API: three');assert.equal(describeStep(m,g),'alt [ok]');assert.equal(describeStep(m,els),'else [bad]');
 assert.match(describeStep(m,m.steps.findIndex(s=>s.type==='note')),/^over User, API: five/);
});
test('participants: unique ids, rename, kind, move, remove with dependent steps', () => {
 const m=base();
 assert.equal(uniqueParticipantId(m,'API'),'API2');assert.equal(uniqueParticipantId(m,'a b!'),'ab');
 const id=addParticipant(m,{name:'Payment Service'});assert.equal(id,'PaymentService');assert.equal(m.participants.at(-1).name,'Payment Service');
 assert.equal(addParticipant(m,{name:'Payment Service'}),'PaymentService2');
 const blank=addParticipant(m,{});assert.match(blank,/^P/);
 addParticipant(m,{name:'First',index:0});assert.equal(m.participants[0].id,'First');
 renameParticipant(m,'API','Order API');assert.equal(m.participants.find(p=>p.id==='API').name,'Order API');renameParticipant(m,'API','   ');assert.equal(m.participants.find(p=>p.id==='API').name,'Order API');
 setParticipantKind(m,'DB','actor');assert.equal(m.participants.find(p=>p.id==='DB').kind,'actor');setParticipantKind(m,'DB','whatever');assert.equal(m.participants.find(p=>p.id==='DB').kind,'participant');
 assert.equal(moveParticipant(m,'First',-1),false);assert.equal(moveParticipant(m,'First',1),true);assert.equal(m.participants[1].id,'First');
 assert.equal(participantUse(m,'DB'),3);
 const removed=removeParticipant(m,'DB');assert.equal(removed,3); // duas mensagens de DB + uma no bloco else
 assert.equal(m.participants.some(p=>p.id==='DB'),false);roundTrips(m);
 const note=base();updateStep(note,note.steps.findIndex(s=>s.type==='note'),{position:'left'});
 assert.equal(note.steps.find(s=>s.type==='note').actors.length,1); // à esquerda/direita vale um participante só
 const only=base();removeParticipant(only,'U');assert.equal(only.steps.find(s=>s.type==='note').actors.join(),'API'); // a nota sobrevive com o outro
 roundTrips(only);
});
test('steps: add message/note at a position, update, remove', () => {
 const m=base();
 const at=addMessage(m,{from:'API',to:'U',text:'inserted',at:1});assert.equal(at,1);assert.equal(texts(m)[1],'inserted');
 assert.equal(addMessage(m,{text:'last'}),m.steps.length-1);
 const n=addNote(m,{actors:['DB'],position:'left',text:'hello',at:0});assert.equal(n,0);assert.equal(m.steps[0].type,'note');
 updateStep(m,1,{text:'edited',style:'dashed'});assert.deepEqual([m.steps[1].text,m.steps[1].style],['edited','dashed']);
 assert.equal(removeStep(m,0),0);assert.equal(m.steps[0].type,'message');
 const empty={title:'',autonumber:false,participants:[],steps:[]};addMessage(empty,{});assert.equal(empty.participants.length,1);assert.equal(empty.steps.length,1);roundTrips(empty);
 roundTrips(m);
});
test('blocks: wrap, add a block, add else, remove keeps the inside', () => {
 const m=base();
 const w=wrapInGroup(m,0,'loop','retry');assert.equal(m.steps[w].type,'group');assert.equal(m.steps[w+2].type,'end');assert.equal(describeStep(m,w),'loop [retry]');roundTrips(m);
 const whole=wrapInGroup(m,m.steps.findIndex(s=>s.type==='group'&&s.kind==='alt'),'opt'); // um bloco inteiro dentro de outro
 assert.equal(m.steps[whole].kind,'opt');const wholeEnd=matchEnd(m,whole);assert.ok(wholeEnd>whole&&m.steps[wholeEnd].type==='end');
 assert.ok(m.steps.findIndex(s=>s.type==='group'&&s.kind==='alt')>whole&&matchEnd(m,m.steps.findIndex(s=>s.type==='group'&&s.kind==='alt'))<wholeEnd);roundTrips(m);
 const g=addGroup(m,{kind:'par',label:'both',at:m.steps.length});assert.deepEqual(m.steps.slice(g).map(s=>s.type),['group','message','end']);
 const els=addElse(m,g,'other');assert.equal(m.steps[els].type,'else');assert.equal(matchEnd(m,g),els+1);roundTrips(m);
 assert.equal(addElse(m,m.steps.findIndex(s=>s.type==='message')),-1); // só um bloco aceita ramificação
 const k=m.steps.findIndex(s=>s.type==='group'&&s.kind==='alt');
 const innerBefore=m.steps.slice(k+1,matchEnd(m,k)).filter(s=>s.type==='message').length;
 const total=m.steps.length;removeStep(m,k);
 assert.ok(!m.steps.some(s=>s.type==='group'&&s.kind==='alt'));
 assert.equal(m.steps.length,total-3); // o bloco, o else e o end saem; as mensagens ficam
 assert.equal(m.steps.filter(s=>s.type==='message').length>=innerBefore,true);roundTrips(m);
 const e=m.steps.findIndex(s=>s.type==='end');assert.equal(removeStep(m,e),e); // o "end" não some sozinho
});
test('moveStep: simple steps, whole blocks, and the limits', () => {
 const m=base();
 assert.equal(moveStep(m,0,-1),-1);
 assert.equal(moveStep(m,0,1),1);assert.deepEqual(texts(m).slice(0,2),['two','one']);
 assert.equal(moveStep(m,1,-1),0);assert.deepEqual(texts(m).slice(0,2),['one','two']);
 const g=m.steps.findIndex(s=>s.type==='group');
 assert.equal(moveStep(m,g+1,-1),-1); // primeiro dentro do bloco: não sai pelo topo
 const els=m.steps.findIndex(s=>s.type==='else');assert.equal(moveStep(m,els,1),-1);
 const noteIdx=m.steps.findIndex(s=>s.type==='note');
 assert.equal(moveStep(m,noteIdx,-1),g);assert.equal(m.steps[g].type,'note');assert.equal(m.steps[g+1].type,'group'); // a nota passou para cima do bloco inteiro
 assert.equal(moveStep(m,g+1,1),m.steps.findIndex(s=>s.type==='group')); // o bloco desce por cima da última mensagem
 roundTrips(m);
 assert.equal(moveStep(m,m.steps.length-1,1),-1);
 const total=texts(m).length;for(let i=0;i<10;i++)moveStep(m,0,1);assert.equal(texts(m).length,total);roundTrips(m);
});
