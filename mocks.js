/* Mocks do API client (sem DOM; o servidor e o navegador usam o mesmo módulo): cenários de resposta por request, guardados em
   mocks.json na raiz da coleção. Aqui ficam a normalização do arquivo, a regra de quando o mock responde, a montagem da resposta
   simulada e os resumos que o painel mostra (quantas requests têm mock ativo). */

export const MAX_SCENARIOS=40,MAX_BODY=256*1024,MAX_FILE=2*1024*1024,MAX_DELAY=60000;
export const MODES=['auto','on','off'];
export const KINDS=['response','timeout','network'];
export const PRESETS=[
 {key:'ok',kind:'response',status:200,body:'{\n  "ok": true\n}'},
 {key:'created',kind:'response',status:201,body:'{\n  "id": "{{$guid}}"\n}'},
 {key:'badRequest',kind:'response',status:400,body:'{\n  "error": "Bad request"\n}'},
 {key:'unauthorized',kind:'response',status:401,body:'{\n  "error": "Unauthorized"\n}'},
 {key:'notFound',kind:'response',status:404,body:'{\n  "error": "Not found"\n}'},
 {key:'conflict',kind:'response',status:409,body:'{\n  "error": "Conflict"\n}'},
 {key:'serverError',kind:'response',status:500,body:'{\n  "error": "Internal server error"\n}'},
 {key:'timeout',kind:'timeout',status:0,body:'',delayMs:5000},
 {key:'network',kind:'network',status:0,body:'',delayMs:300}
];
const STATUS_TEXT={200:'OK',201:'Created',202:'Accepted',204:'No Content',301:'Moved Permanently',302:'Found',304:'Not Modified',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',409:'Conflict',410:'Gone',422:'Unprocessable Entity',429:'Too Many Requests',500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'};
export const statusText=code=>STATUS_TEXT[code]||'';
const clean=(s,max)=>String(s??'').slice(0,max);
const num=(v,min,max,fallback)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;};

export const emptyMocks=()=>({version:1,requests:{}});
export const newScenarioId=existing=>{let i=existing.length+1;while(existing.some(s=>s.id===`s${i}`))i++;return `s${i}`;};
export function scenarioFromPreset(preset,existing=[],name=''){
 return {id:newScenarioId(existing),name:name||preset.key,kind:preset.kind,status:preset.status,headers:preset.kind==='response'&&preset.body.trim().startsWith('{')?[{name:'Content-Type',value:'application/json'}]:[],body:preset.body,delayMs:preset.delayMs??120};
}

/** valida e limpa o que veio do arquivo ou da rede: só caminhos de request, limites de tamanho, campos conhecidos */
export function normalizeMocks(raw){
 const out=emptyMocks();
 const requests=raw&&typeof raw==='object'&&raw.requests&&typeof raw.requests==='object'?raw.requests:{};
 for(const [rel,entry] of Object.entries(requests)){
  if(!/^[^\\:*?"<>|]+\.bru$/.test(rel)||rel.split('/').some(p=>!p||p==='..'||p.startsWith('.'))||!entry||typeof entry!=='object')continue;
  const scenarios=[];const ids=new Set();
  for(const sc of Array.isArray(entry.scenarios)?entry.scenarios.slice(0,MAX_SCENARIOS):[]){
   if(!sc||typeof sc!=='object')continue;
   let id=clean(sc.id,24).replace(/[^\w-]/g,'')||`s${scenarios.length+1}`;while(ids.has(id))id=`${id}x`;ids.add(id);
   const kind=KINDS.includes(sc.kind)?sc.kind:'response';
   scenarios.push({id,name:clean(sc.name,80)||id,kind,status:kind==='response'?num(sc.status,100,599,200):0,
    headers:(Array.isArray(sc.headers)?sc.headers.slice(0,40):[]).filter(h=>h&&typeof h.name==='string'&&h.name.trim()).map(h=>({name:clean(h.name,100).trim(),value:clean(h.value,2000)})),
    body:clean(sc.body,MAX_BODY),delayMs:num(sc.delayMs,0,MAX_DELAY,0)});
  }
  if(!scenarios.length)continue;
  out.requests[rel]={mode:MODES.includes(entry.mode)?entry.mode:'auto',active:scenarios.some(s=>s.id===entry.active)?entry.active:scenarios[0].id,scenarios};
 }
 return out;
}

/** o cenário que responde por esta request agora (ou null): 'on' sempre, 'off' nunca, 'auto' só com o modo mock da coleção ligado */
export function effectiveMock(mocks,rel,collectionMode){
 const entry=mocks?.requests?.[rel];if(!entry?.scenarios?.length)return null;
 const mode=entry.mode||'auto';
 if(mode==='off'||(mode==='auto'&&!collectionMode))return null;
 return entry.scenarios.find(s=>s.id===entry.active)||entry.scenarios[0];
}
/** 'on' (responde com mock), 'ready' (tem cenários, mas está desligado) ou '' */
export function mockBadge(mocks,rel,collectionMode){
 const entry=mocks?.requests?.[rel];if(!entry?.scenarios?.length)return '';
 return effectiveMock(mocks,rel,collectionMode)?'on':'ready';
}
/** resumo de uma pasta/coleção: {on, ready} (items: árvore do servidor) */
export function mockCounts(items,mocks,collectionMode){
 const c={on:0,ready:0};
 const walk=list=>{for(const it of list||[]){if(it.type==='request'){const b=mockBadge(mocks,it.path,collectionMode);if(b==='on')c.on++;else if(b==='ready')c.ready++;}else walk(it.children);}};
 walk(items);return c;
}

/** resposta simulada no mesmo formato do POST /api/send (ou {error,detail} para timeout e falha de rede) */
export function scenarioResponse(sc,interpolate=x=>x,{url=''}={}){
 if(sc.kind==='timeout')return {error:'timeout',detail:String(Math.max(1,Math.round((sc.delayMs||5000)/1000))),mock:true};
 if(sc.kind==='network')return {error:'network',detail:'Connection refused (mock)',mock:true};
 const bodyText=interpolate(sc.body||''),headers=(sc.headers||[]).map(h=>[h.name.toLowerCase(),interpolate(h.value)]);
 let contentType=headers.find(([k])=>k==='content-type')?.[1];
 if(!contentType){contentType=/^\s*[\[{]/.test(bodyText)?'application/json':'text/plain';headers.push(['content-type',contentType]);}
 const size=new TextEncoder().encode(bodyText).length;
 return {status:sc.status,statusText:statusText(sc.status),url,headers,timeMs:sc.delayMs||0,size,truncated:false,contentType,bodyText,mock:true};
}
