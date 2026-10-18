// Gera as imagens da documentação (docs/images/*.png), com a interface em inglês, a partir da apresentação de exemplo em inglês.
// Uso: PLAYWRIGHT_MODULE=file:///caminho/playwright-core/index.mjs node docs/screenshots.mjs
// (BROWSER_EXECUTABLE escolhe o Chrome/Chromium.) Trabalha numa cópia temporária: não altera presentations/ nem collections/.
import {spawn} from 'node:child_process';
import {cp,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {launch}=await import(pathToFileURL(path.join(root,'tests','launch.mjs')).href);
const out=path.join(root,'docs','images');
await mkdir(out,{recursive:true});
const EXAMPLE='cities-for-people';
const work=await mkdtemp(path.join(tmpdir(),'cm-shots-'));
await mkdir(path.join(work,'presentations'));
await cp(path.join(root,'presentations',`${EXAMPLE}.json`),path.join(work,'presentations',`${EXAMPLE}.json`)); // só o exemplo (não leva apresentações suas)
await cp(path.join(root,'presentations',EXAMPLE),path.join(work,'presentations',EXAMPLE),{recursive:true});
await cp(path.join(root,'collections','context-maps-api'),path.join(work,'collections','context-maps-api'),{recursive:true});
const port=4210,base=`http://127.0.0.1:${port}`;
await writeFile(path.join(work,'collections','context-maps-api','environments','local.bru'),`vars {\n  host: ${base}\n}\n`);
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise(r=>server.stdout.once('data',r));
const browser=await launch();
const page=await (await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1.5,extraHTTPHeaders:{'x-context-maps':'1'},locale:'en-US'})).newPage();
const shot=(name,clip)=>page.screenshot({path:path.join(out,name),...(clip?{clip}:{})});
const settle=ms=>page.waitForTimeout(ms);
const card=title=>page.locator('.node').filter({has:page.getByText(title,{exact:true})}).first();
// Posiciona a câmera (só para as imagens): centraliza um grupo de cards, na maior escala em que eles cabem (até `cap`).
const frame=async(locators,{cap=1,margin=.8,dx=0,dy=0,scale}={})=>{
 const ids=[];for(const l of locators)ids.push(await l.getAttribute('data-id'));
 await page.evaluate(({ids,cap,margin,dx,dy,scale})=>{
  const els=ids.map(id=>document.querySelector(`[data-id="${id}"]`)),v=document.querySelector('#viewport'),w=document.querySelector('#world');
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const el of els){const x=parseFloat(el.style.left),y=parseFloat(el.style.top);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+el.offsetWidth);y1=Math.max(y1,y+el.offsetHeight);}
  const k=scale||Math.min(cap,v.clientWidth*margin/(x1-x0),v.clientHeight*margin/(y1-y0));
  w.style.transform=`translate(${v.clientWidth/2-(x0+x1)/2*k+dx}px, ${v.clientHeight/2-(y0+y1)/2*k+dy}px) scale(${k})`;
  document.querySelector('#zoom-level').textContent=`${Math.round(k*100)}%`;
 },{ids,cap,margin,dx,dy,scale});
};
const expand=async title=>{const t=card(title).locator('.toggle').first();if(await t.getAttribute('aria-expanded')==='false'){await t.click();await settle(250);}};
const hideToast=()=>page.evaluate(()=>{const t=document.querySelector('#toast');if(t)t.hidden=true;});
const closeApi=async()=>{if(await page.locator('#api-panel').isVisible()){await page.locator('#api-panel button[aria-label="Close API client"]').click();await settle(500);}};

await page.goto(`${base}/?p=${EXAMPLE}`);await page.locator('.node').first().waitFor();await settle(600);

// 1) visão geral: três cards raiz
await page.locator('#fit').click();await settle(400);
await shot('01-overview.png');

// 2) hover: o card cresce e o subtítulo aparece dentro dele
await expand('How do we want to move?');
const mover=card('How do we want to move?');
await frame([mover,card('Sidewalks that invite walking'),card('Less time in traffic, more time for life')],{cap:1.1,margin:.7});await settle(300);
await mover.hover();await settle(800);
await shot('02-hover-subtitle.png',{x:200,y:210,width:1040,height:430});

// 3) imagens, diagramas e links no mesmo card
await page.mouse.move(5,5);await page.locator('#fit').click();
await expand('Images');await expand('Links');await expand('Mermaid diagrams');
await frame([card('One image'),card('Several images in the same card'),card('Image and diagram together'),card('Flowchart')],{cap:.8,margin:.8,dx:-60,dy:-20});await settle(500);
await page.mouse.move(5,5);
await shot('03-media-links.png');

// 4) modo de edição + roda de ações
await page.locator('#edit-switch').click();await settle(300);
const edited=card('Another starting point');
await frame([edited],{scale:1.15,dx:-60,dy:30});await settle(300);
await edited.hover();await settle(300);
await edited.locator('.edit-fab').click();await settle(800);
await shot('04-edit-wheel.png',{x:180,y:70,width:1080,height:640});
await page.keyboard.press('Escape');await settle(300);

// 5) cor das ligações: paleta + alcance
const branch=card('Where does nature meet the city?');
await page.locator('#fit').click();await settle(300);
await expand('Where does nature meet the city?');
await frame([branch,card('A tree changes the experience of a street'),card('Small parks a few steps from home')],{scale:.85,dx:-330,dy:0});await settle(300);
await branch.hover();await settle(300);
await branch.locator('.edit-fab').click();await settle(500);
await page.locator('#radial-menu [aria-label^="Line colour"]').click();await settle(400);
await page.locator('#color-panel .cp-swatch[data-color="#6fa3d6"]').click();await settle(300);
await shot('05-line-colors.png');
await page.keyboard.press('Escape');await settle(300);

// 6) mover: o conjunto acompanha o cursor e o destino pulsa
await page.locator('#fit').click();await settle(300);
await expand('What brings us closer together?');await expand('Where do we start the change?');
const parent=card('What brings us closer together?');
await parent.hover();await settle(300);
const handle=await parent.locator('.drag-handle').boundingBox();
await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
await page.mouse.move(handle.x+30,handle.y+30,{steps:4});await settle(300); // o conjunto sai do mapa e o layout se reorganiza
await frame([card('How do we want to move?'),card('Where do we start the change?'),card('Listen to those who already live there'),card('Measure what improves daily life')],{cap:.95,margin:.8,dx:-200});await settle(300);
const target=await card('Listen to those who already live there').boundingBox();
await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:14});await settle(700);
await shot('06-drag-move.png');
await page.keyboard.press('Escape');await page.mouse.up();await settle(400);
await hideToast();

// 7) editor de diagramas Mermaid
await page.locator('#fit').click();await settle(300);
await expand('Mermaid diagrams');
const diagramCard=card('Flowchart');
await frame([diagramCard],{scale:.9,dx:-120});await settle(300);
await diagramCard.hover();await settle(300);
await diagramCard.locator('.image-tools button',{hasText:'Edit'}).first().click();
await page.locator('#diagram-preview img').waitFor({timeout:30000});await settle(700);
await shot('07-diagram-editor.png');
await page.keyboard.press('Escape');await settle(300);

// 8) salvar como em outra pasta
await page.locator('#doc-button').click();await page.locator('#doc-saveas').click();
await page.locator('#saveas-modal').waitFor();
await page.locator('#saveas-name').fill('Atlas project map');
await page.locator('#saveas-folder').selectOption('__other');
await page.locator('#saveas-path').fill('D:\\Projects\\atlas\\docs\\maps');
await settle(400);
await shot('08-save-as.png',{x:330,y:140,width:780,height:540});
await page.keyboard.press('Escape');await settle(300);

// 9) modo texto
await page.locator('#edit-switch').click();await settle(200);
await page.locator('#mode').click();await settle(700);
await shot('09-text-mode.png');
await page.locator('#mode').click();await settle(400); // volta do modo texto

// 10) cliente de API: coleção anexada a um card e uma request enviada (tela dividida)
await page.goto(`${base}/?p=${EXAMPLE}`);await page.locator('.node').first().waitFor();await settle(400);
await page.locator('#expand').click();await settle(400);
await page.locator('#api-btn').click();await page.locator('.api-row-name',{hasText:'Get a presentation'}).waitFor();
await page.locator('#search-btn').click();await page.keyboard.type('Attach a collection');await page.keyboard.press('Enter');await settle(900);
await page.locator('.api-row-name',{hasText:'Get a presentation'}).click();await page.locator('.api-req-title strong').waitFor();
await page.locator('.api-send').click();await page.locator('.api-status strong').waitFor();await settle(500);
await shot('10-api-client.png');

// 11) variáveis coloridas: sem valor (vermelho), com valor (verde) e o painel ao passar o mouse
await page.locator('.api-url').fill('{{host}}/api/presentations/:id?token={{token}}&t={{$timestamp}}');await settle(300);
{const b=await page.locator('.api-urlbar .api-var',{hasText:'{{token}}'}).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);}
await settle(800);
await shot('11-api-variables.png',{x:720,y:0,width:720,height:480});
await page.mouse.move(5,5);await settle(300);

// 12) scripts, asserts e testes: resultado na aba Tests
await page.locator('.api-row-name',{hasText:'List presentations'}).click();await page.locator('.api-req-title strong',{hasText:'List presentations'}).waitFor();
await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Tests'}).click();await settle(500);
await shot('12-api-tests.png',{x:720,y:0,width:720,height:810});
await closeApi();

// 13) busca de ideias
await page.locator('#fit').click();await settle(300);
await page.locator('#search-btn').click();await page.keyboard.type('tree');await settle(500);
await shot('13-search.png',{x:240,y:40,width:960,height:360});
await page.keyboard.press('Escape');await settle(300);

// 14) ideias relacionadas: linha pontilhada e selo
await expand('Resource guide');await expand('Related ideas');
await frame([card('Cards can point to each other'),card('Even across branches')],{scale:.75,dx:140,dy:-70});await settle(400);
await card('Cards can point to each other').hover();await settle(600);
await shot('14-related-ideas.png');
await page.mouse.move(5,5);

// 15) menu das apresentações: exportar e importar
await page.locator('#fit').click();await settle(300);
await page.locator('#doc-button').click();await settle(500);
await shot('15-export-menu.png',{x:0,y:0,width:720,height:420});
await page.keyboard.press('Escape');

await browser.close();server.kill();await rm(work,{recursive:true,force:true});
console.log(`Imagens geradas em ${out}`);
