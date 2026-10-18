// Leitor e gravador do formato .bru (Bruno): requests, pastas, collection.bru e ambientes.
// Blocos desconhecidos (auth avançado, assert, etc.) são guardados como estão e voltam iguais ao salvar.
const TEXT_BLOCKS=new Set(['body:json','body:text','body:xml','body:sparql','body:graphql','body:graphql:vars','script:pre-request','script:post-response','tests','docs']);
export const METHODS=['get','post','put','patch','delete','options','head','trace','connect'];

/* ---------- texto -> blocos ---------- */
const dedent=lines=>lines.map(l=>l.startsWith('  ')?l.slice(2):l.trimStart()===''?'':l).join('\n').replace(/\n+$/,'');
function entry(line){
 const t=line.trim(),enabled=!t.startsWith('~'),body=enabled?t:t.slice(1),at=body.indexOf(':');
 return at<0?{name:body.trim(),value:'',enabled}:{name:body.slice(0,at).trim(),value:body.slice(at+1).trim(),enabled};
}
export function parseBlocks(text){
 const lines=String(text).replace(/^﻿/,'').replace(/\r\n/g,'\n').split('\n'),blocks=[];
 let i=0;
 while(i<lines.length){
  const m=/^([\w:.-]+)\s*([{[])\s*$/.exec(lines[i]);
  if(!m){i++;continue;}
  const [,name,open]=m,close=open==='{'?'}':']',body=[];i++;
  while(i<lines.length&&!lines[i].startsWith(close))body.push(lines[i++]);
  i++;
  if(open==='[')blocks.push({name,kind:'array',items:body.map(l=>l.trim().replace(/,$/,'')).filter(Boolean)});
  else if(TEXT_BLOCKS.has(name))blocks.push({name,kind:'text',text:dedent(body)});
  else blocks.push({name,kind:'dict',entries:body.filter(l=>l.trim()).map(entry)});
 }
 return blocks;
}

/* ---------- blocos -> texto ---------- */
const entryLine=e=>`  ${e.enabled===false?'~':''}${e.name}: ${e.value??''}`;
const indent=text=>String(text).split('\n').map(l=>l===''?'':`  ${l}`).join('\n');
export function stringifyBlocks(blocks){
 return blocks.map(b=>{
  if(b.kind==='array')return `${b.name} [\n${b.items.map((it,k)=>`  ${it}${k<b.items.length-1?',':''}`).join('\n')}\n]\n`;
  if(b.kind==='text')return `${b.name} {\n${indent(b.text)}\n}\n`;
  return `${b.name} {\n${b.entries.map(entryLine).join('\n')}${b.entries.length?'\n':''}}\n`;
 }).join('\n');
}

/* ---------- blocos <-> modelo (request, pasta ou coleção) ---------- */
const dict=(blocks,name)=>blocks.find(b=>b.name===name&&b.kind==='dict')?.entries;
const text=(blocks,name)=>blocks.find(b=>b.name===name&&b.kind==='text')?.text;
const get=(entries,key)=>entries?.find(e=>e.name===key)?.value;
const KNOWN=new Set(['meta','params:query','params:path','headers','auth','auth:bearer','auth:basic','body:json','body:text','body:xml','body:form-urlencoded','body:multipart-form','vars:pre-request','vars:post-response','assert','script:pre-request','script:post-response','tests','docs',...METHODS]);

export function toModel(blocks){
 const meta=dict(blocks,'meta')||[],m={name:get(meta,'name')||'',type:get(meta,'type')||'http'};
 const seq=Number(get(meta,'seq'));if(Number.isFinite(seq))m.seq=seq;
 const verb=blocks.find(b=>METHODS.includes(b.name)&&b.kind==='dict');
 if(verb){m.method=verb.name;m.url=get(verb.entries,'url')||'';m.bodyMode=get(verb.entries,'body')||'none';m.authMode=get(verb.entries,'auth')||'none';}
 const list=name=>dict(blocks,name);
 if(list('params:query'))m.query=list('params:query');
 if(list('params:path'))m.pathParams=list('params:path');
 if(list('headers'))m.headers=list('headers');
 const bearer=list('auth:bearer'),basic=list('auth:basic');
 if(bearer)m.bearer={token:get(bearer,'token')||''};
 if(basic)m.basic={username:get(basic,'username')||'',password:get(basic,'password')||''};
 for(const [key,name] of [['json','body:json'],['text','body:text'],['xml','body:xml']])if(text(blocks,name)!==undefined)(m.body||={})[key]=text(blocks,name);
 if(list('body:form-urlencoded'))m.formUrlEncoded=list('body:form-urlencoded');
 if(list('body:multipart-form'))m.multipartForm=list('body:multipart-form');
 if(list('vars:pre-request'))m.varsPre=list('vars:pre-request');
 if(list('vars:post-response'))m.varsPost=list('vars:post-response');
 if(list('assert'))m.assertions=list('assert');
 if(text(blocks,'script:pre-request')!==undefined)m.scriptPre=text(blocks,'script:pre-request');
 if(text(blocks,'script:post-response')!==undefined)m.scriptPost=text(blocks,'script:post-response');
 if(text(blocks,'tests')!==undefined)m.tests=text(blocks,'tests');
 if(text(blocks,'docs')!==undefined)m.docs=text(blocks,'docs');
 const extras=blocks.filter(b=>!KNOWN.has(b.name));
 if(extras.length)m.extras=extras;
 return m;
}

export function fromModel(m){
 const blocks=[],dictBlock=(name,entries)=>{if(entries&&entries.length)blocks.push({name,kind:'dict',entries});},textBlock=(name,t)=>{if(t!==undefined&&t!==null)blocks.push({name,kind:'text',text:String(t)});};
 const meta=[{name:'name',value:m.name||'',enabled:true},{name:'type',value:m.type||'http',enabled:true}];
 if(Number.isFinite(m.seq))meta.push({name:'seq',value:String(m.seq),enabled:true});
 dictBlock('meta',meta);
 if(m.method){
  const verb=[{name:'url',value:m.url||'',enabled:true},{name:'body',value:m.bodyMode||'none',enabled:true},{name:'auth',value:m.authMode||'none',enabled:true}];
  dictBlock(METHODS.includes(m.method)?m.method:'get',verb);
 }
 dictBlock('params:query',m.query);dictBlock('params:path',m.pathParams);dictBlock('headers',m.headers);
 if(m.bearer)dictBlock('auth:bearer',[{name:'token',value:m.bearer.token||'',enabled:true}]);
 if(m.basic)dictBlock('auth:basic',[{name:'username',value:m.basic.username||'',enabled:true},{name:'password',value:m.basic.password||'',enabled:true}]);
 textBlock('body:json',m.body?.json);textBlock('body:text',m.body?.text);textBlock('body:xml',m.body?.xml);
 dictBlock('body:form-urlencoded',m.formUrlEncoded);dictBlock('body:multipart-form',m.multipartForm);
 dictBlock('vars:pre-request',m.varsPre);dictBlock('vars:post-response',m.varsPost);dictBlock('assert',m.assertions);
 textBlock('script:pre-request',m.scriptPre);textBlock('script:post-response',m.scriptPost);textBlock('tests',m.tests);textBlock('docs',m.docs);
 for(const extra of m.extras||[])blocks.push(extra);
 return blocks;
}

export const parseBru=source=>toModel(parseBlocks(source));
export const stringifyBru=model=>stringifyBlocks(fromModel(model));

/* ---------- ambientes: vars { } e vars:secret [ ] (o valor do segredo nunca vai para o arquivo) ---------- */
export function parseEnv(source){
 const blocks=parseBlocks(source),vars=dict(blocks,'vars')||[],secrets=blocks.find(b=>b.name==='vars:secret'&&b.kind==='array')?.items||[];
 return {vars:vars.map(v=>({name:v.name,value:v.value,enabled:v.enabled,secret:false})),secrets};
}
export function stringifyEnv({vars=[],secrets=[]}){
 const blocks=[{name:'vars',kind:'dict',entries:vars.filter(v=>!v.secret).map(v=>({name:v.name,value:v.value,enabled:v.enabled!==false}))}];
 if(secrets.length)blocks.push({name:'vars:secret',kind:'array',items:secrets});
 return stringifyBlocks(blocks);
}
