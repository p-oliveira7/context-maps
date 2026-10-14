const branch=(id,title,color,items)=>({id,title,color,children:items.map((title,i)=>({id:`${id}-${i+1}`,title,children:[]}))});
export const tree={id:'root',title:'E se a cidade fosse feita para as pessoas?',children:[
 branch('mobility','Como queremos nos mover?','#c76a61',['Calçadas que convidam a caminhar','Bicicletas conectadas ao transporte público','Menos tempo no trânsito, mais tempo de vida']),
 branch('nature','Onde a natureza encontra a cidade?','#d4a458',['Uma árvore muda a experiência de uma rua','Rios vivos, margens acessíveis','Pequenos parques a poucos passos de casa']),
 branch('community','O que nos aproxima uns dos outros?','#a39acb',['Praças como salas de estar coletivas','Cultura e comércio de bairro','Espaços para todas as idades']),
 branch('future','Por onde começamos a mudança?','#d98757',['Ouvir quem já vive o lugar','Testar em uma rua antes de ampliar','Medir o que melhora a vida cotidiana'])
]};
export function visibleNodes(node,expanded){return [node,...(expanded.has(node.id)?node.children.flatMap(n=>visibleNodes(n,expanded)):[])];}
export function allBranches(node){return new Set([...(node.children.length?[node.id]:[]),...node.children.flatMap(n=>[...allBranches(n)])]);}
export function zoomAt(camera,factor,p){const scale=Math.max(0.15,Math.min(2.5,camera.scale*factor));return {scale,x:p.x-(p.x-camera.x)*scale/camera.scale,y:p.y-(p.y-camera.y)*scale/camera.scale};}
