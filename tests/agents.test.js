// Verifica os arquivos de integração com agentes (Claude Code, Codex, Cursor): formato, referências e comandos documentados.
// Não executa os agentes de verdade — isso continua sendo um teste manual (ver README, "Agent compatibility").
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const frontmatter=text=>{const m=/^---\r?\n([\s\S]*?)\r?\n---/.exec(text);assert.ok(m,'sem frontmatter');return Object.fromEntries(m[1].split(/\r?\n/).map(l=>{const i=l.indexOf(':');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));};
const COMMANDS=['serve','status','validate','create','update','upload'];
const referencedPaths=text=>[...text.matchAll(/`((?:skills|docs|tests|\.cursor)\/[\w./-]+)`/g)].map(m=>m[1]).filter(p=>!p.includes('<')&&!p.endsWith('/'));

test('Claude Code: SKILL.md (en e pt-BR) tem frontmatter válido e documenta todos os comandos do CLI',()=>{
 for(const file of ['skills/context-maps/SKILL.md','skills/context-maps/SKILL.pt-BR.md']){
  const text=read(file),fm=frontmatter(text);
  assert.equal(fm.name,file.endsWith('pt-BR.md')?'context-maps-pt-br-reference':'context-maps',file); // a cópia pt-BR tem outro nome para não duplicar a skill
  assert.ok(fm.description&&fm.description.length>40&&fm.description.length<=1024,`${file}: description fora do tamanho`);
  for(const c of COMMANDS)assert.ok(new RegExp('`'+c+'[ `]').test(text),`${file} não documenta o comando "${c}"`);
 }
});
test('Codex e Cursor: AGENTS.md e a regra .mdc apontam para arquivos que existem',()=>{
 const agents=read('AGENTS.md');
 assert.match(agents,/skills\/context-maps\/SKILL\.md/);assert.match(agents,/schema\.md/);assert.match(agents,/rm\.mjs/);
 for(const c of ['serve','validate','create','update'])assert.ok(agents.includes(c),`AGENTS.md não cita "${c}"`);
 const rule=read('.cursor/rules/context-maps.mdc'),fm=frontmatter(rule);
 assert.ok(fm.description&&fm.description.length>20);assert.ok(['true','false'].includes(fm.alwaysApply),'alwaysApply precisa ser true/false');
 for(const text of [agents,rule])for(const p of referencedPaths(text))assert.ok(existsSync(path.join(root,p)),`referência quebrada: ${p}`);
});
test('CLI: todos os comandos documentados existem em rm.mjs e a ajuda os lista',()=>{
 const cli=read('skills/context-maps/scripts/rm.mjs');
 for(const c of COMMANDS)assert.ok(cli.includes(` async ${c}(`),`rm.mjs não implementa "${c}"`);
 const usage=/usageCommands:\{pt:\(\)=>'([^']+)'/.exec(cli)[1];
 for(const c of [...COMMANDS,'version'])assert.ok(usage.includes(c),`ajuda do CLI não lista "${c}"`);
});
test('Guias: docs/skill.md e docs/skill.pt-BR.md cobrem os mesmos comandos',()=>{
 for(const file of ['docs/skill.md','docs/skill.pt-BR.md']){
  const text=read(file);
  for(const c of COMMANDS)assert.ok(text.includes(`| \`${c}\``),`${file}: falta a linha do comando "${c}"`);
  for(const p of referencedPaths(text))assert.ok(existsSync(path.join(root,p)),`${file}: referência quebrada ${p}`);
 }
});
