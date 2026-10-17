// Gera as imagens da documentação (docs/images/*.png) a partir da apresentação de exemplo.
// Uso: PLAYWRIGHT_MODULE=file:///caminho/playwright-core/index.mjs node docs/screenshots.mjs
// (BROWSER_EXECUTABLE escolhe o Chrome/Chromium.) Não altera a pasta presentations/ do repositório.
import {spawn} from 'node:child_process';
import {cp,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'docs','images');
await mkdir(out,{recursive:true});
const work=await mkdtemp(path.join(tmpdir(),'cm-shots-'));
await cp(path.join(root,'presentations'),path.join(work,'presentations'),{recursive:true});
await cp(path.join(root,'collections'),path.join(work,'collections'),{recursive:true}); // a coleção de exemplo do cliente de API
await writeFile(path.join(work,'collections','context-maps-api','environments','local.bru'),'vars {\n  host: http://127.0.0.1:4210\n}\n');
const port=4210,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise(r=>server.stdout.once('data',r));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await (await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1.5,extraHTTPHeaders:{'x-context-maps':'1'},locale:'pt-BR'})).newPage();
const shot=(name,clip)=>page.screenshot({path:path.join(out,name),...(clip?{clip}:{})});
const settle=ms=>page.waitForTimeout(ms);
const card=title=>page.locator('.node',{hasText:title}).first();
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
const centerOn=(locator,scale,dx=0,dy=0)=>frame([locator],{scale,dx,dy});
const expand=async title=>{const t=card(title).locator('.toggle').first();if(await t.getAttribute('aria-expanded')==='false'){await t.click();await settle(250);}};
const hideToast=()=>page.evaluate(()=>{const t=document.querySelector('#toast');if(t)t.hidden=true;});

await page.goto(base);await page.locator('.node').first().waitFor();await settle(600);

// 1) visão geral: três cards raiz
await page.locator('#fit').click();await settle(400);
await shot('01-overview.png');

// 2) hover: o card cresce e o subtítulo aparece dentro dele
await expand('Como queremos nos mover?');
const mover=card('Como queremos nos mover?');
await frame([mover,card('Calçadas que convidam a caminhar'),card('Menos tempo no trânsito')],{cap:1.1,margin:.7});await settle(300);
await mover.hover();await settle(800);
await shot('02-hover-subtitle.png',{x:200,y:210,width:1040,height:430});

// 3) imagens, diagramas e links no mesmo card
await page.mouse.move(5,5);await page.locator('#fit').click();
await expand('Imagens');await expand('Links');await expand('Diagramas Mermaid');
await frame([card('Uma imagem'),card('Várias imagens no mesmo card'),card('Imagem e diagrama juntos'),card('Fluxograma')],{cap:.8,margin:.8,dx:-60,dy:-20});await settle(500);
await page.mouse.move(5,5);
await shot('03-media-links.png');

// 4) modo de edição + roda de ações
await page.locator('#edit-switch').click();await settle(300);
const edited=card('Outro ponto de partida');
await frame([edited],{scale:1.15,dx:-60,dy:30});await settle(300);
await edited.hover();await settle(300);
await edited.locator('.edit-fab').click();await settle(800);
await shot('04-edit-wheel.png',{x:180,y:70,width:1080,height:640});
await page.keyboard.press('Escape');await settle(300);

// 5) cor das ligações: paleta + alcance
const branch=card('Onde a natureza encontra a cidade?');
await page.locator('#fit').click();await settle(300);
await expand('Onde a natureza encontra a cidade?');
await frame([branch,card('Uma árvore muda a experiência'),card('Pequenos parques a poucos passos')],{scale:.85,dx:-330,dy:0});await settle(300);
await branch.hover();await settle(300);
await branch.locator('.edit-fab').click();await settle(500);
await page.locator('#radial-menu [aria-label^="Cor das ligações"]').click();await settle(400);
await page.locator('#color-panel .cp-swatch[data-color="#6fa3d6"]').click();await settle(300);
await shot('05-line-colors.png');
await page.keyboard.press('Escape');await settle(300);

// 6) mover: o conjunto acompanha o cursor e o destino pulsa
await page.locator('#fit').click();await settle(300);
await expand('O que nos aproxima uns dos outros?');await expand('Por onde começamos a mudança?');
const parent=card('O que nos aproxima uns dos outros?');
await parent.hover();await settle(300);
const handle=await parent.locator('.drag-handle').boundingBox();
await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
await page.mouse.move(handle.x+30,handle.y+30,{steps:4});await settle(300); // o conjunto sai do mapa e o layout se reorganiza
await frame([card('Como queremos nos mover?'),card('Por onde começamos a mudança?'),card('Ouvir quem já vive o lugar'),card('Medir o que melhora')],{cap:.95,margin:.8,dx:-200});await settle(300);
const target=await card('Ouvir quem já vive o lugar').boundingBox();
await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:14});await settle(700);
await shot('06-drag-move.png');
await page.keyboard.press('Escape');await page.mouse.up();await settle(400);
await hideToast();

// 7) editor de diagramas Mermaid
await page.locator('#fit').click();await settle(300);
await expand('Diagramas Mermaid');
const diagramCard=card('Fluxograma');
await frame([diagramCard],{scale:.9,dx:-120});await settle(300);
await diagramCard.hover();await settle(300);
await diagramCard.locator('.image-tools button',{hasText:'Editar'}).first().click();
await page.locator('#diagram-preview img').waitFor({timeout:30000});await settle(700);
await shot('07-diagram-editor.png');
await page.keyboard.press('Escape');await settle(300);

// 8) salvar como em outra pasta
await page.locator('#doc-button').click();await page.locator('#doc-saveas').click();
await page.locator('#saveas-modal').waitFor();
await page.locator('#saveas-name').fill('Mapa do projeto Atlas');
await page.locator('#saveas-folder').selectOption('__other');
await page.locator('#saveas-path').fill('D:\Projetos\atlas\docs\mapas');
await settle(400);
await shot('08-save-as.png',{x:330,y:140,width:780,height:540});
await page.keyboard.press('Escape');await settle(300);

// 9) modo texto
await page.locator('#edit-switch').click();await settle(200);
await page.locator('#mode').click();await settle(700);
await shot('09-text-mode.png');

// 10) cliente de API: coleção anexada a um card e uma request enviada (tela dividida)
await page.locator('#mode').click();await settle(300); // volta do modo texto
{
 const doc=await (await page.request.get(`${base}/api/presentations/cidades-para-pessoas`)).json();
 doc.roots[0].children[3].apis=[{collection:'context-maps-api',path:'presentations',name:'Presentations'}];
 await page.request.put(`${base}/api/presentations/cidades-para-pessoas`,{data:doc});
 await page.goto(`${base}/?p=cidades-para-pessoas`);await page.locator('.node').first().waitFor();await settle(400);
 await page.locator('#expand').click();await settle(400);
 await page.locator('#api-btn').click();await page.locator('.api-row-name',{hasText:'Get a presentation'}).waitFor();
 await page.locator('#search-btn').click();await page.keyboard.type('Por onde');await page.keyboard.press('Enter');await settle(900);
 await page.locator('.api-row-name',{hasText:'Get a presentation'}).click();await page.locator('.api-req-title strong').waitFor();
 await page.locator('.api-send').click();await page.locator('.api-status strong').waitFor();await settle(500);
 await shot('10-api-client.png');
}
await browser.close();server.kill();await rm(work,{recursive:true,force:true});
console.log(`Imagens geradas em ${out}`);
