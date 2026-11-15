// Gera tests/fixtures/session-sample.jsonl: uma sessão curta do Claude Code (formato real do .jsonl) que usa uma skill,
// faz uma pergunta à pessoa (AskUserQuestion), roda comandos e fecha com a caixa de próximo passo.
// Uso: node tests/fixtures/make-session.mjs
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
let n=0,clock=Date.parse('2026-11-10T14:00:00Z');
const base=()=>({uuid:`u-${++n}`,timestamp:new Date(clock+=4000).toISOString(),sessionId:'sample',cwd:'C:\\projetos\\loja',isSidechain:false});
const user=(content,extra={})=>({...base(),type:'user',message:{role:'user',content},...extra});
const assistant=(...content)=>({...base(),type:'assistant',message:{role:'assistant',model:'claude-sample',content}});
const text=t=>({type:'text',text:t}),use=(id,name,input)=>({type:'tool_use',id,name,input});
const result=(id,content,extra={})=>user([{type:'tool_result',tool_use_id:id,content}],extra);
const QUESTIONS=[
 {question:'Qual fluxo você quer mapear primeiro?',header:'Fluxo',multiSelect:false,options:[
  {label:'Criar pedido (Recommended)',description:'POST /orders com validação de token, If-Match e estoque.'},
  {label:'Login',description:'POST /auth/token e renovação do JWT.'},
  {label:'Cancelar pedido',description:'DELETE /orders/{id} com estorno.'}]},
 {question:'Quais resultados de erro entram no fluxograma?',header:'Erros',multiSelect:true,options:[
  {label:'401 Unauthorized',description:'Token ausente ou inválido.'},
  {label:'412 Precondition Failed',description:'If-Match não confere.'},
  {label:'409 Conflict',description:'Sem estoque.'}]}];
const ANSWERS={'Qual fluxo você quer mapear primeiro?':'Criar pedido (Recommended)','Quais resultados de erro entram no fluxograma?':'401 Unauthorized, 412 Precondition Failed'};
const lines=[
 {type:'custom-title',customTitle:'Mapa do fluxo de pedidos',sessionId:'sample'},
 user('<system-reminder>\nContexto interno do app.\n</system-reminder>',{isMeta:true}),
 user('Use a skill context-maps para montar um mapa do fluxo de pedidos da nossa API. Quero mostrar para o time como o 412 acontece.'),
 assistant(text('Vou usar a skill **context-maps**. Primeiro carrego as instruções dela.'),use('t1','Skill',{skill:'context-maps'})),
 result('t1','Launching skill: context-maps'),
 assistant(text('Antes de montar o mapa, preciso de duas definições.'),use('t2','AskUserQuestion',{questions:QUESTIONS})),
 result('t2',`Your questions have been answered: ${Object.entries(ANSWERS).map(([q,a])=>`"${q}"="${a}"`).join(', ')}. You can now continue with these answers in mind.`,{toolUseResult:{questions:QUESTIONS,answers:ANSWERS}}),
 assistant(use('t3','mcp__ccd_turn__update_plan',{items:[{content:'Ler as rotas de pedidos',status:'completed'},{content:'Escrever o outline e o fluxo',status:'in_progress'},{content:'Publicar no Context Maps',status:'pending'}]})),
 result('t3','Plan shown (3 steps).'),
 assistant(text('Lendo as rotas para não inventar nada.'),use('t4','Read',{file_path:'C:\\projetos\\loja\\src\\routes\\orders.js'})),
 result('t4',"router.post('/orders', auth, ifMatch, async (req, res) => {\n  if (!req.etagOk) return res.status(412).json({ error: 'precondition_failed' });\n  const ok = await stock.reserve(req.body.items);\n  if (!ok) return res.status(409).json({ error: 'no_stock' });\n  res.status(201).json(await orders.create(req.body));\n});"),
 assistant(use('t5','Write',{file_path:'C:\\projetos\\loja\\docs\\pedido.flow',content:'# Criar pedido\nclient: App cliente\nauth: Token válido? [diamond]\ne401: 401 Unauthorized [ellipse] {end}\netag: If-Match confere? [diamond]\ne412: 412 Precondition Failed [ellipse] {end}\nok: 201 Created [ellipse] {end}\nclient -> auth: POST /orders\nauth -> e401: não\nauth -> etag: sim\netag -> e412: não\netag -> ok: sim\n'})),
 result('t5','File created successfully at: C:\\projetos\\loja\\docs\\pedido.flow'),
 assistant(use('t6','Bash',{command:'curl -s -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbmEifQ.c2lnbmF0dXJlLWRlLWV4ZW1wbG8" http://localhost:3000/orders/42',description:'Conferir a resposta real do endpoint'})),
 result('t6','{"error":"precondition_failed"}'),
 assistant(use('t7','Bash',{command:'node skills/context-maps/scripts/rm.mjs create --outline docs/pedidos.md --id fluxo-pedidos',description:'Publicar o mapa no Context Maps'})),
 result('t7','{\n  "id": "fluxo-pedidos",\n  "url": "http://127.0.0.1:4173/?p=fluxo-pedidos",\n  "nodes": 9,\n  "drawings": 1,\n  "warnings": [],\n  "skipped": []\n}'),
 assistant(text('O mapa está publicado em http://127.0.0.1:4173/?p=fluxo-pedidos.\n\n- **Fluxo:** criar pedido, com os fins `401`, `412` e `201` marcados.\n- **Como ver o 412:** abra o desenho e clique no quadro `412 Precondition Failed`.'),use('t8','mcp__ccd_turn__wrap_up',{recap:'O mapa do fluxo de pedidos está publicado, com o 412 como fim clicável.',ask:'Quer que eu acrescente o fluxo de login?',actions:[{label:'Sim, acrescente'},{label:'Agora não'}]})),
 result('t8','Shown in the next-step box.'),
 user('Agora não. Ficou ótimo, obrigado!')
];
writeFileSync(path.join(here,'session-sample.jsonl'),lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
console.log(`session-sample.jsonl: ${lines.length} lines`);
