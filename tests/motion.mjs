import assert from 'node:assert/strict';
import {launch} from './launch.mjs';
const browser=await launch();
try{
 const page=await browser.newPage({locale:'pt-BR',viewport:{width:1280,height:720},reducedMotion:'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173');
 await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
 // Deterministic rAF/timers; real time also advances CSS compositor animations.
 const advance=async ms=>{await page.clock.runFor(ms);await page.waitForTimeout(ms);};
 const edge=id=>page.locator(`#connections path[data-child="${id}"]`);
 const open=()=>page.locator('[data-id="mobility"] .node-title').evaluate(e=>e.click());
 const pos=()=>page.locator('[data-id="mobility-1"]').evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top)}));
 await open();const start=await pos();const firstD=await edge('mobility-1').getAttribute('d');
 assert.deepEqual(await page.locator('.is-presenting').evaluateAll(els=>els.map(e=>e.dataset.child)),['mobility-1']);
 const firstDash=await edge('mobility-1').evaluate(e=>+getComputedStyle(e).strokeDashoffset.replace('px',''));
 assert.ok(firstDash>0);
 await page.waitForTimeout(180);assert.ok(await edge('mobility-1').evaluate(e=>parseFloat(getComputedStyle(e).strokeWidth))>3);
 await advance(160);const mid=await pos();assert.notDeepEqual(mid,start);assert.notEqual(await edge('mobility-1').getAttribute('d'),firstD);
 await advance(350);const end=await pos();assert.notDeepEqual(mid,end);
 await advance(100);assert.deepEqual(await pos(),end);
 assert.ok(await edge('mobility-1').evaluate(e=>+getComputedStyle(e).strokeDashoffset.replace('px',''))<firstDash);
 await advance(500);assert.equal(await page.locator('.is-presenting').count(),0);
 await page.locator('#fit').click();await page.mouse.move(5,90);await page.waitForTimeout(200);
 const normal=await edge('nature').evaluate(e=>({w:parseFloat(getComputedStyle(e).strokeWidth),f:getComputedStyle(e).filter}));
 await page.locator('[data-id="nature"]').hover();await page.waitForTimeout(200);
 assert.deepEqual(await page.locator('.is-hovered').evaluateAll(els=>els.map(e=>e.dataset.child)),['nature']);
 const hover=await edge('nature').evaluate(e=>({w:parseFloat(getComputedStyle(e).strokeWidth),f:getComputedStyle(e).filter}));assert.ok(hover.w>normal.w);assert.notEqual(hover.f,normal.f);
 await page.mouse.move(5,90);await page.waitForTimeout(200);assert.equal(await page.locator('.is-hovered').count(),0);await page.waitForFunction(w=>Math.abs(parseFloat(getComputedStyle(document.querySelector('#connections path[data-child="nature"]')).strokeWidth)-w)<0.05,normal.w); // a transição do traço pode estar a meio caminho em runners lentos
 await page.locator('[data-id="root"]').hover();assert.equal(await page.locator('.is-hovered').count(),0);
 await page.locator('[data-id="root"] .node-title').evaluate(e=>e.click());await page.locator('[data-id="root"] .node-title').evaluate(e=>e.click());assert.equal(await page.locator('.is-presenting').getAttribute('data-child'),'mobility');
 await open();await open();await open();await advance(1200);
 assert.equal(await page.locator('[data-id="mobility-1"]').count(),0);assert.equal(await edge('mobility-1').count(),0);assert.equal(await page.locator('.is-presenting').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});await open();const reduced=await pos();await page.waitForTimeout(100);assert.deepEqual(await pos(),reduced);
 assert.equal(await edge('mobility-1').evaluate(e=>getComputedStyle(e).animationName),'none');assert.equal(await edge('mobility-1').evaluate(e=>getComputedStyle(e).strokeDasharray),'none');
 await page.locator('#fit').click();await page.locator('[data-id="nature"]').hover();assert.equal(await edge('nature').evaluate(e=>e.classList.contains('is-hovered')),true);
 // Establish final geometry independently via the existing non-animated expand-all action.
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#expand').click();
 const expected=await pos(),expectedPath=await edge('mobility-1').getAttribute('d');
 await page.locator('#collapse').click();await open();
 await page.clock.runFor(416);assert.notDeepEqual(await pos(),expected);
 await page.clock.runFor(20);assert.deepEqual(await pos(),expected);assert.equal(await edge('mobility-1').getAttribute('d'),expectedPath);
 await page.clock.runFor(563);assert.deepEqual(await page.locator('.is-presenting').evaluateAll(els=>els.map(e=>e.dataset.child)),['mobility-1']);
 await page.clock.runFor(1);assert.equal(await page.locator('.is-presenting').count(),0);
 await page.locator('#collapse').click();await page.emulateMedia({reducedMotion:'reduce'});await open();
 assert.deepEqual(await pos(),expected);assert.equal(await edge('mobility-1').getAttribute('d'),expectedPath);
 assert.deepEqual(await page.locator('.is-presenting').evaluateAll(els=>els.map(e=>e.dataset.child)),['mobility-1']);
 assert.ok(await edge('mobility-1').evaluate(e=>parseFloat(getComputedStyle(e).strokeWidth))>3);
 assert.notEqual(await edge('mobility-1').evaluate(e=>getComputedStyle(e).filter),'none');
 await page.clock.runFor(600);assert.deepEqual(await pos(),expected);assert.equal(await edge('mobility-1').getAttribute('d'),expectedPath);
 assert.deepEqual(errors,[]);console.log('PASS MOT-01..05');
}finally{await browser.close();}
