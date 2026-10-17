// Gera docs/images/demo.gif: o agente pede um mapa, a skill valida e cria, e o mapa é explorado no app (comandos reais, servidor temporário).
// Uso: PLAYWRIGHT_MODULE=file:///caminho/playwright-core/index.mjs node docs/demo.mjs
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {decodePng,encodeGif} from './gif.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {launch}=await import(pathToFileURL(path.join(root,'tests','launch.mjs')).href);
const W=1120,H=630,port=4195,base=`http://127.0.0.1:${port}`;

// --- servidor temporário e comandos reais da skill ---
const work=await mkdtemp(path.join(tmpdir(),'cm-demo-'));
await mkdir(path.join(work,'src'));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise(r=>server.stdout.once('data',r));
const outline=`# Checkout flow [subtitle:From cart to confirmation: what happens at each step]
- Cart {color=#6fa3d6} [subtitle:Items, quantities and promo codes]
  - Add and remove items
  - Apply promo code
- Shipping {color=#d4a458}
  - Address validation [link:https://example.com/docs/shipping|Shipping API]
  - Delivery options [rel:Payment methods]
- Payment {color=#c76a61} [subtitle:Cards, wallets and bank transfer]
  - Payment methods
  - Fraud checks
- Confirmation {color=#7fb59a}
  - Order e-mail [rel:Fraud checks]
`;
await writeFile(path.join(work,'src','checkout.md'),outline);
const cli=path.join(root,'skills','context-maps','scripts','rm.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{cwd:path.join(work,'src'),encoding:'utf8',env:{...process.env,RM_URL:base,RM_LANG:'en'}});
const validated=JSON.parse(run(['validate','--outline','checkout.md']).stdout);
const created=JSON.parse(run(['create','--outline','checkout.md','--id','checkout']).stdout);
const short=o=>JSON.stringify(o).replace(/","/g,'", "').replace(/,"/g,', "');

const browser=await launch();
const frames=[];
const add=async(page,delay)=>{const d=decodePng(await page.screenshot({type:'png'}));if(d.width!==W||d.height!==H)throw new Error('tamanho inesperado do quadro');frames.push({rgba:d.rgba,delay});};
const hold=ms=>{frames.at(-1).delay+=ms;};
const caption=(page,text)=>page.evaluate(t=>{let el=document.getElementById('demo-caption');if(!el){el=document.createElement('div');el.id='demo-caption';el.style.cssText='position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;padding:7px 16px;border-radius:999px;background:#000b;border:1px solid #ffffff2a;color:#fff;font:600 15px system-ui,sans-serif;letter-spacing:.2px;pointer-events:none';document.body.append(el);}el.textContent=t;},text);

try{
 // ---- cena 1: terminal ----
 const term=await (await browser.newContext({viewport:{width:W,height:H},locale:'en-US'})).newPage();
 await term.setContent(`<body style="margin:0;background:#0d0d0d;font:17px/1.6 Consolas,'Cascadia Mono',monospace;color:#d7d7d7">
  <div style="margin:70px 56px 0;border:1px solid #ffffff22;border-radius:12px;background:#151515;box-shadow:0 20px 60px #000a;overflow:hidden">
   <div style="padding:9px 14px;background:#1d1d1d;border-bottom:1px solid #ffffff17;color:#9a9a9a;font-size:13px">~/my-shop — agent session</div>
   <pre id="t" style="margin:0;padding:18px 20px;min-height:400px;white-space:pre-wrap;word-break:break-all"></pre></div></body>`);
 const screen=[];const draw=()=>term.evaluate(html=>{document.getElementById('t').innerHTML=html;},screen.join('\n'));
 const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
 const you='<span style="color:#e4c583">you ›</span> ',sh='<span style="color:#7fb59a">$</span> ';
 await caption(term,'1 · Ask your agent for a map');
 const typeLine=async(prefix,text,color='#fff',chunk=3,delay=55)=>{
  screen.push(prefix);
  for(let i=chunk;i<text.length+chunk;i+=chunk){screen[screen.length-1]=prefix+`<span style="color:${color}">${esc(text.slice(0,i))}</span>`;await draw();await add(term,delay);}
 };
 await draw();await add(term,400);
 await typeLine(you,"Map this shop's checkout flow with Context Maps",'#fff',3,60);hold(500);
 await caption(term,'2 · The skill validates the outline and builds the map');
 screen.push('');
 await typeLine(sh,'node skills/context-maps/scripts/rm.mjs validate --outline checkout.md','#cfe8ff',4,45);
 screen.push(`<span style="color:#8a8a8a">${esc(short({title:validated.title,roots:validated.roots,nodes:validated.nodes,depth:validated.depth,warnings:validated.warnings}))}</span>`);await draw();await add(term,700);
 await typeLine(sh,'node skills/context-maps/scripts/rm.mjs create --outline checkout.md --id checkout','#cfe8ff',4,45);
 screen.push(`<span style="color:#8a8a8a">${esc(short({id:created.id,url:created.url,nodes:created.nodes,links:created.links,warnings:created.warnings}))}</span>`);await draw();await add(term,900);
 hold(700);
 await term.close();

 // ---- cena 2: o mapa no app ----
 const page=await (await browser.newContext({viewport:{width:W,height:H},locale:'en-US',extraHTTPHeaders:{'x-context-maps':'1'}})).newPage();
 await page.goto(created.url);await page.locator('.node').first().waitFor();await page.waitForTimeout(500);
 await caption(page,'3 · Explore it: expand every branch');
 await add(page,900);
 await page.locator('#expand').click();
 for(let i=0;i<7;i++){await page.waitForTimeout(65);await add(page,70);}
 await page.waitForTimeout(300);await add(page,700);
 const card=t=>page.locator('.node').filter({has:page.getByText(t,{exact:true})}).first();
 await caption(page,'Hover a card for its subtitle');
 await card('Payment').first().hover();await page.waitForTimeout(450);await add(page,1200);
 await page.mouse.move(8,H-8);
 await caption(page,'Related ideas are linked across branches');
 await card('Delivery options').hover();await page.waitForTimeout(350);await add(page,1300);
 await page.mouse.move(8,H-8);
 await caption(page,'Search anything (Ctrl+K)');
 await page.keyboard.press('Control+k');await page.waitForTimeout(150);await add(page,500);
 for(const chunk of ['fr','a','ud']){await page.keyboard.type(chunk);await page.waitForTimeout(120);await add(page,320);}
 await add(page,700);
 await page.keyboard.press('Enter');await page.waitForTimeout(550);await add(page,1200);
 await caption(page,'Edit: wheel of actions, drag to move, undo/redo');
 await page.locator('#edit-switch').click();await page.waitForTimeout(250);await add(page,500);
 await page.locator('#fit').click();await page.waitForTimeout(250);
 const cart=card('Cart');await cart.hover();await page.waitForTimeout(250);
 await cart.locator('.edit-fab').click();await page.waitForTimeout(700);await add(page,1700);
 await page.keyboard.press('Escape');await page.waitForTimeout(350);
 await caption(page,'Export as HTML or ZIP · import them back');
 await page.locator('#doc-button').click();await page.waitForTimeout(400);await add(page,1900);
 await page.keyboard.press('Escape');
 await page.locator('#edit-switch').click();await page.waitForTimeout(300);
 await add(page,500);
 await page.close();
}finally{await browser.close();server.kill();await rm(work,{recursive:true,force:true});}

const gif=encodeGif({width:W,height:H,frames,colors:255});
const out=path.join(root,'docs','images','demo.gif');
await writeFile(out,gif);
console.log(`demo.gif: ${frames.length} quadros, ${(gif.length/1024/1024).toFixed(2)} MB`);
