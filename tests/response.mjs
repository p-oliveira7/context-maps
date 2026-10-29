// Corpo da resposta no cliente de API: árvore JSON recolhível, copiar caminho, filtro por caminho, busca, XML/HTML com cores e preview isolado.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './launch.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=await mkdtemp(path.join(tmpdir(),'cm-resp-'));
const port=4195,base=`http://127.0.0.1:${port}`;

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const JSON_BODY={id:1,name:'Ana',tags:['a','b'],address:{city:'Rio',geo:{lat:1.5,lng:-2}},active:true,none:null,items:[{id:1,title:'x'},{id:2,title:'y'}]};
const b64u=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT=`${b64u({alg:'HS256',typ:'JWT'})}.${b64u({sub:'ana',name:'Ana',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})}.c2ln`;
const routes={
 '/json':['application/json',JSON.stringify(JSON_BODY)],
 '/big':['application/json',JSON.stringify(Array.from({length:5000},(_,i)=>({id:i,label:`item ${i}`})))],
 '/xml':['application/xml','<?xml version="1.0"?><root a="1"><item id="7">Hello</item><!-- note --></root>'],
 '/html':['text/html','<html><body><h1 id="t">Hi</h1><script>document.getElementById("t").textContent="SCRIPTED"</script></body></html>'],
 '/png':['image/png',PNG],
 '/svg':['image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>'],
 '/text':['text/plain','hello world hello']
};
const target=createServer((req,res)=>{if(req.url==='/token'){res.writeHead(200,{'content-type':'application/json','x-auth-token':`Bearer ${JWT}`});return res.end(JSON.stringify({access_token:JWT,user:{id:1}}));}const r=routes[req.url];if(!r){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':r[0]});res.end(r[1]);});
await new Promise(r=>target.listen(0,'127.0.0.1',r));
const host=`http://127.0.0.1:${target.address().port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:path.join(work,'presentations'),CONTEXT_MAPS_CONFIG:path.join(work,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const H={'x-context-maps':'1','content-type':'application/json'};
const call=async(method,route,body)=>{const r=await fetch(`${base}/api${route}`,{method,headers:H,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,`${method} ${route} -> ${r.status}`);return r.json();};
const browser=await launch();
try{
 await call('POST','/collections',{name:'Resp'});
 await call('PUT','/collections/resp/environments/local',{vars:[{name:'host',value:host,enabled:true}]});
 for(const [name,url] of [['Token','/token'],['Json','/json'],['Big','/big'],['Xml','/xml'],['Html','/html'],['Png','/png'],['Svg','/svg'],['Text','/text']])
  await call('POST','/collections/resp/items',{type:'request',name,method:'get',url:`{{host}}${url}`});

 const ctx=await browser.newContext({locale:'en-US',viewport:{width:1500,height:900},permissions:['clipboard-read','clipboard-write'],extraHTTPHeaders:{'x-context-maps':'1'}});
 const page=await ctx.newPage();page.setDefaultTimeout(process.env.CI?15000:7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.node').first().waitFor();
 await page.locator('#api-btn').click();await page.locator('#api-panel').waitFor({state:'visible'});
 const send=async name=>{
  await page.locator('.api-row-name',{hasText:new RegExp(`^${name}$`)}).click();await page.locator('.api-tab.is-active',{hasText:name}).waitFor();
  await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
 };
 const body=()=>page.locator('.api-resp-body');
 const clip=()=>page.evaluate(()=>navigator.clipboard.readText());
 const mode=name=>page.locator('.api-body-modes button',{hasText:name});
 const find=()=>page.locator('.api-body-find');

 // RESP-01: o JSON vira uma árvore (com o mesmo texto de antes), com cores, e já vem toda aberta
 await send('Json');
 assert.equal(await page.locator('.api-resp-body.is-tree .jv').count(),1);
 assert.deepEqual(JSON.parse(await body().textContent()),JSON_BODY);
 assert.equal(await page.locator('.jv-node.is-collapsed').count(),0); // nada recolhido: dá para mostrar a resposta inteira sem clicar
 assert.equal(await page.locator('.jv-key',{hasText:'"lat"'}).isVisible(),true);assert.equal(await page.locator('.jv-key',{hasText:'"title"'}).last().isVisible(),true);
 const colour=sel=>page.locator(sel).first().evaluate(e=>getComputedStyle(e).color);
 const colours=new Set([await colour('.jv-str'),await colour('.jv-num'),await colour('.jv-bool'),await colour('.jv-null'),await colour('.jv-key')]);
 assert.equal(colours.size,5,'cada tipo de valor tem a sua cor');
 const geo=page.locator(`.jv-node:has(> .jv-row > .jv-key:text-is('"geo"'))`);
 assert.equal(await geo.locator('>.jv-children').isVisible(),true);assert.equal(await geo.locator('>.jv-row>.jv-toggle').getAttribute('aria-expanded'),'true');
 await geo.locator('>.jv-row>.jv-toggle').click();
 assert.equal(await geo.locator('>.jv-children').isHidden(),true);assert.equal(await geo.locator('>.jv-row>.jv-toggle').getAttribute('aria-expanded'),'false');
 assert.match(await geo.locator('>.jv-row').evaluate(e=>getComputedStyle(e,'::after').content),/2 keys/); // recolhido mostra o resumo
 await geo.locator('>.jv-row>.jv-toggle').click();assert.equal(await geo.locator('>.jv-children').isVisible(),true);
 // Recolher tudo / Expandir tudo
 const expandAll=page.locator('.api-body-expand button[aria-label="Expand all"]'),collapseAll=page.locator('.api-body-expand button[aria-label="Collapse all"]');
 await collapseAll.click();
 assert.equal(await page.locator('.jv-node.is-collapsed').count(),6); // tags, address, geo, items e os dois itens: só a raiz aberta
 assert.equal(await page.locator('.jv-key',{hasText:'"city"'}).isVisible(),false);
 await expandAll.click();assert.equal(await page.locator('.jv-node.is-collapsed').count(),0);
 await collapseAll.click();await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Headers'}).click();await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Body'}).click();
 assert.equal(await page.locator('.jv-node.is-collapsed').count(),6); // a escolha fica na resposta ao trocar de aba interna
 await expandAll.click();

 // RESP-02: clicar numa chave copia o caminho (útil para asserts e variáveis)
 await page.locator('.jv-key',{hasText:'"city"'}).click();
 assert.equal(await clip(),'res.body.address.city');
 assert.match(await page.locator('.api-body-bar [role=status]').textContent(),/res\.body\.address\.city/);
 await page.locator('.jv-key',{hasText:'"lat"'}).click();assert.equal(await clip(),'res.body.address.geo.lat');
 await page.locator('.jv-key',{hasText:'"title"'}).first().click();assert.equal(await clip(),'res.body.items[0].title');

 // RESP-03: filtrar por caminho mostra só aquele valor (e o Copiar leva o valor filtrado)
 const path=page.locator('.api-body-path');
 await path.fill('address.geo');
 assert.deepEqual(JSON.parse(await body().textContent()),{lat:1.5,lng:-2});
 await page.locator('.jv-key',{hasText:'"lng"'}).click();assert.equal(await clip(),'res.body.address.geo.lng');
 await page.locator('.api-resp-tabs button',{hasText:'Copy'}).click();assert.deepEqual(JSON.parse(await clip()),{lat:1.5,lng:-2});
 await path.fill('items[1].title');assert.equal((await body().textContent()).trim(),'"y"');
 await path.fill('res.status');assert.equal((await body().textContent()).trim(),'200');
 await path.fill('nope.x');assert.match(await body().textContent(),/No value at that path/);
 await path.fill('');assert.deepEqual(JSON.parse(await body().textContent()),JSON_BODY);

 // RESP-04: busca no corpo (Ctrl+F), contagem, próximo/anterior e ramos recolhidos abrem sozinhos
 await page.locator('.api-body-expand button[aria-label="Collapse all"]').click();
 await body().click();await page.keyboard.press('Control+f');
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('api-body-find')),true);
 await page.keyboard.type('lng');
 assert.equal(await page.locator('.api-find-count[aria-live]').textContent(),'1/1');
 assert.equal(await page.locator('.api-find-hit.is-current').count(),1);
 assert.equal(await page.locator('.jv-node.is-collapsed').count(),4); // address e geo abriram para mostrar o resultado
 assert.equal(await page.locator('.api-find-hit.is-current').isVisible(),true);
 await find().fill('i');
 const total=await page.locator('.api-find-hit').count();assert.ok(total>=4);
 assert.equal(await page.locator('.api-find-count[aria-live]').textContent(),`1/${total}`);
 await page.keyboard.press('Enter');assert.equal(await page.locator('.api-find-count[aria-live]').textContent(),`2/${total}`);
 await page.keyboard.press('Shift+Enter');await page.keyboard.press('Shift+Enter');assert.equal(await page.locator('.api-find-count[aria-live]').textContent(),`${total}/${total}`); // volta ao fim
 await find().fill('zzz');assert.equal(await page.locator('.api-find-count[aria-live]').textContent(),'no matches');assert.equal(await page.locator('.api-find-hit').count(),0);
 await find().fill('ana');assert.equal(await page.locator('.api-find-hit').count(),1);
 await page.keyboard.press('Escape');assert.equal(await find().inputValue(),'');assert.equal(await page.locator('.api-find-hit').count(),0);
 assert.deepEqual(JSON.parse(await body().textContent()),JSON_BODY); // limpar a busca devolve o texto intacto

 // RESP-05: bruto e formatado; a busca e o modo ficam na resposta ao trocar de aba interna
 await mode('Raw').click();
 assert.equal(await body().textContent(),JSON.stringify(JSON_BODY));assert.equal(await page.locator('.jv').count(),0);
 await find().fill('rio');assert.equal(await page.locator('.api-find-hit').count(),1);
 await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Headers'}).click();
 assert.match(await body().textContent(),/content-type: application\/json/);assert.equal(await page.locator('.api-body-view').count(),0);
 await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Body'}).click();
 assert.equal(await find().inputValue(),'rio');assert.equal(await page.locator('.api-find-hit').count(),1);assert.equal(await mode('Raw').getAttribute('aria-pressed'),'true');
 await mode('Pretty').click();assert.equal(await page.locator('.jv').count(),1);

 // RESP-06: XML com cores (tags, atributos, valores e comentários)
 await send('Xml');
 assert.equal(await page.locator('.hl-tag',{hasText:'root'}).count(),2); // abre e fecha
 assert.equal(await page.locator('.hl-attr',{hasText:'a'}).first().textContent(),'a');assert.equal(await page.locator('.hl-str',{hasText:'"1"'}).count(),1);
 assert.equal(await page.locator('.hl-comment').textContent(),'<!-- note -->');assert.equal(await page.locator('.hl-meta').count(),1);
 assert.equal(await body().textContent(),routes['/xml'][1]); // o texto não muda, só ganha cores
 assert.equal(await page.locator('.api-body-path').count(),0);
 await mode('Raw').click();assert.equal(await page.locator('.hl-tag').count(),0);

 // RESP-07: o preview de HTML roda isolado (sem scripts, sem rede)
 await send('Html');
 await mode('Preview').click();
 const frame=page.locator('.api-preview-frame');
 assert.equal(await frame.getAttribute('sandbox'),'');assert.match(await frame.getAttribute('csp'),/default-src 'none'/);
 assert.equal(await page.frameLocator('.api-preview-frame').locator('#t').textContent(),'Hi'); // o script da resposta não rodou
 assert.equal(await page.locator('.api-body-findbox').isHidden(),true);
 await mode('Pretty').click();assert.equal(await page.locator('.hl-tag',{hasText:'script'}).count(),2);assert.equal(await page.locator('.api-body-findbox').isVisible(),true);

 // RESP-08: imagens abrem em preview (PNG e SVG)
 await send('Png');
 assert.equal(await page.locator('.api-body-modes').count(),0);assert.equal(await page.locator('.api-body-findbox').isHidden(),true);
 const img=page.locator('.api-preview img');assert.match(await img.getAttribute('src'),/^data:image\/png;base64,/);
 await page.waitForFunction(()=>{const i=document.querySelector('.api-preview img');return i?.complete&&i.naturalWidth===1;});
 await send('Svg');
 assert.equal(await mode('Preview').getAttribute('aria-pressed'),'false'); // SVG começa no texto
 await mode('Preview').click();await page.waitForFunction(()=>{const i=document.querySelector('.api-preview img');return i?.complete&&i.naturalWidth===20;});

 // RESP-09: JSON enorme não trava: mostra por páginas e o Copiar leva tudo
 await send('Big');
 const t0=Date.now();
 const items=()=>page.locator('.jv > .jv-node > .jv-children > .jv-node').count();
 assert.equal(await items(),200);
 assert.match(await page.locator('.jv-more').textContent(),/4800 more/);
 await page.locator('.jv-more').click();assert.equal(await items(),400);
 assert.ok(Date.now()-t0<3000,'renderizar 5000 itens por páginas é rápido');
 await page.locator('.api-resp-tabs button',{hasText:'Copy'}).click();
 const copied=JSON.parse(await clip());assert.equal(copied.length,5000);assert.equal(copied[4999].label,'item 4999');

 // RESP-10: texto simples sem botões de modo, mas com busca
 await send('Text');
 assert.equal(await page.locator('.api-body-modes').count(),0);assert.equal(await body().textContent(),'hello world hello');
 await find().fill('hello');assert.equal(await page.locator('.api-find-count[aria-live]').textContent(),'1/2');

 assert.deepEqual(errors,[]);
 // RESP-11: tokens JWT: botão no corpo e no cabeçalho da resposta e nas variáveis de ambiente abre o token decodificado
 await page.locator('.api-row-name',{hasText:/^Token$/}).click();await page.locator('.api-tab.is-active',{hasText:'Token'}).waitFor();
 await page.locator('.api-send').click();await page.locator('.api-status strong',{hasText:'200'}).waitFor();
 const chip=page.locator('.api-resp-body .jwt-chip');
 assert.equal(await chip.count(),1);assert.equal(await chip.getAttribute('aria-label'),'Open the JWT token: res.body.access_token');
 await chip.click();
 const card=page.locator('.jwt-card');await card.waitFor();
 assert.match(await card.locator('.jwt-status').textContent(),/^Valid · expires in (1 hour|60 minutes)/);
 assert.match(await card.locator('.jwt-claims').textContent(),/subana/);
 assert.match(await card.locator('.jwt-cols').textContent(),/"name": "Ana"/);
 assert.match(await card.locator('.jwt-cols h4').first().textContent(),/HS256/);
 await page.keyboard.press('Escape');await card.waitFor({state:'detached'});
 // o Copiar do corpo continua sendo o JSON (sem o texto do botão)
 await page.locator('.api-resp-tabs button',{hasText:'Copy'}).click();assert.equal(JSON.parse(await clip()).access_token,JWT);
 // cabeçalho com "Bearer <token>"
 await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Headers'}).click();
 await page.locator('.api-resp-header .jwt-chip').click();await card.waitFor();
 assert.match(await card.locator('.jwt-source').textContent(),/x-auth-token/);
 await card.locator('.jwt-close').click();await card.waitFor({state:'detached'});
 await page.locator('.api-resp-tabs button',{hasText:'Copy'}).click();assert.ok((await clip()).includes(`x-auth-token: Bearer ${JWT}`)&&!(await clip()).includes('JWTx'));
 await page.locator('.api-resp-tabs button[role=tab]',{hasText:'Body'}).click();
 // variável de ambiente com token
 await call('PUT','/collections/resp/environments/local',{vars:[{name:'host',value:host,enabled:true},{name:'token',value:JWT,enabled:true}]});
 await page.locator('#api-panel button[aria-label="Edit environments"], #api-panel button[title="Edit environments"]').first().click();
 await page.locator('.api-env-table .jwt-chip').waitFor();
 assert.equal(await page.locator('.api-env-table .jwt-chip').count(),1);
 await page.locator('.api-env-table .jwt-chip').click();await card.waitFor();
 assert.match(await card.locator('.jwt-source').textContent(),/token/);
 await page.keyboard.press('Escape');await card.waitFor({state:'detached'});
 assert.equal(await page.locator('.api-modal').count(),1); // o Esc fechou só o token, o editor de ambientes continua
 await page.keyboard.press('Escape');

 console.log('PASS RESP-01..11 response body viewer');
}finally{await browser.close();server.kill();target.close();await rm(work,{recursive:true,force:true});}
