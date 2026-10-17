import {lang} from './i18n.js?v=1';
// Cliente da API local de apresentações. `available()` é falso em servidores estáticos (sem server.mjs).
// Toda requisição que altera algo leva o cabeçalho x-context-maps: o servidor recusa pedidos vindos de outras páginas.
const json=async(url,options={})=>{
 const res=await fetch(url,{...options,headers:{'x-context-maps':'1','x-lang':lang,...(options.headers||{})}});
 if(!res.ok){let message=`${res.status}`;try{message=(await res.json()).error||message;}catch{}throw Object.assign(new Error(message),{status:res.status});}
 return res.json();
};
const base='api/presentations';
const jsonBody=data=>({headers:{'content-type':'application/json'},body:JSON.stringify(data)});
export async function available(){
 try{const res=await fetch(base,{headers:{accept:'application/json'}});return res.ok&&(res.headers.get('content-type')||'').includes('json');}catch{return false;}
}
export const list=()=>json(base);
export const load=id=>json(`${base}/${id}`);
export const create=(title,dir)=>json(base,{method:'POST',...jsonBody({title,dir})});
export const copy=(id,title,dir)=>json(`${base}/${id}/copy`,{method:'POST',...jsonBody({title,dir})});
export const save=doc=>json(`${base}/${doc.id}`,{method:'PUT',...jsonBody({title:doc.title,roots:doc.roots}),keepalive:true});
export const remove=id=>json(`${base}/${id}`,{method:'DELETE'});
export const libraries=()=>json('api/libraries');
export const addLibrary=dir=>json('api/libraries',{method:'POST',...jsonBody({dir})});
export const removeLibrary=key=>json(`api/libraries/${key}`,{method:'DELETE'});
export const pickFolder=()=>json('api/pick-folder',{method:'POST'});
export async function upload(id,file){
 const {src}=await json(`${base}/${id}/assets?name=${encodeURIComponent(file.name)}`,{method:'POST',body:file});
 return src;
}
