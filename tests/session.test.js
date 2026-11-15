// Sessões do Claude Code nos cards: leitura do .jsonl, compactação, segredos, trecho, miniatura e listagem da máquina
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSession,createSessionReader,clip,LIMITS,sliceSession,sessionStats,findAnchor,secretHits,maskSecrets,sessionThumbSvg,sessionCardSvg,sessionFromSvg,toolTitle} from '../session-core.js';
import {createSessions} from '../sessions.mjs';
import {lightSvgFonts} from '../svg-fonts.js';

const here=path.dirname(fileURLToPath(import.meta.url)),SAMPLE=path.join(here,'fixtures','session-sample.jsonl');
const sample=()=>parseSession(readFileSync(SAMPLE,'utf8'));

test('parseSession: conversa, ferramentas com resultado, skill, lista de tarefas e próximo passo', ()=>{
 const s=sample();
 assert.equal(s.title,'Mapa do fluxo de pedidos');assert.match(s.started,/^2026-11-10T/);
 assert.deepEqual(s.items.map(i=>i.k),['user','assistant','tool','assistant','ask','plan','assistant','tool','tool','tool','tool','assistant','next','user']);
 assert.match(s.items[0].text,/^Use a skill context-maps/); // a mensagem interna (isMeta, só <system-reminder>) ficou de fora
 const skill=s.items[2];assert.deepEqual([skill.name,skill.skill,skill.title,skill.result],['Skill','context-maps','context-maps','Launching skill: context-maps']);
 const read=s.items[7];assert.equal(read.title,'orders.js');assert.match(read.result,/status\(412\)/);
 const bash=s.items[10];assert.equal(bash.title,'Publicar o mapa no Context Maps');assert.match(bash.input,/^node skills\/context-maps/);
 assert.deepEqual(s.items[5].items.map(x=>x.status),['completed','in_progress','pending']);
 assert.deepEqual(s.items[12],{k:'next',recap:'O mapa do fluxo de pedidos está publicado, com o 412 como fim clicável.',ask:'Quer que eu acrescente o fluxo de login?',actions:['Sim, acrescente','Agora não']});
 assert.deepEqual(sessionStats(s),{items:14,users:2,tools:5,asks:1,skills:1,bytes:JSON.stringify(s).length});
});

test('AskUserQuestion: perguntas, opções e as respostas da pessoa (também só pelo texto do resultado)', ()=>{
 const ask=sample().items[4];
 assert.deepEqual(ask.questions.map(q=>[q.header,q.multiSelect,q.options.length]),[['Fluxo',false,3],['Erros',true,3]]);
 assert.equal(ask.questions[0].options[0].description,'POST /orders com validação de token, If-Match e estoque.');
 assert.deepEqual(ask.answers,{'Qual fluxo você quer mapear primeiro?':'Criar pedido (Recommended)','Quais resultados de erro entram no fluxograma?':'401 Unauthorized, 412 Precondition Failed'});
 // sem toolUseResult (versões antigas): as respostas saem do texto
 const r=createSessionReader();
 r.push({type:'assistant',message:{content:[{type:'tool_use',id:'a',name:'AskUserQuestion',input:{questions:[{question:'Cor?',options:[{label:'Azul'},{label:'Verde'}]}]}}]}});
 r.push({type:'user',message:{content:[{type:'tool_result',tool_use_id:'a',content:'Your questions have been answered: "Cor?"="Verde". You can now continue.'}]}});
 assert.deepEqual(r.finish().items[0].answers,{'Cor?':'Verde'});
});

test('leitor: comandos /…, resumo de contexto, subagentes, imagens, erro de ferramenta e cortes', ()=>{
 const r=createSessionReader();
 r.push({type:'user',message:{content:'<command-name>/model</command-name>\n<command-args>opus</command-args>'}});
 r.push({type:'user',isCompactSummary:true,message:{content:'This session is being continued…'}});
 r.push({type:'user',isSidechain:true,message:{content:'conversa de um subagente'}});
 r.push({type:'user',message:{content:[{type:'text',text:'olha isso'},{type:'image',source:{}}]}});
 r.push({type:'assistant',message:{content:[{type:'thinking',thinking:''},{type:'thinking',thinking:'pensando'},{type:'tool_use',id:'b',name:'Bash',input:{command:'x'.repeat(5000)}}]}});
 r.push({type:'user',message:{content:[{type:'tool_result',tool_use_id:'b',is_error:true,content:[{type:'text',text:'y'.repeat(9000)},{type:'image'}]}]}});
 r.push({type:'file-history-snapshot',snapshot:{}});r.push(null);
 const items=r.finish().items;
 assert.deepEqual(items.map(i=>i.k),['cmd','sum','user','think','tool']);
 assert.deepEqual([items[0].name,items[0].args],['/model','opus']);assert.equal(items[2].images,1);
 const tool=items[4];assert.equal(tool.error,true);assert.ok(tool.input.length<LIMITS.input+40&&tool.result.length<LIMITS.result+60);
 assert.match(tool.input,/⋯ \+3500 ⋯/);assert.match(tool.result,/\[1 image\]$/);
 assert.equal(clip('curto',10),'curto');assert.equal(toolTitle('Grep',{pattern:'abc'}),'abc');assert.equal(toolTitle('Read',{file_path:'/a/b/c.js'}),'c.js');
});

test('segredos viram •••; trecho e ponto de abertura', ()=>{
 const s=sample();
 assert.equal(secretHits(s),1);
 const masked=maskSecrets(s);assert.equal(secretHits(masked),0);
 assert.match(masked.items[9].input,/Authorization: Bearer •••/);assert.doesNotMatch(JSON.stringify(masked),/eyJhbGci/);
 assert.match(s.items[9].input,/eyJhbGci/,'a transcrição original não muda');
 const more=maskSecrets({items:[{k:'tool',input:'export TOKEN=abcd1234efgh5678 && curl -u x -d password="s3nh4-muito-secreta" {{token}}',result:'key AKIAABCDEFGHIJKLMNOP ghp_abcdefghijklmnopqrstuvwxyz0123456789',title:''}]}).items[0];
 assert.equal(more.input,'export TOKEN=••• && curl -u x -d password="•••" {{token}}');assert.equal(more.result,'key ••• •••');
 // trecho [4, 7] e âncora por texto
 const cut=sliceSession(s,4,7);assert.deepEqual(cut.items.map(i=>i.k),['ask','plan','assistant','tool']);assert.equal(cut.title,s.title);
 assert.equal(findAnchor(s,'ficou ótimo'),13);assert.equal(findAnchor(s,'Qual fluxo você quer'),4);assert.equal(findAnchor(s,'não existe isso'),-1);assert.equal(findAnchor(s,''),-1);
});

test('arquivo do card: miniatura SVG com a transcrição dentro (ida e volta), sem markdown cru', ()=>{
 const s=sample(),thumb=sessionThumbSvg(s,0,{you:'Você'});
 assert.match(thumb,/^<svg /);assert.match(thumb,/Mapa do fluxo de pedidos/);assert.ok(thumb.includes('&gt; </tspan><tspan fill="#ffffff">Use a skill context-maps')); // "> " + a mensagem da pessoa, em branco
 assert.ok(thumb.includes('>Skill</tspan><tspan fill="#e5c07b">(context-maps)'));assert.ok(thumb.includes('⎿ </tspan><tspan fill="#7d7d7d">Launching skill')); // a skill em destaque e o resultado em cinza
 assert.doesNotMatch(thumb,/\*\*/);assert.doesNotMatch(thumb,/<metadata/);
 const ask=sessionThumbSvg(s,4);assert.ok(ask.includes('❯   </tspan><tspan fill="#5fbf8f">1. </tspan><tspan fill="#5fbf8f" font-weight="700">Criar pedido')); // escolhida: ❯ e verde
 assert.ok(ask.includes('fill="#d0d0d0">Login'));assert.ok(ask.includes('[✓] </tspan><tspan fill="#5fbf8f">2. </tspan><tspan fill="#5fbf8f" font-weight="700">412 Precondition Failed'));assert.ok(ask.includes('[ ] </tspan><tspan fill="#7d7d7d">3. </tspan><tspan fill="#d0d0d0">409 Conflict'));
 const hostile={title:'<script>alert(1)</script>',items:[{k:'user',text:'</metadata><svg onload="x">&amp; &lt; ]]> "aspas"'},{k:'tool',name:'Bash',title:'',input:"echo $& $' $` $1 $$ \\$0",result:'\u0001 \\u0000 \ud83d\ude00'}]};
 const card=sessionCardSvg(hostile,0);
 assert.equal((card.match(/<\/metadata>/g)||[]).length,1);assert.doesNotMatch(card,/<script>/);
 assert.deepEqual(sessionFromSvg(card),{session:hostile,anchor:0});
 const real=sessionCardSvg(s,4,{you:'Você'});assert.deepEqual(sessionFromSvg(real),{session:s,anchor:4});
 assert.equal(sessionFromSvg('<svg></svg>'),null);assert.equal(sessionFromSvg(thumb),null);
 // o servidor não mexe no texto da conversa ao servir o SVG (mesmo que cite fontes do Excalidraw)
 const tricky=sessionCardSvg({title:'t',items:[{k:'user',text:'font-family="Virgil, Segoe UI Emoji" <style class="style-fonts">'}]},0);
 assert.equal(lightSvgFonts(tricky),tricky);
});

test('sessions.mjs: lista as sessões da máquina (mais recentes primeiro) e lê uma, sem sair da pasta', async ()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cm-sess-'));
 try{
  await mkdir(path.join(dir,'C--projetos-loja'));await mkdir(path.join(dir,'vazio'));
  await copyFile(SAMPLE,path.join(dir,'C--projetos-loja','abc-123.jsonl'));
  await writeFile(path.join(dir,'C--projetos-loja','zero.jsonl'),'');await writeFile(path.join(dir,'C--projetos-loja','notas.txt'),'x');
  const api=createSessions({dir}),list=await api.list();
  assert.equal(list.length,1);
  assert.deepEqual([list[0].project,list[0].id,list[0].title,list[0].cwd],['C--projetos-loja','abc-123','Mapa do fluxo de pedidos','C:\\projetos\\loja']);
  assert.match(list[0].first,/^Use a skill context-maps/);assert.ok(list[0].size>1000);
  const s=await api.read('C--projetos-loja','abc-123');assert.equal(s.items.length,14);
  assert.equal(await api.read('C--projetos-loja','nao-existe'),null);
  assert.equal(await api.read('..','abc-123'),null);assert.equal(await api.read('C--projetos-loja','../../x'),null);
  assert.deepEqual(await createSessions({dir:path.join(dir,'nada')}).list(),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
