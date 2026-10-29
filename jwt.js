/* Tokens JWT: reconhece um token em qualquer valor (variável, corpo ou cabeçalho da resposta, "Bearer …") e abre um painel
   com cabeçalho, payload e as datas legíveis (exp, iat, nbf), como o jwt.io. Só decodifica: a assinatura não é verificada. */

const PART=/^[A-Za-z0-9_-]+$/;
function decodePart(part){
 try{
  const b64=part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=');
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
 }catch{return undefined;}
}
/** o token contido no valor (aceita "Bearer <token>"), ou null */
export function findJwt(text){
 const s=String(text??'').trim().replace(/^Bearer\s+/i,'');
 if(s.length<20||s.length>16384)return null;
 const parts=s.split('.');
 if(parts.length!==3||!PART.test(parts[0])||!PART.test(parts[1])||(parts[2]&&!PART.test(parts[2])))return null;
 const header=decodePart(parts[0]),payload=decodePart(parts[1]);
 if(!header||typeof header!=='object'||Array.isArray(header)||!header.alg||!payload||typeof payload!=='object')return null;
 return s;
}
const TIME_CLAIMS=['exp','iat','nbf','auth_time'];
/** {header,payload,signature,times:{exp,iat,nbf,auth_time:Date}} */
export function decodeJwt(token){
 const [h,p,sig]=token.split('.'),header=decodePart(h),payload=decodePart(p),times={};
 for(const k of TIME_CLAIMS)if(Number.isFinite(payload?.[k]))times[k]=new Date(payload[k]*1000);
 return {header,payload,signature:sig||'',times};
}
/** situação do token agora: {state:'valid'|'expired'|'notYet'|'noExp', ms} */
export function jwtStatus(times,now=Date.now()){
 if(times.nbf&&times.nbf.getTime()>now)return {state:'notYet',ms:times.nbf.getTime()-now};
 if(!times.exp)return {state:'noExp',ms:0};
 const ms=times.exp.getTime()-now;
 return {state:ms>0?'valid':'expired',ms:Math.abs(ms)};
}
function relative(ms,lang){
 const rtf=new Intl.RelativeTimeFormat(lang,{numeric:'auto'}),s=Math.round(ms/1000);
 const steps=[['day',86400],['hour',3600],['minute',60],['second',1]];
 for(const [unit,size] of steps)if(Math.abs(s)>=size||unit==='second')return rtf.format(Math.round(s/size),unit);
 return '';
}

/* ---------- painel ---------- */
let open=null;
const node=(tag,props={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==null&&v!==undefined&&v!==false)e.setAttribute(k,v===true?'':v);}e.append(...kids.flat().filter(x=>x!==null&&x!==undefined&&x!==false));return e;};
function jsonBlock(value){
 const pre=node('pre',{class:'jwt-json'});
 const text=JSON.stringify(value,null,2);
 // cores simples: chave, string, número/booleano
 const re=/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;let last=0,m;
 while((m=re.exec(text))){
  if(m.index>last)pre.append(text.slice(last,m.index));
  const cls=m[1]?(m[2]?'jwt-k':'jwt-s'):m[3]?'jwt-b':'jwt-n';
  pre.append(node('span',{class:cls},m[1]||m[0]));if(m[2])pre.append(m[2]);
  last=re.lastIndex;
 }
 pre.append(text.slice(last));
 return pre;
}
/** abre o painel do token; `t` são os textos do app e `lang` o idioma das datas */
export function openJwtViewer({token,t,lang='en',source=''}){
 open?.close();
 const {header,payload,signature,times}=decodeJwt(token),status=jwtStatus(times);
 const fmt=d=>d.toLocaleString(lang,{dateStyle:'medium',timeStyle:'medium'});
 const statusText=status.state==='valid'?t('jwtValid',relative(status.ms,lang),fmt(times.exp)):status.state==='expired'?t('jwtExpired',relative(-status.ms,lang),fmt(times.exp)):status.state==='notYet'?t('jwtNotYet',relative(status.ms,lang)):t('jwtNoExp');
 const claims=[['sub',payload.sub],['iss',payload.iss],['aud',Array.isArray(payload.aud)?payload.aud.join(', '):payload.aud],...TIME_CLAIMS.filter(k=>times[k]).map(k=>[k,`${fmt(times[k])} (${relative(times[k].getTime()-Date.now(),lang)})`]),['scope',payload.scope??payload.scp],['roles',Array.isArray(payload.roles)?payload.roles.join(', '):payload.roles],['jti',payload.jti]].filter(([,v])=>v!==undefined&&v!==null&&v!=='');
 const copy=async(text,btn)=>{try{await navigator.clipboard.writeText(text);const old=btn.textContent;btn.textContent=t('jwtCopied');setTimeout(()=>{btn.textContent=old;},1200);}catch{}};
 const close=()=>{window.removeEventListener('keydown',onKey,true);overlay.remove();if(open===handle)open=null;back?.focus?.({preventScroll:true});};
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}};
 const back=document.activeElement;
 const copyToken=node('button',{type:'button',class:'jwt-btn'},t('jwtCopyToken'));copyToken.addEventListener('click',()=>copy(token,copyToken));
 const copyPayload=node('button',{type:'button',class:'jwt-btn'},t('jwtCopyPayload'));copyPayload.addEventListener('click',()=>copy(JSON.stringify(payload,null,2),copyPayload));
 const [p1,p2]=token.split('.');
 const card=node('div',{class:'jwt-card',role:'dialog','aria-modal':'true','aria-labelledby':'jwt-title'},
  node('header',{class:'jwt-head'},node('h3',{id:'jwt-title'},t('jwtTitle')),source?node('span',{class:'jwt-source'},source):null,node('button',{type:'button',class:'jwt-close','aria-label':t('close'),onclick:close},'×')),
  node('p',{class:`jwt-status is-${status.state}`,role:'status'},statusText),
  node('p',{class:'jwt-token'},node('span',{class:'jwt-t1'},p1),'.',node('span',{class:'jwt-t2'},p2),'.',node('span',{class:'jwt-t3'},signature)),
  claims.length?node('dl',{class:'jwt-claims'},...claims.flatMap(([k,v])=>[node('dt',{},k),node('dd',{},String(v))])):null,
  node('div',{class:'jwt-cols'},
   node('section',{},node('h4',{},t('jwtHeader'),node('span',{class:'jwt-alg'},header.alg||'')),jsonBlock(header)),
   node('section',{},node('h4',{},t('jwtPayload')),jsonBlock(payload))),
  node('p',{class:'jwt-note'},t('jwtNotVerified')),
  node('footer',{class:'jwt-foot'},copyToken,copyPayload));
 const overlay=node('div',{class:'jwt-overlay',onclick:e=>{if(e.target===overlay)close();}},card);
 window.addEventListener('keydown',onKey,true); // na janela: vem antes de outros painéis (ex.: o editor de ambientes) e só fecha o token
 document.body.append(overlay);card.querySelector('.jwt-close').focus();
 const handle={close};open=handle;
 return handle;
}
/** botão "JWT" para ficar ao lado de um valor, ou null se o valor não for um token */
export function jwtButton(value,{t,lang,source=''}){
 const token=findJwt(value);if(!token)return null;
 const b=document.createElement('button');b.type='button';b.className='jwt-chip';b.textContent='JWT';
 b.title=t('jwtOpen');b.setAttribute('aria-label',source?`${t('jwtOpen')}: ${source}`:t('jwtOpen'));
 b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openJwtViewer({token,t,lang,source});});
 return b;
}
