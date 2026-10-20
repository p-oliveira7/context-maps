/* cURL <-> request do cliente de API, sem DOM e testável em Node:
   parseCurl lê um comando colado (o "Copy as cURL" dos navegadores e o das documentações), toCurl e toFetch geram texto para copiar. */

/* ---------- leitura do comando ---------- */
const ANSI_ESCAPES={n:'\n',t:'\t',r:'\r','\\':'\\',"'":"'",'"':'"'};
/** Divide como um shell (aspas simples e duplas, $'…', barra invertida e continuação de linha com \). */
export function tokenize(text){
 const src=String(text).replace(/\\\r?\n/g,' ').trim(),tokens=[];
 let cur='',has=false,i=0;
 const push=()=>{if(has)tokens.push(cur);cur='';has=false;};
 while(i<src.length){
  const ch=src[i];
  if(/\s/.test(ch)){push();i++;continue;}
  has=true;
  if(ch==="'"){const end=src.indexOf("'",i+1);cur+=src.slice(i+1,end<0?src.length:end);i=end<0?src.length:end+1;continue;}
  if(ch==='$'&&src[i+1]==="'"){ // $'…': aceita \n, \t, \', \\ e \uXXXX
   i+=2;
   while(i<src.length&&src[i]!=="'"){
    if(src[i]==='\\'){
     const next=src[i+1];
     if(next==='u'&&/^[0-9a-fA-F]{4}$/.test(src.slice(i+2,i+6))){cur+=String.fromCharCode(parseInt(src.slice(i+2,i+6),16));i+=6;continue;}
     if(next==='x'&&/^[0-9a-fA-F]{2}$/.test(src.slice(i+2,i+4))){cur+=String.fromCharCode(parseInt(src.slice(i+2,i+4),16));i+=4;continue;}
     cur+=ANSI_ESCAPES[next]??next;i+=2;continue;
    }
    cur+=src[i++];
   }
   i++;continue;
  }
  if(ch==='"'){
   i++;
   while(i<src.length&&src[i]!=='"'){if(src[i]==='\\'&&/["\\$`]/.test(src[i+1]||'')){cur+=src[i+1];i+=2;}else cur+=src[i++];}
   i++;continue;
  }
  if(ch==='\\'&&i+1<src.length){cur+=src[i+1];i+=2;continue;}
  cur+=ch;i++;
 }
 push();
 return tokens;
}

const DATA_FLAGS=new Set(['-d','--data','--data-raw','--data-binary','--data-ascii','--data-urlencode']);
const IGNORED_WITH_VALUE=new Set(['-o','--output','-m','--max-time','--connect-timeout','--retry','-w','--write-out','-x','--proxy','--cacert','--cert','--key','-T','--upload-file','-K','--config']);
const headerOf=(headers,name)=>headers.find(h=>h.name.toLowerCase()===name.toLowerCase());
const BODY_TYPES=[[/json/i,'json'],[/xml/i,'xml'],[/x-www-form-urlencoded/i,'formUrlEncoded'],[/text\//i,'text']];

/** Texto de um comando curl -> modelo de request ({method,url,headers,bodyMode,body,formUrlEncoded,authMode,basic}) ou null se não for curl. */
export function parseCurl(text){
 const tokens=tokenize(text);
 if(!tokens.length||!/^curl(\.exe)?$/i.test(tokens[0]))return null;
 const headers=[],data=[];let method='',url='',user='',get=false,head=false,json=false,multipart=false;
 for(let i=1;i<tokens.length;i++){
  const tok=tokens[i];let flag=tok,value;
  if(tok.startsWith('--')&&tok.includes('=')){flag=tok.slice(0,tok.indexOf('='));value=tok.slice(tok.indexOf('=')+1);}
  else if(/^-[A-Za-z]./.test(tok)&&!tok.startsWith('--')&&/^-[XHduFAebmoxwTK]/.test(tok)){flag=tok.slice(0,2);value=tok.slice(2);} // -XPOST, -H'a: b'
  const next=()=>value!==undefined?value:tokens[++i];
  if(flag==='-X'||flag==='--request')method=String(next()||'').toUpperCase();
  else if(flag==='-H'||flag==='--header'){
   const raw=String(next()||''),at=raw.indexOf(':');
   if(at>0)headers.push({name:raw.slice(0,at).trim(),value:raw.slice(at+1).trim(),enabled:true});
  }
  else if(DATA_FLAGS.has(flag)){const v=String(next()??'');data.push(flag==='--data-urlencode'&&/^[^=@]*=/.test(v)?v.replace(/^([^=]*)=(.*)$/s,(m,k,val)=>`${k?`${k}=`:''}${encodeURIComponent(val)}`):v);}
  else if(flag==='--json'){json=true;data.push(String(next()??''));}
  else if(flag==='-u'||flag==='--user')user=String(next()||'');
  else if(flag==='-F'||flag==='--form'){multipart=true;next();}
  else if(flag==='-G'||flag==='--get')get=true;
  else if(flag==='-I'||flag==='--head')head=true;
  else if(flag==='-b'||flag==='--cookie')headers.push({name:'Cookie',value:String(next()||''),enabled:true});
  else if(flag==='-A'||flag==='--user-agent')headers.push({name:'User-Agent',value:String(next()||''),enabled:true});
  else if(flag==='-e'||flag==='--referer')headers.push({name:'Referer',value:String(next()||''),enabled:true});
  else if(flag==='--url')url=String(next()||'');
  else if(IGNORED_WITH_VALUE.has(flag))next();
  else if(tok.startsWith('-'))continue; // -s, -k, -L, --compressed…: não mudam o request
  else if(!url)url=tok;
 }
 if(!url)return null;
 let body=data.join(json||data.some(d=>/^\s*[\[{]/.test(d))?'':'&');
 if(get&&body){url+=`${url.includes('?')?'&':'?'}${body}`;body='';}
 if(!method)method=head?'HEAD':body||multipart?'POST':'GET';
 if(json){if(!headerOf(headers,'content-type'))headers.push({name:'Content-Type',value:'application/json',enabled:true});if(!headerOf(headers,'accept'))headers.push({name:'Accept',value:'application/json',enabled:true});}
 const model={method:method.toLowerCase(),url,headers,bodyMode:'none',authMode:'none'};
 if(user){const at=user.indexOf(':');model.authMode='basic';model.basic={username:at<0?user:user.slice(0,at),password:at<0?'':user.slice(at+1)};}
 if(body){
  const type=headerOf(headers,'content-type')?.value||'';
  let mode=BODY_TYPES.find(([re])=>re.test(type))?.[1];
  if(!mode)mode=/^\s*[\[{]/.test(body)?'json':/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body)?'formUrlEncoded':'text';
  model.bodyMode=mode;
  if(mode==='formUrlEncoded')model.formUrlEncoded=body.split('&').filter(Boolean).map(pair=>{const at=pair.indexOf('=');const dec=s=>{try{return decodeURIComponent(s.replace(/\+/g,' '));}catch{return s;}};return at<0?{name:dec(pair),value:'',enabled:true}:{name:dec(pair.slice(0,at)),value:dec(pair.slice(at+1)),enabled:true};});
  else model.body={[mode]:body};
  if(mode!=='formUrlEncoded'&&mode!=='json'&&!model.body)model.body={text:body};
 }
 if(multipart)model.notes=['multipart'];
 return model;
}

/* ---------- geração de texto ---------- */
const shq=s=>`'${String(s).replace(/'/g,`'\\''`)}'`;
/** req: {method,url,headers:[{name,value}],body} já com as {{variáveis}} resolvidas. */
export function toCurl(req){
 const parts=['curl'];
 const method=String(req.method||'GET').toUpperCase();
 if(method==='HEAD')parts.push('-I');else if(method!=='GET'||req.body)parts.push('-X',method);
 parts.push(shq(req.url));
 for(const h of req.headers||[])parts.push('-H',shq(`${h.name}: ${h.value}`));
 if(req.body)parts.push('--data-raw',shq(req.body));
 return parts.join(' ').replace(/ -H /g,' \\\n  -H ').replace(/ --data-raw /,' \\\n  --data-raw ');
}
export function toFetch(req){
 const method=String(req.method||'GET').toUpperCase(),opts=[];
 if(method!=='GET')opts.push(`  method: ${JSON.stringify(method)}`);
 if((req.headers||[]).length)opts.push(`  headers: ${JSON.stringify(Object.fromEntries(req.headers.map(h=>[h.name,h.value])),null,4).replace(/\n/g,'\n  ')}`);
 if(req.body){
  let pretty=null;try{pretty=JSON.stringify(JSON.parse(req.body),null,4);}catch{}
  opts.push(`  body: ${pretty?`JSON.stringify(${pretty.replace(/\n/g,'\n  ')})`:JSON.stringify(req.body)}`);
 }
 return `fetch(${JSON.stringify(req.url)}${opts.length?`, {\n${opts.join(',\n')}\n}`:''});`;
}
