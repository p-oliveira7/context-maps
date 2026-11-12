// Fontes leves para as miniaturas SVG que o Excalidraw exporta. O SVG vem com @font-face apontando para arquivos que
// um <img> não carrega e com font-family="Virgil, Segoe UI Emoji": sem a Virgil, o navegador cai na fonte de emoji
// colorida, cara de redesenhar — a cada passo do zoom do mapa a miniatura levava 140–300 ms (com estas pilhas, ~17 ms).
// Usado pelo app (miniaturas novas), pelo servidor (as já salvas, ao servir) e pela exportação em HTML.
const STACKS={
 Virgil:"Virgil, 'Segoe Print', 'Comic Sans MS', sans-serif",
 Cascadia:"Cascadia, Consolas, 'Courier New', monospace",
 Helvetica:'Helvetica, Arial, sans-serif',
 Assistant:"Assistant, 'Segoe UI', Arial, sans-serif"
};
/** SVG do Excalidraw → sem @font-face e com pilhas de fonte leves; qualquer outro SVG volta igual */
export function lightSvgFonts(svg){
 if(!/class="style-fonts"|Segoe UI Emoji/.test(svg))return svg;
 return svg.replace(/<style class="style-fonts">[\s\S]*?<\/style>/g,'')
  .replace(/font-family="([^"]*)"/g,(m,list)=>{const first=list.split(',')[0].trim().replace(/['"]/g,'');return `font-family="${STACKS[first]||`${first}, sans-serif`}"`;});
}
