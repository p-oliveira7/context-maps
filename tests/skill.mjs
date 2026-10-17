import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(root,'skills/context-maps/scripts/rm.mjs');
const work=await mkdtemp(path.join(tmpdir(),'rm-skill-'));
const data=path.join(work,'data'),src=path.join(work,'src');
await mkdir(src);
const port=4191,base=`http://127.0.0.1:${port}`;
const configDir=await mkdtemp(path.join(tmpdir(),'rm-skill-config-'));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:data,CONTEXT_MAPS_CONFIG:path.join(configDir,'config.json')},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const run=(args,env={})=>spawnSync(process.execPath,[cli,...args],{cwd:src,encoding:'utf8',env:{...process.env,RM_URL:base,RM_LANG:'pt',...env}});
try{
 // validate: avisos e código de saída
 await writeFile(path.join(src,'bad.md'),`# Ruim\n- ${'x'.repeat(120)}\n`);
 const bad=run(['validate','--outline','bad.md']);assert.equal(bad.status,3);assert.match(bad.stdout,/caracteres/);

 // create com imagem local, diagrama (mmdc falso), cor e hierarquia
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 await writeFile(path.join(src,'tela.png'),png);
 await writeFile(path.join(src,'fluxo.mmd'),'flowchart TD\n  A-->B\n');
 const fake=path.join(src,'fake-mmdc.mjs');
 await writeFile(fake,`import {writeFileSync} from 'node:fs';const o=process.argv[process.argv.indexOf('-o')+1];writeFileSync(o,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');`);
 const shim=path.join(src,process.platform==='win32'?'mmdc.cmd':'mmdc.sh');
 await writeFile(shim,process.platform==='win32'?`@"${process.execPath}" "${fake}" %*\r\n`:`#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
 await chmod(shim,0o755);
 await writeFile(path.join(src,'mapa.md'),[
  '# Fluxo de login [img:tela.png|Tela inicial] [img:tela.png|Segunda tela]',
  '- Autenticar {color=#112233} {links=#445566}',
  '  - Validar credenciais [subtitle:Confere usuário e senha | pode usar SSO]',
  '  - Fluxo detalhado [mermaid:fluxo.mmd] [mermaid:fluxo.mmd] [img:tela.png|Print]',
  '- Sessão',
  '    - Renovar token',
  '    - [mermaid:fluxo.mmd]',
  '    - [subtitle:Só texto secundário]',
  '- Anexo ausente [img:nao-existe.png]',
  '- Documentação [link:https://example.com/docs|Docs] [link:https://example.org] [link:ftp://x.test/arquivo]',
  '',
  '# Segundo fluxo {links=#778899}',
  '- Passo A',
  '  - Passo A1',
  ''].join('\n'));
 const ok=run(['create','--outline','mapa.md','--id','fluxo-login'],{MMDC:shim});
 assert.equal(ok.status,0,ok.stderr+ok.stdout);
 const report=JSON.parse(ok.stdout);
 assert.equal(report.id,'fluxo-login');assert.equal(report.url,`${base}/?p=fluxo-login`);
 assert.equal(report.images,3);assert.equal(report.diagrams,3);assert.deepEqual(report.warnings,[]);assert.equal(report.skipped.length,2);assert.equal(report.links,2);
 const doc=JSON.parse(await readFile(path.join(data,'fluxo-login.json'),'utf8'));
 const t=doc.roots?doc.roots[0]:doc.tree;
 assert.equal(doc.title,'Fluxo de login');assert.equal(doc.roots.length,2);assert.equal(doc.roots[1].title,'Segundo fluxo');assert.equal(doc.roots[1].linksColor,'#778899');assert.equal(doc.roots[1].children[0].children[0].title,'Passo A1');assert.equal(report.roots,2);
 assert.equal(t.title,'Fluxo de login');assert.equal(t.children.length,4);assert.equal(t.images.length,2);assert.equal(t.images[0].alt,'Tela inicial');assert.equal(t.images[1].alt,'Segunda tela');assert.equal(t.image,undefined);
 assert.equal(t.children[0].color,'#112233');assert.equal(t.children[0].linksColor,'#445566');assert.equal(t.children[0].title,'Autenticar');assert.equal(t.children[0].children[0].subtitle,'Confere usuário e senha | pode usar SSO');assert.equal(t.children[0].children[0].title,'Validar credenciais');assert.equal(t.children[0].children.length,2);
 const multi=t.children[0].children[1].images;assert.deepEqual(multi.map(i=>i.kind||'image'),['diagram','diagram','image']);assert.match(multi[0].source,/flowchart/);
 assert.equal(t.children[1].children[0].title,'Renovar token');
 assert.equal(t.children[1].children[1].title,'');assert.equal(t.children[1].children[1].images[0].kind,'diagram');
 assert.equal(t.children[1].children[2].title,'');assert.equal(t.children[1].children[2].subtitle,'Só texto secundário');
 assert.deepEqual(t.children[3].links,[{url:'https://example.com/docs',label:'Docs'},{url:'https://example.org'}]);
 assert.equal(t.children[3].title,'Documentação');
 assert.equal((await fetch(`${base}/${t.images[0].src}`)).status,200);
 assert.equal(new Set(JSON.stringify(t).match(/"id":"[^"]+"/g)).size,JSON.stringify(t).match(/"id":"[^"]+"/g).length);

 // não sobrescreve sem --replace
 const again=run(['create','--outline','mapa.md','--id','fluxo-login'],{MMDC:shim});assert.notEqual(again.status,0);assert.match(again.stderr,/--replace/);
 const replaced=run(['create','--outline','mapa.md','--id','fluxo-login','--replace'],{MMDC:shim});assert.equal(replaced.status,0);

 // sem mmdc: apresentação criada, diagrama listado como pulado
 const noMmdc=run(['create','--outline','mapa.md','--id','sem-mmdc'],{MMDC:'',PATH:path.dirname(process.execPath)});
 assert.equal(noMmdc.status,0);assert.match(JSON.parse(noMmdc.stdout).skipped.join('\n'),/mmdc/);

 // servidor fora do ar
 const down=run(['status'],{RM_URL:'http://127.0.0.1:1'});assert.equal(down.status,2);
 // --dir: cria a apresentação em outra pasta da máquina (imagens relativas ao arquivo)
 const extra=path.join(work,'projeto','docs','mapas');
 const outExt=run(['create','--outline','mapa.md','--id','externo','--dir',extra],{MMDC:shim});
 assert.equal(outExt.status,0,outExt.stderr+outExt.stdout);
 const extReport=JSON.parse(outExt.stdout);assert.match(extReport.url,/\?p=[0-9a-f]{6}~externo$/);
 const extDoc=JSON.parse(await readFile(path.join(extra,'externo.json'),'utf8'));
 assert.equal(extDoc.id,'externo');assert.ok(JSON.stringify(extDoc).includes('externo/assets/'));assert.equal(JSON.stringify(extDoc).includes('presentations/'),false);
 assert.ok((await readFile(path.join(data,'..','nada-aqui.txt'),'utf8').catch(()=>'ok'))==='ok');
 // update: mescla um outline novo sem perder o que foi feito à mão
 {
  await writeFile(path.join(src,'v1.md'),`# Plano\n- Alfa [subtitle:Primeira]\n  - Alfa 1\n- Beta\n- Gama\n`);
  const made=JSON.parse(run(['create','--outline','v1.md','--id','plano'],{MMDC:shim}).stdout);assert.equal(made.id,'plano');
  const before=await (await fetch(`${base}/api/presentations/plano`)).json();
  const alfa=before.roots[0].children[0],beta=before.roots[0].children[1];
  // edição manual feita no app: cor numa ideia, posição da raiz, imagem em Beta
  alfa.color='#6fa3d6';before.roots[0].x=500;before.roots[0].y=300;
  const up=await (await fetch(`${base}/api/presentations/plano/assets?name=manual.png`,{method:'POST',headers:{'x-context-maps':'1'},body:png})).json();
  beta.images=[{src:up.src,alt:'Manual'}];
  assert.equal((await fetch(`${base}/api/presentations/plano`,{method:'PUT',headers:{'content-type':'application/json','x-context-maps':'1'},body:JSON.stringify(before)})).status,200);
  await writeFile(path.join(src,'v2.md'),`# Plano\n- Beta\n- Alfa [subtitle:Primeira revisada] [link:https://example.com/a|Doc]\n  - Alfa 1\n  - Alfa 2\n- Delta [img:tela.png|Tela]\n`);
  const dry=JSON.parse(run(['update','--id','plano','--outline','v2.md','--dry-run'],{MMDC:shim}).stdout);
  assert.equal(dry.dryRun,true);assert.deepEqual(dry.added.sort(),['Alfa 2','Delta']);
  assert.equal((await (await fetch(`${base}/api/presentations/plano`)).json()).roots[0].children.length,3); // dry-run não grava
  const rep=JSON.parse(run(['update','--id','plano','--outline','v2.md'],{MMDC:shim}).stdout);
  assert.deepEqual(rep.added.sort(),['Alfa 2','Delta']);assert.ok(rep.updated.includes('Alfa'));assert.deepEqual(rep.kept,['Gama']);assert.equal(rep.images,1);
  const after=await (await fetch(`${base}/api/presentations/plano`)).json(),kids=after.roots[0].children;
  assert.deepEqual(kids.map(k=>k.title),['Beta','Alfa','Delta','Gama']); // ordem do outline; o que sobrou fica no fim
  const a2=kids[1];
  assert.equal(a2.id,alfa.id);assert.equal(a2.color,'#6fa3d6'); // id e cor manual preservados
  assert.equal(a2.subtitle,'Primeira revisada');assert.equal(a2.links[0].url,'https://example.com/a');assert.equal(a2.children.length,2);
  assert.equal(kids[0].images[0].alt,'Manual'); // imagem manual preservada
  assert.equal(after.roots[0].x,500);assert.equal(after.roots[0].y,300); // posição da raiz preservada
  assert.equal(kids[2].images[0].alt,'Tela');
  const again=JSON.parse(run(['update','--id','plano','--outline','v2.md'],{MMDC:shim}).stdout); // idempotente
  assert.deepEqual([again.added,again.updated,again.images],[[],[],0]);
  const pruned=JSON.parse(run(['update','--id','plano','--outline','v2.md','--prune'],{MMDC:shim}).stdout);
  assert.deepEqual(pruned.removed,['Gama']);
  assert.equal((await (await fetch(`${base}/api/presentations/plano`)).json()).roots[0].children.length,3);
  const missing=run(['update','--id','nao-existe','--outline','v2.md']);assert.notEqual(missing.status,0);assert.match(missing.stderr,/não encontrada/);
  assert.notEqual(run(['update','--outline','v2.md']).status,0);
 }
 // [rel:Título]: ligações cruzadas no create e no update
 {
  await writeFile(path.join(src,'rel1.md'),`# Rel\n- Frontend [rel:Backend]\n- Backend\n- Banco [rel:Nao existe]\n`);
  const made=JSON.parse(run(['create','--outline','rel1.md','--id','rel'],{MMDC:shim}).stdout);
  assert.ok(made.warnings.some(w=>/Nao existe/.test(w))); // alvo inexistente vira aviso
  const doc=await (await fetch(`${base}/api/presentations/rel`)).json(),kids=doc.roots[0].children;
  assert.deepEqual(kids[0].related,[kids[1].id]);assert.equal(kids[2].related,undefined);
  await writeFile(path.join(src,'rel2.md'),`# Rel\n- Frontend [rel:Backend]\n- Backend [rel:Banco]\n- Banco\n`);
  const upd=JSON.parse(run(['update','--id','rel','--outline','rel2.md'],{MMDC:shim}).stdout);assert.deepEqual(upd.warnings,[]);
  const after=(await (await fetch(`${base}/api/presentations/rel`)).json()).roots[0].children;
  assert.deepEqual(after[0].related,[kids[1].id]); // não duplica o que já existia
  assert.deepEqual(after[1].related,[after[2].id]);assert.equal(after[1].id,kids[1].id);
  assert.equal(JSON.parse(run(['update','--id','rel','--outline','rel2.md'],{MMDC:shim}).stdout).updated.length,0);
  assert.equal(run(['validate','--outline','rel2.md']).status,0);
 }
 // --version imprime a versão do pacote
 {const v=run(['--version']);assert.equal(v.status,0);assert.match(v.stdout,/^context-maps \d+\.\d+\.\d+\s*$/);assert.equal(run(['version']).stdout,v.stdout);}
 // idioma das mensagens (RM_LANG)
 const badEn=run(['validate','--outline','bad.md'],{RM_LANG:'en'});assert.match(badEn.stdout,/characters/);
 const againEn=run(['create','--outline','mapa.md','--id','fluxo-login'],{RM_LANG:'en',MMDC:shim});assert.match(againEn.stderr,/already exists/);
 const downEn=run(['status'],{RM_URL:'http://127.0.0.1:1',RM_LANG:'en'});assert.match(downEn.stderr,/Server unavailable/);
 console.log('PASS SKILL-01..09');
}finally{server.kill();await rm(work,{recursive:true,force:true});await rm(configDir,{recursive:true,force:true});}
