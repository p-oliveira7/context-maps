import assert from 'node:assert/strict';
import {tree} from '../model.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4173');
 await page.locator('.node').first().waitFor();
 const count=()=>page.locator('.node').count();
 const camera=()=>page.locator('#world').getAttribute('style');
 const ids=()=>page.locator('.node').evaluateAll(els=>els.map(el=>el.dataset.id).sort());
 const initialIds=['root','mobility','nature','community','future'].sort();
 const matrix=()=>page.locator('#world').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return {x:m.e,y:m.f,scale:m.a};});
 assert.equal(await count(),5); // MAP-01
 assert.deepEqual(await ids(),initialIds);
 await page.getByRole('button',{name:'Expandir tudo',exact:true}).click(); assert.equal(await count(),17); // MAP-02
 await page.getByRole('button',{name:'Recolher tudo',exact:true}).click(); assert.equal(await count(),5);
 await page.locator('[data-id="mobility"] .toggle').click(); assert.equal(await count(),8); // MAP-03
 assert.equal(await page.locator('[data-id="nature-1"]').count(),0);
 await page.locator('[data-id="mobility"] .toggle').click(); assert.equal(await count(),5);
 await page.locator('[data-id="mobility"] .toggle').click(); assert.equal(await count(),8);
 for(const branch of ['nature','community','future']){
  const beforeIds=await ids();
  await page.locator(`[data-id="${branch}"] .toggle`).click();
  assert.deepEqual(await ids(),[...beforeIds,...[1,2,3].map(n=>`${branch}-${n}`)].sort());
  await page.locator(`[data-id="${branch}"] .toggle`).click(); assert.deepEqual(await ids(),beforeIds);
 }
 const before=await camera();
 const beforeIds=await ids();
 await page.locator('#mode').click(); assert.equal(await page.locator('#reading h1, #reading h2, #reading h3').count(),17);
 assert.equal(await page.locator('#reading').isVisible(),true);
 assert.deepEqual(await page.locator('#reading h1, #reading h2, #reading h3').allTextContents(),[tree.title,...tree.children.flatMap(n=>[n.title,...n.children.map(c=>c.title)])]);
 assert.equal(await page.locator('#viewport').isVisible(),false);
 await page.locator('#mode').click(); assert.equal(await count(),8); assert.equal(await camera(),before); // MAP-04
 assert.deepEqual(await ids(),beforeIds);
 await page.getByRole('button',{name:'Ampliar ilustração'}).click(); assert.equal(await page.locator('dialog').isVisible(),true);
 await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog').isVisible(),false);
 assert.equal(await page.getByRole('button',{name:'Ampliar ilustração'}).evaluate(el=>el===document.activeElement),true); // MAP-07
 const panBefore=await camera(); await page.mouse.move(80,100); await page.mouse.down(); await page.mouse.move(150,140,{steps:5}); await page.mouse.up();
 assert.notEqual(await camera(),panBefore); assert.equal(await page.locator('dialog').isVisible(),false); // MAP-06
 await page.mouse.wheel(0,150); await page.waitForTimeout(100); assert.notEqual(await camera(),panBefore);
 const beforeWheel=await matrix(), area=await page.locator('#viewport').boundingBox();
 await page.mouse.move(area.x+200,area.y+150); await page.mouse.wheel(0,-150); await page.waitForTimeout(100);
 const afterWheel=await matrix(); assert.ok(afterWheel.scale>beforeWheel.scale);
 assert.ok(Math.abs((200-afterWheel.x)/afterWheel.scale-(200-beforeWheel.x)/beforeWheel.scale)<.01);
 assert.ok(Math.abs((150-afterWheel.y)/afterWheel.scale-(150-beforeWheel.y)/beforeWheel.scale)<.01);
 await page.mouse.wheel(0,-100000); await page.waitForTimeout(100); assert.equal((await matrix()).scale,2.5);
 await page.mouse.wheel(0,100000); await page.waitForTimeout(100); assert.equal((await matrix()).scale,.15);
 await page.locator('#zoom-in').click(); assert.ok((await matrix()).scale>.15);
 await page.locator('#zoom-out').click(); assert.ok(Math.abs((await matrix()).scale-.15)<.00001);
 await page.reload(); await page.locator('.node').first().waitFor(); assert.equal(await count(),5);
 for(const width of [1280,390]){
   await page.setViewportSize({width,height:width===390?844:720}); await page.waitForTimeout(100);
   await page.reload(); await page.locator('.node').first().waitFor();
   const initialBounds=await page.locator('#viewport').boundingBox();
   for(const el of await page.locator('.node').all()){
     const r=await el.boundingBox(); assert.ok(r.x>=initialBounds.x-1&&r.y>=initialBounds.y-1&&r.x+r.width<=initialBounds.x+initialBounds.width+1&&r.y+r.height<=initialBounds.y+initialBounds.height+1);
   }
   await page.getByRole('button',{name:'Enquadrar mapa'}).click();
   const bounds=await page.locator('#viewport').boundingBox();
   for(const el of await page.locator('.node').all()){
     const r=await el.boundingBox(); assert.ok(r.x>=bounds.x-1&&r.y>=bounds.y-1&&r.x+r.width<=bounds.x+bounds.width+1&&r.y+r.height<=bounds.y+bounds.height+1); // MAP-08
   }
   if(process.env.SHOT_DIR) await page.screenshot({path:`${process.env.SHOT_DIR}/preview-${width}.png`});
 }
 // MAP-09: tela cheia do navegador mantém o mapa igual
 await page.setViewportSize({width:1280,height:720}); await page.reload(); await page.locator('.node').first().waitFor();
 const fullscreen=page.locator('#fullscreen'), nodesBefore=await count();
 assert.equal(await fullscreen.getAttribute('aria-pressed'),'false');
 await fullscreen.click(); await page.waitForFunction(()=>!!document.fullscreenElement);
 assert.equal(await fullscreen.getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#fullscreen-label').textContent(),'Sair da tela cheia');
 assert.equal(await count(),nodesBefore);
 await page.getByRole('button',{name:'Expandir tudo',exact:true}).click(); assert.equal(await count(),17); // continua interativo
 await fullscreen.click(); await page.waitForFunction(()=>!document.fullscreenElement);
 assert.equal(await fullscreen.getAttribute('aria-pressed'),'false');
 // MAP-10: destaque no hover (cresce e a imagem fica maior), só na exibição e sem movimento reduzido
 await page.setViewportSize({width:1280,height:720}); await page.reload(); await page.locator('.node').first().waitFor();
 await page.getByRole('button',{name:'Expandir tudo',exact:true}).click();
 const hoverCard=page.locator('[data-id="nature"]'), scaleOf=()=>hoverCard.evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a);
 await page.mouse.move(2,300); await page.waitForTimeout(350); assert.equal(await scaleOf(),1);
 const rootImg=page.locator('[data-id="root"] .image-button img'), widthOf=async()=>(await rootImg.boundingBox()).width;
 const widthIdle=await widthOf();
 await page.locator('[data-id="root"]').hover(); await page.waitForTimeout(450);
 assert.ok(await widthOf()>widthIdle*1.05,'imagem deveria crescer no hover');
 await hoverCard.hover(); await page.waitForTimeout(450);
 assert.ok(await scaleOf()>1.04,'card deveria crescer no hover');
 const glass=await hoverCard.evaluate(e=>{const cs=getComputedStyle(e);const m=cs.backgroundColor.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);return {alpha:m.length>3?m[3]:1,filter:cs.backdropFilter||cs.webkitBackdropFilter};});
 assert.ok(glass.alpha<1&&glass.alpha>0,`fundo do card deveria ser translúcido (alpha ${glass.alpha})`);
 assert.match(glass.filter,/blur/); // desfoque (vidro fosco) em vez de fundo preto sólido
 await page.mouse.move(2,300); await page.waitForTimeout(450); assert.equal(await scaleOf(),1); // volta ao normal
 if(await page.locator('#edit-switch').isVisible()){ // em edição não cresce
  await page.locator('#edit-switch').click(); await page.locator('[data-id="nature"]').hover(); await page.waitForTimeout(450);
  assert.equal(await scaleOf(),1); await page.locator('#edit-switch').click();
 }
 await page.emulateMedia({reducedMotion:'reduce'}); await page.mouse.move(2,300); await hoverCard.hover(); await page.waitForTimeout(450);
 assert.equal(await scaleOf(),1); await page.emulateMedia({reducedMotion:'no-preference'});
 assert.deepEqual(errors,[]); console.log('PASS: MAP-01..10 browser scenarios, desktop + mobile');
} finally {await browser.close();}
