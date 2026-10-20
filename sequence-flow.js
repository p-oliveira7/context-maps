/* Ligação de um passo do diagrama de sequência a uma request do API client, e as regras que decidem
   se a resposta pinta o passo de verde ou de vermelho. Tudo puro (sem DOM): serve ao editor, à janela de fluxo e aos testes. */

export const MAX_RULES=12;
const clip=(v,n)=>String(v??'').slice(0,n);

export const RULE_WHEN=['status','body','asserts'];
export const STATUS_OPS=['eq','not','range'];
export const BODY_OPS=['eq','neq','exists','missing'];
export const ASSERT_OPS=['pass','fail'];
export const RESULTS=['ok','fail'];

/** regra vinda de qualquer lugar (comentário do Mermaid, arquivo) -> regra válida, ou null */
export function normalizeRule(raw){
 if(!raw||typeof raw!=='object')return null;
 const when=RULE_WHEN.includes(raw.when)?raw.when:null,result=RESULTS.includes(raw.result)?raw.result:null;
 if(!when||!result)return null;
 if(when==='status'){
  const op=STATUS_OPS.includes(raw.op)?raw.op:'eq',value=clip(raw.value,8).trim();
  if(op==='range'){if(!/^[1-5]xx$/i.test(value))return null;return {when,op,value:value.toLowerCase(),result};}
  if(!/^\d{3}$/.test(value))return null;
  return {when,op,value,result};
 }
 if(when==='body'){
  const op=BODY_OPS.includes(raw.op)?raw.op:'eq',path=clip(raw.path,120).trim();
  if(!path)return null;
  return op==='exists'||op==='missing'?{when,op,path,result}:{when,op,path,value:clip(raw.value,200),result};
 }
 const op=ASSERT_OPS.includes(raw.op)?raw.op:'pass';
 return {when,op,result};
}

/** {collection,request,rules} -> ligação válida, ou null quando não aponta para uma request */
export function normalizeBind(raw){
 if(!raw||typeof raw!=='object')return null;
 const collection=clip(raw.collection,120),request=clip(raw.request,300);
 if(!collection||!request||request.includes('..'))return null;
 const rules=(Array.isArray(raw.rules)?raw.rules:[]).map(normalizeRule).filter(Boolean).slice(0,MAX_RULES);
 return {collection,request,rules};
}

/** id curto e estável para um passo (s1, s2…), sem repetir os que o modelo já usa */
export function newStepId(model){
 const used=new Set(model.steps.map(s=>s.id).filter(Boolean));
 let n=1;while(used.has(`s${n}`))n++;
 return `s${n}`;
}

const readPath=(value,path)=>{
 const parts=String(path).replace(/^(?:res\.)?body\.?/,'').match(/[^.[\]]+/g)||[];
 let cur=value;
 for(const key of parts){if(cur===null||cur===undefined||typeof cur!=='object')return undefined;cur=cur[key];}
 return cur;
};

function matches(rule,res){
 if(rule.when==='status'){
  const status=Number(res.status)||0;
  if(rule.op==='range')return String(Math.floor(status/100))===rule.value[0];
  return rule.op==='eq'?String(status)===rule.value:String(status)!==rule.value;
 }
 if(rule.when==='body'){
  const v=readPath(res.body,rule.path);
  if(rule.op==='exists')return v!==undefined&&v!==null;
  if(rule.op==='missing')return v===undefined||v===null;
  const same=String(v)===rule.value;
  return rule.op==='eq'?same:!same;
 }
 const passed=res.assertionsPassed;
 if(passed===undefined||passed===null)return false;
 return rule.op==='pass'?!!passed:!passed;
}

/** resposta -> 'ok' | 'fail'. A primeira regra que combina decide; sem regra, vale o status (< 400 é ok). Erro de rede/timeout é sempre 'fail'. */
export function evaluateOutcome(bind,res){
 if(!res||res.error)return 'fail';
 for(const rule of bind?.rules||[])if(matches(rule,res))return rule.result;
 const status=Number(res.status)||0;
 return status>=100&&status<400?'ok':'fail';
}

/** descrição curta de uma regra, para listas e dicas */
export function describeRule(rule,t){
 const cond=rule.when==='status'?(rule.op==='range'?`${rule.value}`:rule.op==='not'?`≠ ${rule.value}`:`= ${rule.value}`)
  :rule.when==='body'?(rule.op==='exists'||rule.op==='missing'?`${rule.path} ${t(rule.op==='exists'?'seqFlowExists':'seqFlowMissing')}`:`${rule.path} ${rule.op==='eq'?'=':'≠'} ${rule.value}`)
  :t(rule.op==='pass'?'seqFlowAssertsPass':'seqFlowAssertsFail');
 return `${t(`seqFlowWhen_${rule.when}`)} ${cond} → ${t(rule.result==='ok'?'seqFlowOk':'seqFlowFail')}`;
}

/** comentário do Mermaid que guarda a ligação; o Mermaid ignora linhas "%%", então o diagrama continua válido */
export const stepComment=step=>step.bind?`%% @step ${step.id} ${JSON.stringify(step.bind)}`:'';
const STEP_RE=/^%%\s*@step\s+([\w-]{1,24})\s*(\{.*\})?\s*$/;
export function parseStepComment(line){
 const m=STEP_RE.exec(line.trim());if(!m)return null;
 let bind=null;if(m[2]){try{bind=normalizeBind(JSON.parse(m[2]));}catch{bind=null;}}
 return {id:m[1],bind};
}

/* ---------- caminho percorrido ---------- */
const CODE=/^\s*(?:\d+\.\s*)?([1-5]\d\d)\b/;
/** código HTTP que abre o texto de uma mensagem ("402 Payment required" -> 402), ou 0 */
export const statusInLabel=text=>{const m=CODE.exec(String(text||''));return m?Number(m[1]):0;};

/**
 * Qual caminho o resultado percorre no diagrama. `live`: Map id do passo ligado -> {status,outcome,error}.
 * Devolve {state:[...]} com um estado por passo: 'ok' (percorrido), 'fail' (desfecho com erro), 'skip' (ramo não tomado) ou '' (não alcançado).
 * O resultado da última chamada ligada escolhe o ramo dos alt/opt/break: pelo código HTTP que as respostas do ramo citam
 * ("201 Created" / "402 Payment required"), pela classe (2xx) ou, sem pistas, pelo sucesso (1º ramo) ou falha (último).
 */
export function tracePath(model,live){
 const steps=model.steps,n=steps.length,state=new Array(n).fill('');
 const blocks=new Map(),stack=[];
 steps.forEach((s,i)=>{
  if(s.type==='group')stack.push({start:i,kind:s.kind,dividers:[]});
  else if(s.type==='else'&&stack.length)stack.at(-1).dividers.push(i);
  else if(s.type==='end'&&stack.length){const b=stack.pop();b.end=i;blocks.set(b.start,b);}
 });
 let result=null,halted=false;
 const mark=(a,b,v)=>{for(let k=a;k<b;k++)state[k]=v;};
 const codesIn=(a,b)=>{ // só as respostas do próprio ramo; blocos aninhados têm os códigos deles
  const out=[];
  for(let k=a;k<b;k++){
   if(steps[k].type==='group'&&blocks.has(k)){k=blocks.get(k).end;continue;}
   if(steps[k].type==='message'){const c=statusInLabel(steps[k].text);if(c)out.push(c);}
  }
  return out;
 };
 function pick(branches){
  if(branches.length===1)return 0;
  const codes=branches.map(b=>codesIn(b.from,b.to));
  let at=codes.findIndex(c=>c.includes(result.status));
  if(at<0)at=codes.findIndex(c=>c.some(x=>Math.floor(x/100)===Math.floor(result.status/100)));
  if(at<0)at=result.outcome==='ok'?0:branches.length-1;
  return at;
 }
 function walk(from,to){
  for(let i=from;i<to&&!halted;){
   const s=steps[i];
   if(s.type==='group'&&blocks.has(i)){
    const b=blocks.get(i);
    if(!result){i=b.end+1;continue;} // ainda sem resultado: o bloco fica como está
    const edges=[b.start+1,...b.dividers.flatMap(d=>[d,d+1]),b.end];
    const branches=[];for(let k=0;k<edges.length;k+=2)branches.push({from:edges[k],to:edges[k+1]});
    let take=[];
    if(b.kind==='alt')take=[pick(branches)];
    else if(b.kind==='critical')take=[result.outcome==='fail'&&branches.length>1?branches.length-1:0];
    else if(b.kind==='opt'){const c=codesIn(branches[0].from,branches[0].to);take=!c.length||c.includes(result.status)||result.outcome==='ok'&&!c.some(x=>x>=400)?[0]:[];}
    else if(b.kind==='break')take=result.outcome==='fail'?[0]:[];
    else take=branches.map((_,k)=>k); // loop e par: tudo acontece
    state[b.start]=take.length?'ok':'skip';state[b.end]=state[b.start];
    branches.forEach((br,k)=>{
     const divider=k===0?b.start:b.dividers[k-1];
     if(!take.includes(k)){mark(k===0?br.from:divider,br.to,'skip');return;}
     if(k>0)state[divider]='ok';
     walk(br.from,br.to);
    });
    i=b.end+1;continue;
   }
   if(s.type==='message'){
    const lv=s.bind&&s.id?live.get(s.id):null;
    if(s.bind){
     if(!lv){halted=true;return;} // chamada ainda não feita: o caminho pára aqui
     result={status:lv.status,outcome:lv.outcome};
     state[i]=lv.error?'fail':'ok';if(lv.error){halted=true;return;}
    }else if(result){
     const code=statusInLabel(s.text);
     state[i]=code&&code===result.status?result.outcome:'ok';
    }
   }else if(s.type==='note'||s.type==='activate'||s.type==='deactivate'){
    if(result)state[i]='ok';
   }
   i++;
  }
 }
 walk(0,n);
 return {state,result};
}
