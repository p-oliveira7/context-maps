// Gera a apresentação de exemplo em inglês (presentations/cities-for-people.json + assets) a partir da versão em português.
// Os diagramas Mermaid são renderizados de novo, em inglês, com o Mermaid que acompanha o app.
// Uso: PLAYWRIGHT_MODULE=file:///caminho/playwright-core/index.mjs node docs/build-example-en.mjs
import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {launch}=await import(pathToFileURL(path.join(root,'tests','launch.mjs')).href);
const SRC='cidades-para-pessoas',DST='cities-for-people';

const FLOW='flowchart LR\n    A["Idea"] --> B{"Has details?"}\n    B -->|Yes| C["Add children"]\n    B -->|No| D["Leave as a leaf"]\n    C --> E["Images, links and diagrams"]\n    D --> E\n';
const SEQUENCE='sequenceDiagram\n    actor U as Person\n    participant M as Map\n    participant S as Local server\n    U->>M: Edits a card\n    M->>S: Saves (autosave)\n    S-->>M: Saved\n    M-->>U: "Saved" status\n';
// id -> textos em inglês (título, subtítulo, alt das imagens, rótulos de links)
const T={
 root:{title:'What if the city were made for people?',subtitle:'Context Maps example map. Hover the cards to see subtitles and turn on “Edit” to try things out.',alt:['City with trees, paths and buildings in shades of green']},
 'n-698bbbf7':{title:'How do we want to move?',subtitle:'Subtitles appear inside the card, only while hovering it.'},
 'n-3757b41b':{title:'Sidewalks that invite walking'},
 'n-dd90769e':{title:'Bikes connected to public transport',links:[{url:'https://en.wikipedia.org/wiki/Sustainable_transport',label:'Sustainable transport'}]},
 'n-8b602422':{title:'Less time in traffic, more time for life'},
 'n-fc880937':{title:'Where does nature meet the city?',alt:['Park with trees and a path by the river']},
 'n-3ad4fa86':{title:'A tree changes the experience of a street',alt:['Trees shading the park path']},
 'n-6c17fc19':{title:'Living rivers, accessible banks'},
 'n-b9ba3f40':{title:'Small parks a few steps from home'},
 'n-adf4a795':{title:'What brings us closer together?'},
 'n-b57955cb':{title:'Squares as shared living rooms'},
 'n-ab2027f0':{title:'Neighbourhood culture and shops'},
 'n-eed132f9':{title:'Spaces for all ages'},
 'n-4e384b53':{title:'Where do we start the change?'},
 'n-718b86f6':{title:'Listen to those who already live there'},
 'n-ad98f159':{title:'Test on one street before scaling up'},
 'n-c5a2c4a2':{title:'Measure what improves daily life'},
 'n-b2332e76':{title:'Resource guide',subtitle:'Each branch shows a Context Maps feature. Open the branches and try them in Edit mode.'},
 'n-39d8103b':{title:'Subtitle on hover',subtitle:'This supporting text stays hidden and only shows here, inside the card, while the mouse is over it.'},
 'n-2c168956':{title:'Images'},
 'n-385e600c':{title:'One image',alt:['Park with trees and a river']},
 'n-bdb5e1ef':{title:'Several images in the same card',alt:['City','Park']},
 'n-25e7e3a9':{title:'Image and diagram together',alt:['Park','Diagram: Image and diagram together'],diagram:FLOW},
 'n-17d7ee48':{title:'Mermaid diagrams'},
 'n-9405322f':{title:'Flowchart',alt:['Diagram: Flowchart'],diagram:FLOW},
 'n-6086cc1a':{title:'Sequence diagram',alt:['Diagram: Sequence diagram'],diagram:SEQUENCE},
 'n-6f1c2e34':{title:'Links'},
 'n-80c24a3a':{title:'One link opens directly in a new tab'},
 'n-b2e28240':{title:'Several links open a list'},
 'n-09389b3e':{title:'Untitled cards'},
 'n-74ee0255':{alt:['Image only, no title']},
 'n-eed7e157':{subtitle:'Secondary text only: without a title, the subtitle is always visible.'},
 'n-43625c68':{alt:['Diagram: '],diagram:FLOW},
 'n-b271cf99':{title:'Line colours'},
 'n-40d75ffe':{title:'Only this card’s lines'},
 'n-3256c3da':{title:'Child with a subtitle',subtitle:'The lines leaving the card above have another colour; this child and the lines arriving at it do not change.'},
 'n-06274574':{title:'Another child'},
 'n-b2539bbc':{title:'The whole branch'},
 'n-068f267a':{title:'Grandchild A'},'n-bdabfe6b':{title:'Great-grandchild 1'},'n-7ec47fdb':{title:'Great-grandchild 2'},'n-a8f41d08':{title:'Grandchild B'},
 'n-9d6124cb':{title:'Another starting point',subtitle:'An independent root card: drag it by the handle to position it or drop it on another card to connect.'},
 'n-89333ed2':{title:'Several root cards'},
 'n-11f89d67':{title:'Each root has its own tree and a free position on the map'},
 'n-ed9b3ac1':{title:'No overlap'},
 'n-7d5880ee':{title:'When branches open, the trees move apart and return when collapsed'}
};
const doc=JSON.parse(await readFile(path.join(root,'presentations',`${SRC}.json`),'utf8'));
const out=path.join(root,'presentations',DST),assets=path.join(out,'assets');
await rm(out,{recursive:true,force:true});await mkdir(assets,{recursive:true});

// diagramas: renderiza em inglês com o Mermaid do app
const browser=await launch();
const page=await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.addScriptTag({path:path.join(root,'vendor','mermaid.min.js')});
const render=source=>page.evaluate(async source=>{
 const g=window.__esbuild_esm_mermaid_nm?.mermaid,m=window.mermaid||g?.default||g;
 m.initialize({startOnLoad:false,theme:'dark',securityLevel:'strict'});
 const {svg}=await m.render(`d${Math.random().toString(36).slice(2)}`,source);
 const box=svg.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/);
 return box?svg.replace(/(<svg[^>]*?) width="100%"/,`$1 width="${Math.ceil(box[1])}" height="${Math.ceil(box[2])}"`):svg;
},source);

let diagramCount=0;
const walk=async node=>{
 const t=T[node.id]||{};
 if(t.title!==undefined)node.title=t.title;
 if(t.subtitle!==undefined)node.subtitle=t.subtitle;
 if(t.links)node.links=t.links;
 (node.images||[]).forEach((img,i)=>{if(t.alt?.[i]!==undefined)img.alt=t.alt[i];});
 for(const img of node.images||[]){
  const file=img.src.split('/').pop();
  if(img.kind==='diagram'){
   const source=t.diagram||FLOW,name=`d-${++diagramCount}.svg`;
   await writeFile(path.join(assets,name),await render(source));
   img.src=`presentations/${DST}/assets/${name}`;img.source=source;
  }else{
   await cp(path.join(root,'presentations',SRC,'assets',file),path.join(assets,file));
   img.src=`presentations/${DST}/assets/${file}`;
  }
 }
 for(const child of node.children)await walk(child);
};
for(const r of doc.roots)await walk(r);
doc.id=DST;doc.title=T.root.title;

// recursos novos no guia: ideias relacionadas e o cliente de API
const guide=doc.roots.find(r=>r.id==='n-b2332e76');
guide.children.push(
 {id:'n-rel-0001',title:'Related ideas',color:'#6fa3d6',children:[
  {id:'n-rel-a',title:'Cards can point to each other',subtitle:'Use Relate in the card’s wheel: a dotted line joins the two cards and the badge jumps to the other one.',related:['n-rel-b'],children:[]},
  {id:'n-rel-b',title:'Even across branches',children:[]}]},
 {id:'n-api-0001',title:'API client',color:'#c76a61',children:[
  {id:'n-api-a',title:'Attach a collection, folder or request',subtitle:'Drag one from the API panel onto a card in Edit mode; click the tile to open the client right there.',
   apis:[{collection:'context-maps-api',path:'presentations',name:'Presentations',snapshot:{count:4,requests:[{name:'List presentations',method:'get'},{name:'Get a presentation',method:'get'},{name:'Create a presentation',method:'post'},{name:'Export as HTML',method:'get'}]}}],children:[]}]}
);
await writeFile(path.join(root,'presentations',`${DST}.json`),`${JSON.stringify(doc,null,2)}\n`);
await browser.close();
console.log(`Gerado presentations/${DST}.json com ${diagramCount} diagramas`);
