import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tree, visibleNodes, allBranches, zoomAt} from '../model.js';
import {VERSION} from '../version.js';
test('MAP-01: root and four branches initially',()=>assert.equal(visibleNodes(tree,new Set(['root'])).length,5));
test('MAP-02: all 17 nodes and collapse to five',()=>{
 assert.equal(visibleNodes(tree,allBranches(tree)).length,17);
 assert.equal(visibleNodes(tree,new Set(['root'])).length,5);
});
test('MAP-03: one branch adds exactly its three children',()=>{
 const nodes=visibleNodes(tree,new Set(['root','mobility']));
 assert.equal(nodes.length,8);
 assert.deepEqual(nodes.filter(n=>n.id.startsWith('mobility-')).map(n=>n.id),['mobility-1','mobility-2','mobility-3']);
 assert.equal(nodes.some(n=>n.id==='nature-1'),false);
});
test('MAP-05: zoom bounds and fixed anchor',()=>{
 const c={x:20,y:30,scale:1}, p={x:220,y:130};
 const z=zoomAt(c,2,p);
 assert.equal(z.scale,2); assert.equal((p.x-z.x)/z.scale,200); assert.equal((p.y-z.y)/z.scale,100);
 assert.equal(zoomAt(c,100,p).scale,2.5); assert.equal(zoomAt(c,0.001,p).scale,0.15);
});
test('VERSION: version.js, package.json and the changelog agree',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(VERSION,pkg.version);
 assert.match(VERSION,/^\d+\.\d+\.\d+$/);
 const log=readFileSync(new URL('../CHANGELOG.md',import.meta.url),'utf8');
 assert.ok(log.includes(`## [${VERSION}] - `),`CHANGELOG.md has no section for ${VERSION}`);
 assert.ok(log.includes('## [Unreleased]'));
});
import {writeZip,readZip,crc32} from '../zip.mjs';
test('ZIP: round trip keeps names and bytes (stored and deflated), and ignores unsafe paths',()=>{
 const big=Buffer.alloc(5000,'abc');
 const zip=writeZip([{name:'a.json',data:Buffer.from('{"x":1}')},{name:'pasta/grande.txt',data:big},{name:'../fora.txt',data:Buffer.from('x')},{name:'ç/ã.txt',data:Buffer.from('acentos')}]);
 const out=readZip(zip);
 assert.deepEqual(out.map(e=>e.name),['a.json','pasta/grande.txt','ç/ã.txt']); // "../fora.txt" é ignorado
 assert.deepEqual(out[1].data,big);assert.equal(out[0].data.toString(),'{"x":1}');
 assert.ok(zip.length<5000,'o arquivo grande deveria ser comprimido');
 assert.equal(crc32(Buffer.from('123456789')),0xCBF43926);
 assert.throws(()=>readZip(Buffer.from('não é zip')),/zip/);
 assert.throws(()=>readZip(zip,{maxTotal:100}),/grande demais/);
});
