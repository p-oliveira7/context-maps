/* Asserts declarativos do Bruno (bloco `assert { res.status: eq 200 }`) e leitura de caminhos como `res.body.items[0].id`.
   Nada aqui executa código: só percorre objetos e compara valores. */

/* ---------- caminhos ---------- */
export function parsePath(expr){
 const tokens=[];let i=0;const text=String(expr).trim();
 while(i<text.length){
  const ch=text[i];
  if(ch==='.'){i++;continue;}
  if(ch==='['){
   const end=text.indexOf(']',i);if(end<0)return null;
   const raw=text.slice(i+1,end).trim();
   tokens.push(/^["'].*["']$/.test(raw)?raw.slice(1,-1):/^-?\d+$/.test(raw)?Number(raw):raw);
   i=end+1;continue;
  }
  let j=i;while(j<text.length&&text[j]!=='.'&&text[j]!=='[')j++;
  tokens.push(text.slice(i,j));i=j;
 }
 return tokens.length?tokens:null;
}
export function getPath(scope,expr){
 const tokens=parsePath(expr);if(!tokens)return undefined;
 let value=scope;
 for(const token of tokens){
  if(value===null||value===undefined)return undefined;
  if(typeof token==='number'&&Array.isArray(value)){value=value[token<0?value.length+token:token];continue;}
  if(typeof value==='object'&&!(token in value)){ // cabeçalhos não diferenciam maiúsculas de minúsculas
   const key=Object.keys(value).find(k=>k.toLowerCase()===String(token).toLowerCase());
   value=key===undefined?undefined:value[key];continue;
  }
  value=value[token];
 }
 return value;
}

/* ---------- operadores ---------- */
const typeOf=v=>Array.isArray(v)?'array':v===null?'null':typeof v;
const same=(a,b)=>{
 if(Object.is(a,b))return true;
 if(a&&b&&typeof a==='object'&&typeof b==='object')return JSON.stringify(a)===JSON.stringify(b);
 return (typeof a!=='object'&&typeof b!=='object')&&a!==undefined&&b!==undefined&&a!==null&&b!==null&&String(a)===String(b); // 200 == "200"
};
const toList=operand=>Array.isArray(operand)?operand:String(operand).split(',').map(x=>x.trim()).filter(x=>x!=='').map(x=>{try{return JSON.parse(x);}catch{return x;}});
const sizeOf=v=>typeof v==='string'||Array.isArray(v)?v.length:v&&typeof v==='object'?Object.keys(v).length:0;
const isJson=v=>{if(v&&typeof v==='object')return true;if(typeof v!=='string')return false;try{const p=JSON.parse(v);return p!==null&&typeof p==='object';}catch{return false;}};
export const OPERATORS={
 eq:(a,b)=>same(a,b),neq:(a,b)=>!same(a,b),
 gt:(a,b)=>Number(a)>Number(b),gte:(a,b)=>Number(a)>=Number(b),lt:(a,b)=>Number(a)<Number(b),lte:(a,b)=>Number(a)<=Number(b),
 in:(a,b)=>toList(b).some(x=>same(a,x)),notIn:(a,b)=>!toList(b).some(x=>same(a,x)),
 contains:(a,b)=>typeof a==='string'?a.includes(String(b)):Array.isArray(a)?a.some(x=>same(x,b)):false,
 notContains:(a,b)=>!OPERATORS.contains(a,b),
 length:(a,b)=>sizeOf(a)===Number(b),
 matches:(a,b)=>{try{return new RegExp(String(b)).test(String(a));}catch{return false;}},
 notMatches:(a,b)=>!OPERATORS.matches(a,b),
 startsWith:(a,b)=>String(a).startsWith(String(b)),endsWith:(a,b)=>String(a).endsWith(String(b)),
 between:(a,b)=>{const [lo,hi]=toList(b).map(Number);return Number(a)>=lo&&Number(a)<=hi;},
 isEmpty:a=>a===''||a===null||a===undefined||sizeOf(a)===0&&typeof a!=='number'&&typeof a!=='boolean',
 isNotEmpty:a=>!OPERATORS.isEmpty(a),
 isNull:a=>a===null,isUndefined:a=>a===undefined,isDefined:a=>a!==undefined,
 isTruthy:a=>!!a,isFalsy:a=>!a,isJson:a=>isJson(a),
 isNumber:a=>typeof a==='number',isString:a=>typeof a==='string',isBoolean:a=>typeof a==='boolean',isArray:a=>Array.isArray(a)
};
const UNARY=new Set(['isEmpty','isNotEmpty','isNull','isUndefined','isDefined','isTruthy','isFalsy','isJson','isNumber','isString','isBoolean','isArray']);

/** "eq 200" -> {op:'eq', operand:200}; operandos entre aspas, números, true/false/null e listas JSON são convertidos */
export function parseAssertion(text){
 const m=/^\s*(\w+)\s*(.*)$/.exec(String(text));
 if(!m||!(m[1] in OPERATORS))return null;
 const rest=m[2].trim();let operand=rest;
 if(rest!==''){try{operand=JSON.parse(rest);}catch{operand=/^(['"]).*\1$/.test(rest)?rest.slice(1,-1):rest;}}
 return {op:m[1],operand:UNARY.has(m[1])?undefined:operand};
}
const show=v=>{try{const s=JSON.stringify(v);return s===undefined?String(v):s.length>60?`${s.slice(0,57)}...`:s;}catch{return String(v);}};

/** entries: [{name:'res.status', value:'eq 200', enabled}] -> [{expression, assertion, passed, actual, error?}] */
export function runAssertions(entries,scope,interpolate=x=>x){
 const out=[];
 for(const entry of entries||[]){
  if(entry.enabled===false||!entry.name)continue;
  const expression=entry.name.trim(),assertion=interpolate(String(entry.value??'')).trim(),parsed=parseAssertion(assertion);
  if(!parsed){out.push({expression,assertion,passed:false,error:`invalid assertion: ${assertion}`});continue;}
  const actual=getPath(scope,expression);
  let passed=false;
  try{passed=!!OPERATORS[parsed.op](actual,parsed.operand);}catch{passed=false;}
  out.push({expression,assertion,passed,actual:show(actual),...(passed?{}:{error:`expected ${expression} (${show(actual)}) to ${parsed.op}${parsed.operand===undefined?'':` ${show(parsed.operand)}`}`})});
 }
 return out;
}

/** Valor de `vars:post-response`: caminho em `res`/`req` ou texto literal. */
export function evalValueExpression(expr,scope,interpolate=x=>x){
 const text=String(expr??'').trim();
 if(/^(res|req)(\.|\[)/.test(text)||text==='res.body'||text==='res')return getPath(scope,text);
 return interpolate(text);
}
