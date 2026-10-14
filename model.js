const branch=(id,title,color,items)=>({id,title,color,children:items.map((title,i)=>({id:`${id}-${i+1}`,title,children:[]}))});
export const tree={id:'root',title:'E se a cidade fosse feita para as pessoas?',children:[
 branch('mobility','Como queremos nos mover?','#c76a61',['Calçadas que convidam a caminhar','Bicicletas conectadas ao transporte público','Menos tempo no trânsito, mais tempo de vida']),
 branch('nature','Onde a natureza encontra a cidade?','#d4a458',['Uma árvore muda a experiência de uma rua','Rios vivos, margens acessíveis','Pequenos parques a poucos passos de casa']),
 branch('community','O que nos aproxima uns dos outros?','#a39acb',['Praças como salas de estar coletivas','Cultura e comércio de bairro','Espaços para todas as idades']),
 branch('future','Por onde começamos a mudança?','#d98757',['Ouvir quem já vive o lugar','Testar em uma rua antes de ampliar','Medir o que melhora a vida cotidiana'])
]};
tree.image={src:'city.svg',alt:'Cidade com árvores, caminhos e edifícios em tons verdes'};
tree.children[1].image={src:'park.svg',alt:'Parque com árvores e um caminho junto ao rio'};
tree.children[1].children[0].image={src:'park.svg',alt:'Árvores oferecendo sombra ao caminho do parque'};
export const PALETTE=['#c76a61','#d4a458','#a39acb','#d98757','#7fb59a','#6fa3d6'];
export function findNode(node,id){if(node.id===id)return node;for(const c of node.children){const f=findNode(c,id);if(f)return f;}return null;}
export function parentOf(node,id){for(const c of node.children){if(c.id===id)return node;const f=parentOf(c,id);if(f)return f;}return null;}
export function newId(){return `n-${Math.random().toString(36).slice(2,9)}`;}
export function visibleNodes(node,expanded){return [node,...(expanded.has(node.id)?node.children.flatMap(n=>visibleNodes(n,expanded)):[])];}
export function allBranches(node){return new Set([...(node.children.length?[node.id]:[]),...node.children.flatMap(n=>[...allBranches(n)])]);}
export function zoomAt(camera,factor,p){const scale=Math.max(0.15,Math.min(2.5,camera.scale*factor));return {scale,x:p.x-(p.x-camera.x)*scale/camera.scale,y:p.y-(p.y-camera.y)*scale/camera.scale};}
