import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(root,'skills/response-maps/scripts/rm.mjs');
const work=await mkdtemp(path.join(tmpdir(),'rm-skill-'));
const data=path.join(work,'data'),src=path.join(work,'src');
await mkdir(src);
const port=4191,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PRESENTATIONS_DIR:data},stdio:['ignore','pipe','inherit']});
await new Promise((ok,fail)=>{server.stdout.once('data',ok);server.once('exit',c=>fail(new Error(`server exit ${c}`)));});
const run=(args,env={})=>spawnSync(process.execPath,[cli,...args],{cwd:src,encoding:'utf8',env:{...process.env,RM_URL:base,...env}});
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
  '- Autenticar {color=#112233}',
  '  - Validar credenciais',
  '  - Fluxo detalhado [mermaid:fluxo.mmd] [mermaid:fluxo.mmd] [img:tela.png|Print]',
  '- Sessão',
  '    - Renovar token',
  '- Anexo ausente [img:nao-existe.png]',
  '- Documentação [link:https://example.com/docs|Docs] [link:https://example.org] [link:ftp://x.test/arquivo]',
  ''].join('\n'));
 const ok=run(['create','--outline','mapa.md','--id','fluxo-login'],{MMDC:shim});
 assert.equal(ok.status,0,ok.stderr+ok.stdout);
 const report=JSON.parse(ok.stdout);
 assert.equal(report.id,'fluxo-login');assert.equal(report.url,`${base}/?p=fluxo-login`);
 assert.equal(report.images,3);assert.equal(report.diagrams,2);assert.equal(report.skipped.length,2);assert.equal(report.links,2);
 const doc=JSON.parse(await readFile(path.join(data,'fluxo-login.json'),'utf8'));
 const t=doc.tree;
 assert.equal(t.title,'Fluxo de login');assert.equal(t.children.length,4);assert.equal(t.images.length,2);assert.equal(t.images[0].alt,'Tela inicial');assert.equal(t.images[1].alt,'Segunda tela');assert.equal(t.image,undefined);
 assert.equal(t.children[0].color,'#112233');assert.equal(t.children[0].children.length,2);
 const multi=t.children[0].children[1].images;assert.deepEqual(multi.map(i=>i.kind||'image'),['diagram','diagram','image']);assert.match(multi[0].source,/flowchart/);
 assert.equal(t.children[1].children[0].title,'Renovar token');
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
 console.log('PASS SKILL-01..06');
}finally{server.kill();await rm(work,{recursive:true,force:true});}
