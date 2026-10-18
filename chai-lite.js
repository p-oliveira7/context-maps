/* Subconjunto do `expect` do Chai (o que os testes do Bruno mais usam). A função é autossuficiente: o código-fonte dela
   também é enviado ao worker do sandbox (via toString), então nada aqui pode depender de variáveis do módulo. */
export function chaiLite(){
 class AssertionError extends Error{constructor(message){super(message);this.name='AssertionError';}}
 const show=v=>{
  if(typeof v==='string')return JSON.stringify(v);
  if(typeof v==='function')return '[Function]';
  try{const s=JSON.stringify(v);return s===undefined?String(v):s.length>80?`${s.slice(0,77)}...`:s;}catch{return String(v);}
 };
 const typeOf=v=>Object.prototype.toString.call(v).slice(8,-1).toLowerCase();
 const deepEqual=(a,b)=>{
  if(Object.is(a,b))return true;
  if(typeof a!=='object'||typeof b!=='object'||a===null||b===null)return false;
  if(typeOf(a)!==typeOf(b))return false;
  if(a instanceof Date)return a.getTime()===b.getTime();
  if(a instanceof RegExp)return String(a)===String(b);
  const ka=Object.keys(a),kb=Object.keys(b);
  return ka.length===kb.length&&ka.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&deepEqual(a[k],b[k]));
 };
 const FILLERS=['to','be','been','is','that','which','and','has','have','with','at','of','same','but','does','still','also'];
 class Assertion{
  constructor(value,flags={}){this.value=value;this.flags=flags;}
  assert(passed,message,negated){
   const ok=this.flags.not?!passed:passed;
   if(!ok)throw new AssertionError(this.flags.not?negated:message);
   return this;
  }
  get not(){return new Assertion(this.value,{...this.flags,not:true});}
  get deep(){return new Assertion(this.value,{...this.flags,deep:true});}
  get own(){return new Assertion(this.value,{...this.flags,own:true});}
  get true(){return this.assert(this.value===true,`expected ${show(this.value)} to be true`,`expected ${show(this.value)} not to be true`);}
  get false(){return this.assert(this.value===false,`expected ${show(this.value)} to be false`,`expected ${show(this.value)} not to be false`);}
  get null(){return this.assert(this.value===null,`expected ${show(this.value)} to be null`,'expected value not to be null');}
  get undefined(){return this.assert(this.value===undefined,`expected ${show(this.value)} to be undefined`,'expected value not to be undefined');}
  get NaN(){return this.assert(Number.isNaN(this.value),`expected ${show(this.value)} to be NaN`,'expected value not to be NaN');}
  get ok(){return this.assert(!!this.value,`expected ${show(this.value)} to be truthy`,`expected ${show(this.value)} to be falsy`);}
  get exist(){return this.assert(this.value!==null&&this.value!==undefined,'expected value to exist','expected value not to exist');}
  get empty(){
   const v=this.value,size=typeof v==='string'||Array.isArray(v)?v.length:v&&typeof v==='object'?Object.keys(v).length:0;
   return this.assert(size===0,`expected ${show(v)} to be empty`,`expected ${show(v)} not to be empty`);
  }
  equal(expected){return this.assert(this.flags.deep?deepEqual(this.value,expected):Object.is(this.value,expected)||this.value===expected,`expected ${show(this.value)} to equal ${show(expected)}`,`expected ${show(this.value)} not to equal ${show(expected)}`);}
  eql(expected){return this.assert(deepEqual(this.value,expected),`expected ${show(this.value)} to deeply equal ${show(expected)}`,`expected ${show(this.value)} not to deeply equal ${show(expected)}`);}
  a(type){
   const names=Array.isArray(type)?type:[type],kind=typeOf(this.value);
   return this.assert(names.some(n=>String(n).toLowerCase()===kind),`expected ${show(this.value)} to be a ${names.join(' or ')} (it is ${kind})`,`expected ${show(this.value)} not to be a ${names.join(' or ')}`);
  }
  include(item){
   const v=this.value;let found;
   if(typeof v==='string')found=v.includes(String(item));
   else if(Array.isArray(v))found=this.flags.deep?v.some(x=>deepEqual(x,item)):v.includes(item);
   else if(v&&typeof v==='object'&&item&&typeof item==='object')found=Object.keys(item).every(k=>k in v&&(this.flags.deep?deepEqual(v[k],item[k]):v[k]===item[k]));
   else found=false;
   return this.assert(found,`expected ${show(v)} to include ${show(item)}`,`expected ${show(v)} not to include ${show(item)}`);
  }
  property(name,value){ // como no Chai, depois de .property(nome) o assunto passa a ser o valor da propriedade
   const v=this.value,has=v!==null&&v!==undefined&&(this.flags.own?Object.prototype.hasOwnProperty.call(Object(v),name):name in Object(v));
   if(arguments.length>1)this.assert(has&&(this.flags.deep?deepEqual(v[name],value):v[name]===value),`expected ${show(v)} to have property ${show(name)} of ${show(value)}${has?` (got ${show(v[name])})`:''}`,`expected ${show(v)} not to have property ${show(name)} of ${show(value)}`);
   else this.assert(has,`expected ${show(v)} to have property ${show(name)}`,`expected ${show(v)} not to have property ${show(name)}`);
   return new Assertion(has?v[name]:undefined,{deep:this.flags.deep});
  }
  keys(...names){
   const list=names.flat(),actual=Object.keys(this.value||{});
   return this.assert(list.every(k=>actual.includes(k))&&(this.flags.contain||actual.length===list.length),`expected ${show(actual)} to have keys ${show(list)}`,`expected ${show(actual)} not to have keys ${show(list)}`);
  }
  lengthOf(n){const len=this.value==null?undefined:this.value.length;return this.assert(len===n,`expected ${show(this.value)} to have length ${n} (got ${len})`,`expected ${show(this.value)} not to have length ${n}`);}
  above(n){return this.assert(this.value>n,`expected ${show(this.value)} to be above ${n}`,`expected ${show(this.value)} not to be above ${n}`);}
  least(n){return this.assert(this.value>=n,`expected ${show(this.value)} to be at least ${n}`,`expected ${show(this.value)} not to be at least ${n}`);}
  below(n){return this.assert(this.value<n,`expected ${show(this.value)} to be below ${n}`,`expected ${show(this.value)} not to be below ${n}`);}
  most(n){return this.assert(this.value<=n,`expected ${show(this.value)} to be at most ${n}`,`expected ${show(this.value)} not to be at most ${n}`);}
  within(a,b){return this.assert(this.value>=a&&this.value<=b,`expected ${show(this.value)} to be within ${a}..${b}`,`expected ${show(this.value)} not to be within ${a}..${b}`);}
  match(re){return this.assert(re.test(String(this.value)),`expected ${show(this.value)} to match ${re}`,`expected ${show(this.value)} not to match ${re}`);}
  oneOf(list){return this.assert(Array.isArray(list)&&list.includes(this.value),`expected ${show(this.value)} to be one of ${show(list)}`,`expected ${show(this.value)} not to be one of ${show(list)}`);}
  instanceOf(ctor){return this.assert(this.value instanceof ctor,`expected ${show(this.value)} to be an instance of ${ctor&&ctor.name}`,`expected ${show(this.value)} not to be an instance of ${ctor&&ctor.name}`);}
  throw(expected){
   let thrown,did=false;
   try{this.value();}catch(error){did=true;thrown=error;}
   const matches=!expected||(typeof expected==='string'?String(thrown?.message).includes(expected):expected instanceof RegExp?expected.test(String(thrown?.message)):thrown instanceof expected);
   return this.assert(did&&matches,'expected function to throw'+(expected?` ${expected}`:''),'expected function not to throw');
  }
 }
 for(const word of FILLERS)Object.defineProperty(Assertion.prototype,word,{get(){return this;}});
 // métodos com nomes alternativos do Chai
 const methods={equals:'equal',eq:'equal',eqls:'eql',an:'a',gt:'above',greaterThan:'above',gte:'least',lt:'below',lessThan:'below',lte:'most',length:'lengthOf',throws:'throw',Throw:'throw',instanceof:'instanceOf'};
 for(const [name,target] of Object.entries(methods)){
  if(name==='contains'||name==='includes')continue;
  Object.defineProperty(Assertion.prototype,name,{value:function(...args){return Assertion.prototype[target].apply(this,args);},configurable:true});
 }
 // `.include`/`.contain` funcionam como método (`.include('x')`) e como marcador (`.contain.keys('a')`)
 const includeMethod=Assertion.prototype.include;
 for(const name of ['include','includes','contain','contains']){
  Object.defineProperty(Assertion.prototype,name,{configurable:true,get(){
   const flagged=new Assertion(this.value,{...this.flags,contain:true}),self=this;
   return new Proxy((...args)=>includeMethod.apply(self,args),{get:(target,prop)=>{const v=flagged[prop];return typeof v==='function'?v.bind(flagged):v;}});
  }});
 }
 const expect=value=>new Assertion(value);
 return {expect,AssertionError,deepEqual};
}
