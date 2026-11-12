// Formato .flow da skill (texto → desenho do Excalidraw) e o caminho destacado no app
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlow,layoutFlow,flowToScene,flowToSvg} from '../skills/context-maps/scripts/flow.mjs';
import {pathTo,shapeAt,dimmed,overlaySvg} from '../drawing.js';

const FLOW=['# Criar pedido','client: App cliente','auth: Token válido? [diamond]','e401: 401 [ellipse] {color=#e03131}','etag: If-Match? [diamond]','e412: 412 Precondition\\nFailed [ellipse]','ok: 201 Created [ellipse]',
 'client -> auth: POST /orders','auth -> e401: não','auth -> etag: sim','etag -> e412: não','etag -> ok: sim',''].join('\n');

test('parseFlow lê quadros, formas, cores, setas e rótulos', ()=>{
 const f=parseFlow(FLOW);
 assert.equal(f.title,'Criar pedido');assert.equal(f.direction,'right');assert.deepEqual(f.warnings,[]);
 assert.deepEqual(f.nodes.map(n=>[n.id,n.shape]),[['client','rectangle'],['auth','diamond'],['e401','ellipse'],['etag','diamond'],['e412','ellipse'],['ok','ellipse']]);
 assert.equal(f.nodes.find(n=>n.id==='e412').label,'412 Precondition\nFailed');
 assert.equal(f.nodes.find(n=>n.id==='e401').color,'#e03131');
 assert.deepEqual(f.edges[0],{from:'client',to:'auth',label:'POST /orders'});
 // quadro não declarado vira um quadro com o id como rótulo; linha estranha vira aviso
 const g=parseFlow('direction: down\na -> b\nisso não é nada\nx: y [hexagon]');
 assert.equal(g.direction,'down');assert.deepEqual(g.nodes.map(n=>n.label),['a','b','y']);assert.equal(g.warnings.length,2);
});

test('layoutFlow põe cada passo numa camada e não sobrepõe quadros', ()=>{
 const f=parseFlow(FLOW),{box}=layoutFlow(f);
 const x=id=>box.get(id).x;
 assert.ok(x('client')<x('auth')&&x('auth')<x('etag')&&x('etag')<x('e412'));
 const list=[...box.values()];
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'quadros sobrepostos');}
 // ciclos não travam o layout
 const c=layoutFlow(parseFlow('a -> b\nb -> c\nc -> a: de novo'));assert.equal(c.box.size,3);assert.equal(c.back.size,1);
});

test('flowToScene gera setas presas aos quadros e textos dentro deles', ()=>{
 const {elements}=flowToScene(parseFlow(FLOW));
 const shapes=elements.filter(e=>['rectangle','diamond','ellipse'].includes(e.type)),arrows=elements.filter(e=>e.type==='arrow'),texts=elements.filter(e=>e.type==='text');
 assert.equal(shapes.length,6);assert.equal(arrows.length,5);assert.equal(texts.length,6+5);
 const ids=new Set(shapes.map(s=>s.id));
 for(const a of arrows){assert.ok(ids.has(a.startBinding.elementId)&&ids.has(a.endBinding.elementId));assert.equal(a.points[0].join(),'0,0');}
 for(const s of shapes){const t=texts.find(x=>x.containerId===s.id);assert.ok(t,'texto no quadro');assert.ok(s.boundElements.some(b=>b.id===t.id));}
 assert.equal(new Set(elements.map(e=>e.id)).size,elements.length);
});

test('flowToSvg desenha a miniatura com os rótulos', ()=>{
 const svg=flowToSvg(parseFlow(FLOW));
 assert.match(svg,/^<svg/);assert.match(svg,/App cliente/);assert.match(svg,/Precondition/);assert.equal((svg.match(/marker-end/g)||[]).length,5);
 assert.doesNotMatch(flowToSvg(parseFlow('a: <script>')),/<script>/);
});

test('pathTo: clicar no 412 acende só o caminho até ele, do início ao fim', ()=>{
 const {elements}=flowToScene(parseFlow(FLOW));
 const byFlow=id=>elements.find(e=>e.customData?.flowId===id);
 const p=pathTo(elements,byFlow('e412').id);
 assert.deepEqual([...p.nodes].map(id=>elements.find(e=>e.id===id).customData.flowId).sort(),['auth','client','e412','etag']);
 assert.equal(p.arrows.size,3);
 assert.ok(p.order.get(byFlow('client').id)<p.order.get(byFlow('auth').id)&&p.order.get(byFlow('etag').id)<p.order.get(byFlow('e412').id));
 // o resto fica apagado; o caminho (e os textos dele) mantém a cor
 const dim=dimmed(elements,p);
 assert.equal(dim.find(e=>e.id===byFlow('ok').id).opacity,18);assert.equal(dim.find(e=>e.id===byFlow('client').id).opacity,100);
 assert.equal(dim.find(e=>e.containerId===byFlow('auth').id).opacity,100);
 // camada amarela: tudo até o último passo; no passo 0, só o início
 const all=overlaySvg(elements,p,Infinity,{zoom:1,scrollX:0,scrollY:0});
 assert.equal((all.match(/dw-hl-node/g)||[]).length,4);assert.equal((all.match(/dw-hl-arrow/g)||[]).length,3);
 assert.equal((overlaySvg(elements,p,0,{zoom:1,scrollX:0,scrollY:0}).match(/dw-hl-/g)||[]).length,1);
});

test('shapeAt acha o quadro sob o ponto (texto conta como o quadro)', ()=>{
 const {elements}=flowToScene(parseFlow(FLOW)),s=elements.find(e=>e.customData?.flowId==='auth');
 assert.equal(shapeAt(elements,s.x+s.width/2,s.y+s.height/2).id,s.id);
 assert.equal(shapeAt(elements,-9999,-9999),null);
});
