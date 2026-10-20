// Exportação de apresentações como HTML único (visualizador somente leitura, imagens embutidas).
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const MIME={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml'};
const MODULES=['version.js','i18n.js','model.js','motion.js','store.js','chai-lite.js','assertions.js','pipeline.js','curl.js','runner.js','run-report.js','response-view.js','sandbox.js','var-field.js','api-client.js','api-dropdown.js','sequence.js','sequence-edit.js','sequence-editor.js','app.js']; // ordem de dependência
const escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const inlineJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replaceAll(String.fromCharCode(0x2028),'\\u2028').replaceAll(String.fromCharCode(0x2029),'\\u2029'); // seguro dentro de <script>

const flatten=roots=>{const out=[];const walk=n=>{out.push(n);n.children.forEach(walk);};roots.forEach(walk);return out;};

/* HTML único: o próprio app (CSS + módulos) e os dados da apresentação num arquivo só, que abre offline em qualquer navegador. */
export async function buildHtml({doc,appRoot,readAsset}){
 const read=name=>readFile(path.join(appRoot,name),'utf8');
 const copy=structuredClone(doc);
 const cache=new Map();
 for(const node of flatten(copy.roots)){
  if(node.image){node.images=[...(node.images||[]),node.image];delete node.image;}
  for(const m of node.images||[]){
   if(typeof m.src!=='string'||m.src.startsWith('data:'))continue;
   if(!cache.has(m.src)){
    const bytes=await readAsset(m.src).catch(()=>null),type=MIME[path.extname(m.src.split('?')[0]).toLowerCase()];
    cache.set(m.src,bytes&&type?`data:${type};base64,${bytes.toString('base64')}`:null);
   }
   const data=cache.get(m.src);if(data)m.src=data;
  }
 }
 delete copy.id; // somente leitura: sem id o app não tenta salvar
 const sources={};
 for(const name of MODULES)sources[name]=await read(name);
 const loader=`const mods=JSON.parse(document.getElementById('cm-modules').textContent),urls={};
for(const name of ${JSON.stringify(MODULES)}){
 const code=mods[name].replace(/from\\s+'\\.\\/([\\w.-]+?)(?:\\?[^']*)?'/g,(m,file)=>"from '"+urls[file]+"'");
 urls[name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
}
import(urls['app.js']);`;
 let html=await read('index.html');
 const swap=(pattern,replacement)=>{if(!pattern.test(html))throw new Error(`index.html mudou: ${pattern}`);html=html.replace(pattern,()=>replacement);};
 swap(/<link rel="stylesheet" href="styles\.css[^"]*">/,`<style>\n${(await read('styles.css')).replace(/<\/style/gi,'<\\/style')}\n</style>`);
 swap(/<script type="module" src="app\.js[^"]*"><\/script>/,`<script type="application/json" id="cm-doc">${inlineJson(copy)}</script>\n<script type="application/json" id="cm-modules">${inlineJson(sources)}</script>\n<script type="module">${loader}</script>`);
 swap(/<img src="city\.svg" alt="">/,'<img alt="">');
 swap(/<title>[^<]*<\/title>/,`<title>${escapeHtml(copy.title||'Context Maps')} · Context Maps</title>`);
 return html;
}
