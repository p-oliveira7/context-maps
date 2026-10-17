import assert from 'node:assert/strict';
import {tree} from '../model.js';
import {launch} from './launch.mjs';
const browser=await launch();
try {
 const page=await browser.newPage({locale:'pt-BR',viewport:{width:1280,height:720}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173');
 const ids=()=>page.locator('.node').evaluateAll(els=>els.map(e=>e.dataset.id).sort());
 const title=id=>page.locator(`[data-id="${id}"] .node-title`);
 await title('mobility').click();const eight=await ids();assert.equal(eight.length,8);
 await title('nature').click();assert.deepEqual(await ids(),[...eight,'nature-1','nature-2','nature-3'].sort());
 await title('nature').click();assert.deepEqual(await ids(),eight);
 await title('root').click();assert.deepEqual(await ids(),['root']);
 await page.locator('#mode').click();await page.locator('#mode').click();assert.deepEqual(await ids(),['root']);
 await title('root').press('Enter');assert.deepEqual(await ids(),eight);
 assert.equal(await title('root').evaluate(e=>e===document.activeElement),true);
 await title('mobility').press('Space');assert.equal((await ids()).length,5);
 assert.equal(await title('mobility').evaluate(e=>e===document.activeElement),true);
 await page.locator('#expand').click();assert.equal((await ids()).length,17);
 assert.equal(await page.locator('[data-id="mobility-1"] .node-title').count(),0);
 const nodes=[tree,...tree.children.flatMap(n=>[n,...n.children])];
 const media=nodes.filter(n=>n.image);assert.ok(media.some(n=>n.id==='root'));assert.ok(media.some(n=>n.id!=='root'&&n.children.length));assert.ok(media.some(n=>!n.children.length));
 for(const node of nodes){
  const img=page.locator(`[data-id="${node.id}"] .image-button img`);
  assert.equal(await img.count(),node.image?1:0);
  if(!node.image)continue;
  assert.equal(await img.getAttribute('src'),node.image.src);assert.equal(await img.getAttribute('alt'),node.image.alt);
  assert.equal(await img.evaluate(e=>e.complete&&e.naturalWidth>0),true);
  const before=await ids();const button=page.locator(`[data-id="${node.id}"] .image-button`);await button.click();
  assert.equal(await page.locator('dialog').isVisible(),true);assert.equal(await page.locator('dialog img').getAttribute('src'),node.image.src);assert.equal(await page.locator('dialog img').getAttribute('alt'),node.image.alt);assert.deepEqual(await ids(),before);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);assert.equal(await button.evaluate(e=>e===document.activeElement),true);
 }
 await page.locator('#mode').click();assert.equal(await page.locator('#reading img').count(),media.length);
 assert.deepEqual(await page.locator('#reading img').evaluateAll(els=>els.map(e=>({src:e.getAttribute('src'),alt:e.alt}))),media.map(n=>n.image));
 assert.deepEqual(errors,[]);console.log('PASS CARD-01..06');
}finally{await browser.close();}
