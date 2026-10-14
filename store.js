// Cliente da API local de apresentações. `available()` é falso em servidores estáticos (sem server.mjs).
const json=async(url,options)=>{
 const res=await fetch(url,options);
 if(!res.ok)throw new Error(`${res.status}`);
 return res.json();
};
const base='api/presentations';
export async function available(){
 try{const res=await fetch(base,{headers:{accept:'application/json'}});return res.ok&&(res.headers.get('content-type')||'').includes('json');}catch{return false;}
}
export const list=()=>json(base);
export const load=id=>json(`${base}/${id}`);
export const create=title=>json(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});
export const save=doc=>json(`${base}/${doc.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({tree:doc.tree}),keepalive:true});
export const remove=id=>json(`${base}/${id}`,{method:'DELETE'});
export async function upload(id,file){
 const {src}=await json(`${base}/${id}/assets?name=${encodeURIComponent(file.name)}`,{method:'POST',body:file});
 return src;
}
