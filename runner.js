/* Execução de pastas do cliente de API (run e run recursivo), sem DOM e testável em Node:
   escolhe as requests na ordem da árvore, roda uma a uma e classifica cada resultado. */

/** items: filhos da pasta (ou da coleção) já na ordem da árvore. `base` é o caminho da pasta executada ('' para a coleção). */
export function collectRequests(items,{recursive=true,base=''}={}){
 const out=[];
 const walk=list=>{
  for(const it of list||[]){
   if(it.type==='request')out.push({path:it.path,name:it.name,method:it.method,group:groupOf(it.path,base)});
   else if(it.type==='folder'&&recursive)walk(it.children);
  }
 };
 walk(items);
 return out;
}
/** Pasta da request relativa à pasta executada, para agrupar no relatório ("" = direto na pasta). */
export function groupOf(path,base=''){
 const rel=base&&path.startsWith(`${base}/`)?path.slice(base.length+1):path;
 return rel.includes('/')?rel.slice(0,rel.lastIndexOf('/')):'';
}

/** Todos os asserts e testes de script de um resultado, no mesmo formato. */
export const checksOf=out=>[...(out?.extra?.asserts||[]),...(out?.extra?.tests||[])];
/** passed | failed (algum assert/teste falhou) | error (falha de rede, tempo esgotado ou erro de script) */
export function classify(out){
 if(!out||out.error||out.extra?.errors?.length)return 'error';
 return checksOf(out).some(c=>!c.passed)?'failed':'passed';
}

/** Resumo de uma execução: contagem por estado, asserts/testes e duração somada das requests. */
export function summarize(items){
 const count=s=>items.filter(i=>i.status===s).length;
 const checks=items.flatMap(i=>checksOf(i.out));
 return {total:items.length,passed:count('passed'),failed:count('failed'),errors:count('error'),skipped:count('skipped'),
  pending:count('pending')+count('running'),checksTotal:checks.length,checksPassed:checks.filter(c=>c.passed).length,
  timeMs:items.reduce((sum,i)=>sum+(i.out?.timeMs||0),0)};
}

const sleep=(ms,signal)=>new Promise(resolve=>{
 if(signal?.aborted)return resolve();
 const timer=setTimeout(done,ms);
 function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();}
 signal?.addEventListener('abort',done,{once:true});
});

/**
 * Roda `items` em sequência. `execute(item)` devolve o resultado da request (ou lança); `onChange(item)` avisa cada mudança de estado.
 * Termina com 'done', 'stopped' (parou na primeira falha) ou 'cancelled'; o que não rodou fica 'skipped'.
 */
export async function runSequence(items,{execute,signal,stopOnFail=false,delayMs=0,onChange=()=>{}}){
 let status='done';
 for(let i=0;i<items.length;i++){
  const item=items[i];
  if(signal?.aborted){status='cancelled';break;}
  item.status='running';delete item.out;onChange(item);
  let out;
  try{out=await execute(item);}catch(error){out={error:'network',detail:String(error?.message||error),timeMs:0,extra:{logs:[],tests:[],asserts:[],errors:[]}};}
  if(signal?.aborted&&out?.error==='cancelled'){item.status='skipped';onChange(item);status='cancelled';break;}
  item.out=out;item.status=classify(out);onChange(item);
  if(stopOnFail&&item.status!=='passed'){status='stopped';break;}
  if(delayMs>0&&i<items.length-1)await sleep(delayMs,signal);
 }
 for(const item of items)if(item.status==='pending'){item.status='skipped';onChange(item);}
 return status;
}

/** Relatório em JSON (sem cabeçalhos nem corpos): quem rodou, o que passou e o que falhou. */
export function reportJson(run){
 return {title:run.title,environment:run.env||null,recursive:run.recursive,status:run.status,startedAt:run.startedAt,finishedAt:run.finishedAt||null,
  summary:summarize(run.items),
  requests:run.items.map(i=>({path:i.path,name:i.name,method:i.method,group:i.group,status:i.status,
   http:i.out?.status??null,timeMs:i.out?.timeMs??null,url:i.out?.sent?.url??null,error:i.out?.error?(i.out.detail||i.out.error):null,
   checks:checksOf(i.out).map(c=>({name:c.name||`${c.expression} ${c.assertion}`,passed:!!c.passed,...(c.error?{error:c.error}:{})}))}))};
}
/** Texto curto para colar em issues e chats. */
export function reportText(run,t){
 const s=summarize(run.items),mark={passed:'✓',failed:'✗',error:'!',skipped:'–',pending:'·',running:'…'};
 return [`${run.title}: ${t('apiRunSummaryLine',s.passed,s.total,s.failed,s.errors)}`,...run.items.map(i=>`${mark[i.status]||'·'} ${String(i.method).toUpperCase()} ${i.name}${i.out?.status?` (${i.out.status}, ${i.out.timeMs} ms)`:''}`)].join('\n');
}
