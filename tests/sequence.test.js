// Diagramas de sequência próprios: leitura (subconjunto do Mermaid), ida e volta, layout e SVG.
import test from 'node:test';
import assert from 'node:assert/strict';
import {isSequenceSource,parseSequence,stringifySequence,layoutSequence,renderSequence,defaultMeasure} from '../sequence.js';

const SAMPLE=`sequenceDiagram
  title Place order
  autonumber
  actor U as Customer
  participant API as Order API
  participant Pay as Payments
  U->>API: POST /orders
  activate API
  API->>+Pay: charge
  Pay-->>-API: 402 declined
  alt payment ok
    API->>U: 201 created
  else declined
    API-->>U: 402
    Note right of U: shows the error
  end
  API-)Pay: audit
  Note over U,API: done
  API->>API: validate
`;
const strip=model=>JSON.parse(JSON.stringify(model,(k,v)=>k==='line'?undefined:v));

test('isSequenceSource: only sequenceDiagram text (comments before are fine)', () => {
 assert.equal(isSequenceSource('sequenceDiagram\nA->>B: x'),true);
 assert.equal(isSequenceSource('%% a comment\nsequenceDiagram\nA->>B: x'),true);
 assert.equal(isSequenceSource('flowchart LR\nA-->B'),false);assert.equal(isSequenceSource(''),false);
});
test('parseSequence: participants, aliases, arrows, notes, groups and activation', () => {
 const m=parseSequence(SAMPLE);
 assert.equal(m.title,'Place order');assert.equal(m.autonumber,true);
 assert.deepEqual(m.participants.map(p=>[p.id,p.name,p.kind]),[['U','Customer','actor'],['API','Order API','participant'],['Pay','Payments','participant']]);
 const msgs=m.steps.filter(s=>s.type==='message');
 assert.deepEqual(msgs.map(s=>[s.from,s.to,s.text,s.style,s.head,s.activate]),[
  ['U','API','POST /orders','solid','arrow',''],['API','Pay','charge','solid','arrow','+'],['Pay','API','402 declined','dashed','arrow','-'],
  ['API','U','201 created','solid','arrow',''],['API','U','402','dashed','arrow',''],['API','Pay','audit','solid','async',''],['API','API','validate','solid','arrow','']]);
 assert.deepEqual(m.steps.filter(s=>s.type==='group'||s.type==='else'||s.type==='end').map(s=>s.type),['group','else','end']);
 assert.deepEqual(m.steps.find(s=>s.type==='note'&&s.position==='over').actors,['U','API']);
 assert.equal(m.steps.some(s=>s.type==='activate'),true);
});
test('parseSequence: implicit participants, every arrow kind, ids with dashes and spaces around arrows', () => {
 const m=parseSequence('sequenceDiagram\nWeb-App ->> Order-API : go\nA-->B: d\nA->B: o\nA-xB: lost\nA--xB: lost2\nA--)B: a2');
 assert.deepEqual(m.participants.map(p=>p.id),['Web-App','Order-API','A','B']);
 assert.deepEqual(m.steps.map(s=>s.head+'/'+s.style),['arrow/solid','open/dashed','open/solid','cross/solid','cross/dashed','async/dashed']);
});
test('parseSequence: errors carry a code and the line', () => {
 const err=(text,code,line)=>assert.throws(()=>parseSequence(text),e=>e.code===code&&(line===undefined||e.line===line),`${code}: ${text}`);
 err('flowchart LR\nA-->B','notSequence',1);
 err('sequenceDiagram\nA->>B: ok\nbox Aqua x\nend','unsupported',3);
 err('sequenceDiagram\nloop forever\nA->>B: x','noEnd',2);
 err('sequenceDiagram\nA->>B: x\nend','unexpectedEnd',3);
 err('sequenceDiagram\nA->>B: x\nelse y','unexpectedElse',3);
 err('sequenceDiagram\nA->>B no colon','missingColon',2);
 err('sequenceDiagram\nblah blah','syntax',2);
 err('sequenceDiagram\n  title only','empty');
});
test('stringifySequence: round trip keeps the model', () => {
 const m=parseSequence(SAMPLE),again=parseSequence(stringifySequence(m));
 assert.deepEqual(strip(again),strip(m));
 assert.match(stringifySequence(m),/^sequenceDiagram\n/);
});
test('layoutSequence: labels fit between their lifelines and nothing leaves the canvas', () => {
 const m=parseSequence(SAMPLE),L=layoutSequence(m),xs=L.participants.map(p=>p.x);
 assert.deepEqual([...xs].sort((a,b)=>a-b),xs);
 for(const it of L.items){
  if(it.kind==='message'&&!it.self){
   const w=Math.max(...it.lines.map(l=>defaultMeasure(l)));
   assert.ok(Math.abs(it.x2-it.x1)>=w+20,`"${it.lines[0]}" cabe entre as linhas (${Math.abs(it.x2-it.x1)} >= ${w})`);
  }
  if(it.kind==='note'){assert.ok(it.x>=0&&it.x+it.w<=L.width,`nota dentro do canvas (${it.x}..${it.x+it.w} de ${L.width})`);}
  if(it.kind==='message'&&it.self)assert.ok(it.tx+Math.max(...it.lines.map(l=>defaultMeasure(l)))<=L.width,'mensagem para si mesmo cabe');
 }
 const ys=L.items.filter(i=>i.kind==='message').map(i=>i.y);assert.deepEqual([...ys].sort((a,b)=>a-b),ys); // na ordem do texto
 const group=L.items.find(i=>i.kind==='group');
 assert.ok(group.y2>group.y1&&group.x2>group.x1);
 for(const it of L.items.filter(i=>i.kind==='message'&&i.step>group.step&&i.y<group.y2))assert.ok(it.y>group.y1);
 assert.ok(L.height>L.bottom&&L.width>0);
 assert.ok(L.bars.length>=1&&L.bars.every(b=>b.y2>b.y1));
});
test('layoutSequence: long labels widen the gap, notes to the left shift everything right, many participants stay ordered', () => {
 const long=layoutSequence(parseSequence('sequenceDiagram\nA->>B: '+'a very long label '.repeat(4)));
 const short=layoutSequence(parseSequence('sequenceDiagram\nA->>B: hi'));
 assert.ok(long.participants[1].x-long.participants[0].x>short.participants[1].x-short.participants[0].x+100);
 const left=layoutSequence(parseSequence('sequenceDiagram\nA->>B: hi\nNote left of A: a note that sticks out to the left side'));
 assert.ok(left.items.find(i=>i.kind==='note').x>=0);
 const many=layoutSequence(parseSequence('sequenceDiagram\n'+Array.from({length:9},(_,i)=>`P${i}->>P${i+1}: m${i}`).join('\n')));
 assert.equal(many.participants.length,10);assert.ok(many.width>many.participants.at(-1).x);
});
test('renderSequence: every step is addressable, text is escaped and the title/desc describe it', () => {
 const {svg,model}=renderSequence(SAMPLE);
 assert.match(svg,/^<svg [^>]*viewBox="0 0 \d+ \d+"/);assert.ok(svg.endsWith('</svg>'));
 const steps=[...svg.matchAll(/data-step="(\d+)"/g)].map(m=>Number(m[1]));
 for(const [i,s] of model.steps.entries())if(['message','note','group','else'].includes(s.type))assert.ok(steps.includes(i),`passo ${i} (${s.type}) tem data-step`);
 assert.equal((svg.match(/class="seq-step seq-msg"/g)||[]).length,7);
 assert.match(svg,/data-from="U" data-to="API"/);assert.match(svg,/<title>Place order<\/title>/);assert.match(svg,/<desc>Customer to Order API: POST \/orders/);
 const evil=renderSequence('sequenceDiagram\nA->>B: <script>alert(1)</script> & "x"').svg;
 assert.equal(evil.includes('<script>'),false);assert.match(evil,/&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;/);
 const open=(svg.match(/<g\b/g)||[]).length,close=(svg.match(/<\/g>/g)||[]).length;assert.equal(open,close);
 assert.equal(renderSequence('sequenceDiagram\nA->>B: one<br/>two').svg.includes('>two<'),true); // <br/> vira outra linha
});
test('renderSequence: autonumber prefixes the labels and a custom measure is used', () => {
 const {svg}=renderSequence('sequenceDiagram\nautonumber\nA->>B: x\nB->>A: y');
 assert.match(svg,/>1\. x</);assert.match(svg,/>2\. y</);
 const wide=renderSequence('sequenceDiagram\nA->>B: hello',{measure:t=>t.length*20}).layout.width;
 assert.ok(wide>renderSequence('sequenceDiagram\nA->>B: hello').layout.width);
});
