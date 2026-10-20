/* Operações de edição do diagrama de sequência (sem DOM): todas alteram o modelo no lugar e devolvem o que o editor precisa
   (índice selecionado, quantos passos sumiram…). O histórico guarda cópias do modelo para desfazer/refazer. */

const clone=m=>JSON.parse(JSON.stringify(m));
const SIMPLE=new Set(['message','note','activate','deactivate']);

/* ---------- histórico ---------- */
export function createHistory(model,limit=100){
 let stack=[JSON.stringify(model)],at=0;
 return {
  push(m){const snap=JSON.stringify(m);if(snap===stack[at])return false;stack=stack.slice(0,at+1);stack.push(snap);if(stack.length>limit)stack.shift();at=stack.length-1;return true;},
  undo(){if(at<=0)return null;at--;return JSON.parse(stack[at]);},
  redo(){if(at>=stack.length-1)return null;at++;return JSON.parse(stack[at]);},
  get canUndo(){return at>0;},get canRedo(){return at<stack.length-1;},
  reset(m){stack=[JSON.stringify(m)];at=0;}
 };
}

/* ---------- consultas ---------- */
/** índice do "end" que fecha o bloco aberto em k (ou -1) */
export function matchEnd(model,k){
 if(model.steps[k]?.type!=='group')return -1;
 let depth=0;
 for(let i=k;i<model.steps.length;i++){
  const t=model.steps[i].type;
  if(t==='group')depth++;else if(t==='end'){depth--;if(depth===0)return i;}
 }
 return -1;
}
/** índice do "group" que abre o bloco em que o passo k está (ou -1) */
export function groupOf(model,k){
 let depth=0;
 for(let i=k;i>=0;i--){
  const t=model.steps[i].type;
  if(i!==k&&t==='end')depth++;
  else if(t==='group'){if(depth===0&&i!==k)return i;if(i!==k)depth--;}
 }
 return -1;
}
export function depthOf(model,k){let d=0;for(let i=0;i<k;i++){const t=model.steps[i].type;if(t==='group')d++;else if(t==='end')d--;}return model.steps[k].type==='end'||model.steps[k].type==='else'?Math.max(0,d-1):d;}
export const nameOf=(model,id)=>model.participants.find(p=>p.id===id)?.name??id;
/** resumo de uma linha para a lista de passos */
export function describeStep(model,k){
 const s=model.steps[k],n=id=>nameOf(model,id);
 if(s.type==='message'){const arrow={solid:'→',dashed:'⇢'}[s.style]||'→';return `${n(s.from)} ${arrow} ${n(s.to)}: ${s.text}`;}
 if(s.type==='note')return `${s.position==='over'?'over':s.position} ${s.actors.map(n).join(', ')}: ${s.text}`;
 if(s.type==='group')return `${s.kind}${s.label?` [${s.label}]`:''}`;
 if(s.type==='else')return `${s.label?`else [${s.label}]`:'else'}`;
 if(s.type==='end')return 'end';
 return `${s.type} ${n(s.actor)}`;
}

/* ---------- participantes ---------- */
export function uniqueParticipantId(model,base='P'){
 const clean=String(base).replace(/[^\w.$@-]+/g,'').slice(0,20)||'P';
 if(!model.participants.some(p=>p.id===clean))return clean;
 for(let i=2;;i++)if(!model.participants.some(p=>p.id===`${clean}${i}`))return `${clean}${i}`;
}
export function addParticipant(model,{name,kind='participant',index=model.participants.length}={}){
 const label=String(name||'').trim()||`Participant ${model.participants.length+1}`;
 const id=uniqueParticipantId(model,String(name||'').trim()?label.replace(/\s+/g,''):'P');
 model.participants.splice(Math.max(0,Math.min(index,model.participants.length)),0,{id,name:label,kind});
 return id;
}
export function renameParticipant(model,id,name){const p=model.participants.find(x=>x.id===id);if(p&&String(name).trim())p.name=String(name).trim();}
export function setParticipantKind(model,id,kind){const p=model.participants.find(x=>x.id===id);if(p)p.kind=kind==='actor'?'actor':'participant';}
export function moveParticipant(model,id,dir){
 const i=model.participants.findIndex(p=>p.id===id),j=i+dir;
 if(i<0||j<0||j>=model.participants.length)return false;
 [model.participants[i],model.participants[j]]=[model.participants[j],model.participants[i]];return true;
}
/** apaga o participante e os passos que dependem dele; devolve quantos passos sumiram */
export function removeParticipant(model,id){
 const before=model.steps.length,drop=new Set();
 model.steps.forEach((s,i)=>{
  if(s.type==='message'&&(s.from===id||s.to===id))drop.add(i);
  else if((s.type==='activate'||s.type==='deactivate')&&s.actor===id)drop.add(i);
  else if(s.type==='note'){s.actors=s.actors.filter(a=>a!==id);if(!s.actors.length)drop.add(i);}
 });
 model.steps=model.steps.filter((_,i)=>!drop.has(i));
 model.participants=model.participants.filter(p=>p.id!==id);
 return before-model.steps.length;
}
export const participantUse=(model,id)=>model.steps.filter(s=>(s.type==='message'&&(s.from===id||s.to===id))||((s.type==='activate'||s.type==='deactivate')&&s.actor===id)||(s.type==='note'&&s.actors.includes(id))).length;

/* ---------- passos ---------- */
const clampAt=(model,at)=>at===undefined||at===null?model.steps.length:Math.max(0,Math.min(at,model.steps.length));
export function addMessage(model,{from,to,text='message',at,style='solid',head='arrow'}={}){
 if(!model.participants.length)addParticipant(model,{name:'A'});
 const a=from??model.participants[0].id,b=to??(model.participants[1]?.id??a);
 const i=clampAt(model,at);
 model.steps.splice(i,0,{type:'message',from:a,to:b,text,style,head,activate:''});
 return i;
}
export function addNote(model,{actors,position='right',text='note',at}={}){
 if(!model.participants.length)addParticipant(model,{name:'A'});
 const i=clampAt(model,at);
 model.steps.splice(i,0,{type:'note',position,actors:actors?.length?actors:[model.participants[0].id],text});
 return i;
}
export function updateStep(model,k,patch){const s=model.steps[k];if(!s)return;Object.assign(s,patch);if(s.type==='note'&&s.position!=='over')s.actors=s.actors.slice(0,1);}
/** apaga o passo; um bloco some mas o que há dentro continua (sem o "else"/"end" dele); devolve o índice a selecionar */
export function removeStep(model,k){
 const s=model.steps[k];if(!s)return -1;
 if(s.type==='group'){const e=matchEnd(model,k);const inner=new Set([k,e]);for(let i=k+1;i<e;i++)if(model.steps[i].type==='else'&&depthOf(model,i)===depthOf(model,k))inner.add(i);model.steps=model.steps.filter((_,i)=>!inner.has(i));}
 else if(s.type==='end'){return k;}
 else model.steps.splice(k,1);
 return Math.min(k,model.steps.length-1);
}
/** coloca um bloco em volta do passo k (e do que há até o fim do bloco que o contém, se k for um bloco) */
export function wrapInGroup(model,k,kind='loop',label=''){
 const s=model.steps[k];if(!s)return -1;
 const last=s.type==='group'?matchEnd(model,k):k;
 model.steps.splice(last+1,0,{type:'end'});
 model.steps.splice(k,0,{type:'group',kind,label});
 return k;
}
/** bloco vazio no fim (ou em `at`) com uma mensagem dentro, para não nascer vazio */
export function addGroup(model,{kind='loop',label='',at}={}){
 const i=clampAt(model,at);
 const first=model.participants[0]?.id,second=model.participants[1]?.id??first;
 model.steps.splice(i,0,{type:'group',kind,label},{type:'message',from:first,to:second,text:'message',style:'solid',head:'arrow',activate:''},{type:'end'});
 return i;
}
/** nova ramificação (else/and) no fim do bloco que começa em k */
export function addElse(model,k,label=''){
 const e=matchEnd(model,k);if(e<0)return -1;
 model.steps.splice(e,0,{type:'else',label});return e;
}
function unitStart(model,i){ // início da "unidade" (passo simples ou bloco inteiro) que termina em i
 if(model.steps[i].type!=='end')return i;
 let depth=0;
 for(let j=i;j>=0;j--){const t=model.steps[j].type;if(t==='end')depth++;else if(t==='group'){depth--;if(depth===0)return j;}}
 return i;
}
/** troca o passo (ou bloco) k de lugar com o vizinho; devolve o novo índice ou -1 */
export function moveStep(model,k,dir){
 const s=model.steps[k];if(!s||s.type==='else'||s.type==='end')return -1;
 const end=s.type==='group'?matchEnd(model,k):k;
 if(dir<0){
  if(k===0)return -1;
  const prevEnd=k-1,pt=model.steps[prevEnd].type;
  if(pt==='group'||pt==='else')return -1; // o vizinho de cima é o começo de um bloco: não entra nele
  const start=unitStart(model,prevEnd),chunk=model.steps.splice(k,end-k+1);
  model.steps.splice(start,0,...chunk);return start;
 }
 if(end>=model.steps.length-1)return -1;
 const nxt=model.steps[end+1];if(nxt.type==='end'||nxt.type==='else')return -1;
 const nextEnd=nxt.type==='group'?matchEnd(model,end+1):end+1,chunk=model.steps.splice(k,end-k+1);
 const insertAt=nextEnd-chunk.length+1;
 model.steps.splice(insertAt,0,...chunk);return insertAt;
}
export const isMovable=(model,k,dir)=>{const c=clone(model);return moveStep(c,k,dir)>=0;};
export const isSimple=s=>SIMPLE.has(s.type);
