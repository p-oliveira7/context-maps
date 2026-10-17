// Idioma da interface: inglês ou português (BR), conforme o idioma do navegador do usuário.
// `?lang=en|pt` força um idioma (e fica guardado no navegador). Sem preferência de português, usa inglês.
const pick=value=>{const v=String(value||'').toLowerCase();return v.startsWith('pt')?'pt':v.startsWith('en')?'en':null;};
function detect(){
 try{
  const asked=pick(new URLSearchParams(location.search).get('lang'));
  if(asked){try{localStorage.setItem('context-maps-lang',asked);}catch{}return asked;}
  const saved=pick(localStorage.getItem('context-maps-lang'));if(saved)return saved;
 }catch{}
 for(const l of navigator.languages?.length?navigator.languages:[navigator.language]){const p=pick(l);if(p)return p;}
 return 'en';
}
export const lang=detect();

const plural=(n,one,many)=>n===1?one:many;
const dict={
 en:{
  pageTitle:'Context Maps',viewport:'Interactive map: drag the background to navigate',
  docNew:'+ New presentation',docAddFolder:'Add folder…',docSaveAs:'Save as…',docCopy:'Save a copy…',docDelete:'Delete this presentation',exportHtml:'Export as HTML…',exportZip:'Export as ZIP…',importFile:'Import…',imported:t=>`Imported “${t}”`,importError:'Could not import the file.',
  undo:'Undo',treeLabel:'Ideas',wentTo:n=>`Went to ${n}`,relate:'Relate',relateIdea:'Relate this idea to another',relateHint:n=>`Click the idea to relate to “${n}” (click it again later to remove) · Esc cancels`,related:n=>`${n} related`,relatedList:'Related ideas',relatedOf:n=>`Related ideas: ${n}`,relatedAdded:(a,b)=>`“${a}” ↔ “${b}”`,relatedRemoved:(a,b)=>`“${a}” ↮ “${b}”`,goTo:n=>`Go to: ${n}`,search:'Search',searchTitle:'Search ideas (Ctrl+K)',searchPlaceholder:'Search ideas…',searchEmpty:'No ideas found',searchResults:n=>`${n} results`,duplicate:'Duplicate',copy:'Copy',paste:'Paste',duplicateIdea:'Duplicate idea (with everything below)',copyIdea:'Copy idea (with everything below)',pasteIdea:'Paste the copied idea as a child',copied:n=>`“${n}” copied`,pasted:n=>`“${n}” pasted`,redo:'Redo',undoTitle:'Undo (Ctrl+Z)',redoTitle:'Redo (Ctrl+Shift+Z)',zoomOut:'Zoom out',zoomIn:'Zoom in',fit:'Fit map',toolbar:'Map controls',edit:'Edit',
  addRootLabel:'Add root card',addRootTitle:'Add a new root card (independent starting point)',rootCard:'Root card',
  expandAll:'Expand all',collapseAll:'Collapse all',fullscreen:'Full screen',exitFullscreen:'Exit full screen',textMode:'Text mode',mindMap:'Mind map',
  lightbox:'Enlarged image',closeImage:'Close image',prevImage:'Previous image',nextImage:'Next image',close:'Close',
  saveAs:'Save as',saveCopy:'Save a copy',presName:'Presentation name',folder:'Folder',folderPath:'Folder path',
  pathPlaceholder:'Full path, e.g. C:\\Users\\you\\Documents\\maps',choose:'Choose…',
  openNew:'Open the new presentation',stayHere:'Keep working on this presentation',cancel:'Cancel',save:'Save',
  diagramTitle:'Diagram (Mermaid)',closeDiagram:'Close diagram editor',mermaidCode:'Mermaid code',apply:'Apply',
  untitled:'untitled idea',newIdea:'New idea',newRoot:'New root card',newPres:'New presentation',
  enlargeIllustration:'Enlarge illustration',enlargeImage:(n,s)=>`Enlarge image: ${n}${s}`,
  viewImages:(c,n)=>`View ${c} images: ${n}`,viewImage:n=>`View image: ${n}`,viewImagesTitle:'View images',viewImageTitle:'View image',
  editDiagram:(n,s)=>`Edit diagram: ${n}${s}`,removeImage:(n,s)=>`Remove image: ${n}${s}`,
  dragReorder:'Drag to reorder',reorderImage:(n,s)=>`Reorder image: ${n}${s}`,moveImageUp:(n,s)=>`Move image up: ${n}${s}`,moveImageDown:(n,s)=>`Move image down: ${n}${s}`,
  linkCount:c=>`${c} ${plural(c,'link','links')}`,links:'Links',openLink:l=>`Open link: ${l}`,viewLinks:(c,n)=>`View ${c} links: ${n}`,removeLink:l=>`Remove link: ${l}`,
  linkPrompt:'Link address (https://…)',linkInvalid:'Invalid link (use http or https)',
  unsaved:'Unsaved changes',saving:'Saving…',saved:'Saved',saveError:'Save error',
  confirmDeleteIdea:(n,c)=>`Delete "${n}" and ${c} idea(s) below it?`,
  uploadError:'Image upload failed',onlyImages:'Only images are accepted (png, jpg, webp, gif or svg)',
  lineColor:'Line colour',lineColorOf:n=>`Line colour: ${n}`,step1:'1. Choose a colour',anotherColor:'Another colour',customColor:'Custom colour',step2:'2. Apply to',
  onlyDirect:'Only direct children',direct:c=>`${c} ${plural(c,'line','lines')} leaving this card`,
  wholeBranch:'The whole branch below',branchLines:c=>`${c} ${plural(c,'line','lines')} on this card and every card below`,
  defaultColor:'Default colour',colorName:c=>`Colour ${c}`,
  child:'Child',sibling:'Sibling',before:'Before',parent:'Parent',makeRoot:'Make root',image:'Image',diagram:'Diagram',link:'Link',colorLines:'Colour lines',del:'Delete',
  addChild:'Add child',addSibling:'Add sibling',insertBefore:'Insert before',insertParent:'Insert parent of',toRoot:'Turn into a root card',addImage:'Add image',addDiagram:'Add diagram',addLink:'Add link',deleteIdea:'Delete idea',
  becameRoot:n=>`“${n}” is now a root card`,closeEditMenu:'Close edit menu',editWheel:'Edit: opens the wheel of actions',editNode:n=>`Edit: ${n}`,
  mermaidMissing:'Mermaid unavailable',mermaidLoad:'Could not load Mermaid',writeDiagram:'Write the diagram code',
  defaultDiagram:'flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[End]\n  B -->|No| A',
  diagramPreview:'Diagram preview',diagramAlt:n=>`Diagram: ${n}`,diagramSaveError:'Could not save the diagram',
  dropReposition:'drop here: reposition',dropNewRoot:'drop here: new root card',ideasCount:n=>`${n} ideas`,
  dragHint:'Middle button pans · wheel zooms · Esc cancels',repositioned:n=>`“${n}” repositioned`,
  moved:(n,below)=>`“${n}”${below?` and ${below} more idea(s)`:''} moved`,
  ideaText:'Idea text',titlePlaceholder:'Title (optional)',subtitlePlaceholder:'Subtitle (shown on hover)',ideaSubtitle:'Idea subtitle',
  collapse:n=>`Collapse: ${n}`,expand:n=>`Expand: ${n}`,collapseChildren:'Collapse children',expandChildren:'Expand children',
  gripRoot:'Drag to reposition or connect to another card',gripNode:'Drag to move this card and everything below it (drop on empty space to make a new root)',moveNode:n=>`Move: ${n}`,
  linearReading:'LINEAR READING',
  mainLibrary:'App library',removeFolder:l=>`Remove folder from list: ${l}`,removeFolderTitle:'Remove the folder from the list (files are not deleted)',removeFolderError:'Could not remove the folder',
  newPresPrompt:'New presentation name',copySuffix:'copy',otherFolder:'Other folder…',pickerWaiting:'Waiting for the folder picker…',
  pickerUnavailable:'Folder picker unavailable: type the full path.',pickerFailed:'Could not open the picker: type the full path.',
  enterName:'Enter a name.',enterFolder:'Enter or choose the folder.',inFolder:d=>d?`in folder ${d}`:'in the chosen folder',inLibrary:'in presentations/',
  nowIn:(t,w)=>`You are now in “${t}” (saved ${w})`,copySaved:(t,w)=>`Copy “${t}” saved ${w} — you are still in this presentation`,copyError:'Could not save the copy.',
  folderAdded:p=>`Folder added: ${p}`,folderPrompt:'Could not open the picker. Type the full folder path:',invalidFolder:'Invalid folder',
  confirmDeletePres:t=>`Delete the presentation "${t}"? The file will be removed from the presentations folder.`,
  nameTaken:'A presentation with that name already exists. Choose another.',nameKept:(v,k)=>`A presentation named “${v}” already exists; the name “${k}” was kept`,
  // mensagens do servidor (mesma chave = mesmo texto em pt/en)
 },
 pt:{
  pageTitle:'Context Maps',viewport:'Mapa interativo: arraste o fundo para navegar',
  docNew:'+ Nova apresentação',docAddFolder:'Adicionar pasta…',docSaveAs:'Salvar como…',docCopy:'Salvar uma cópia…',docDelete:'Excluir esta apresentação',exportHtml:'Exportar como HTML…',exportZip:'Exportar como ZIP…',importFile:'Importar…',imported:t=>`“${t}” importada`,importError:'Não foi possível importar o arquivo.',
  undo:'Desfazer',treeLabel:'Ideias',wentTo:n=>`Foi para ${n}`,relate:'Relacionar',relateIdea:'Relacionar esta ideia a outra',relateHint:n=>`Clique na ideia a relacionar com “${n}” (clique de novo depois para remover) · Esc cancela`,related:n=>`${n} relacionada(s)`,relatedList:'Ideias relacionadas',relatedOf:n=>`Ideias relacionadas: ${n}`,relatedAdded:(a,b)=>`“${a}” ↔ “${b}”`,relatedRemoved:(a,b)=>`“${a}” ↮ “${b}”`,goTo:n=>`Ir para: ${n}`,search:'Buscar',searchTitle:'Buscar ideias (Ctrl+K)',searchPlaceholder:'Buscar ideias…',searchEmpty:'Nenhuma ideia encontrada',searchResults:n=>`${n} resultados`,duplicate:'Duplicar',copy:'Copiar',paste:'Colar',duplicateIdea:'Duplicar ideia (com tudo abaixo)',copyIdea:'Copiar ideia (com tudo abaixo)',pasteIdea:'Colar a ideia copiada como filha',copied:n=>`“${n}” copiada`,pasted:n=>`“${n}” colada`,redo:'Refazer',undoTitle:'Desfazer (Ctrl+Z)',redoTitle:'Refazer (Ctrl+Shift+Z)',zoomOut:'Diminuir zoom',zoomIn:'Aumentar zoom',fit:'Enquadrar mapa',toolbar:'Controles do mapa',edit:'Editar',
  addRootLabel:'Adicionar card raiz',addRootTitle:'Adicionar um novo card raiz (ponto de partida independente)',rootCard:'Card raiz',
  expandAll:'Expandir tudo',collapseAll:'Recolher tudo',fullscreen:'Tela cheia',exitFullscreen:'Sair da tela cheia',textMode:'Modo texto',mindMap:'Mapa mental',
  lightbox:'Imagem ampliada',closeImage:'Fechar imagem',prevImage:'Imagem anterior',nextImage:'Próxima imagem',close:'Fechar',
  saveAs:'Salvar como',saveCopy:'Salvar uma cópia',presName:'Nome da apresentação',folder:'Pasta',folderPath:'Caminho da pasta',
  pathPlaceholder:'Caminho completo, ex.: C:\\Users\\você\\Documentos\\mapas',choose:'Escolher…',
  openNew:'Abrir a nova apresentação',stayHere:'Continuar nesta apresentação',cancel:'Cancelar',save:'Salvar',
  diagramTitle:'Diagrama (Mermaid)',closeDiagram:'Fechar editor de diagrama',mermaidCode:'Código Mermaid',apply:'Aplicar',
  untitled:'ideia sem título',newIdea:'Nova ideia',newRoot:'Novo card raiz',newPres:'Nova apresentação',
  enlargeIllustration:'Ampliar ilustração',enlargeImage:(n,s)=>`Ampliar imagem: ${n}${s}`,
  viewImages:(c,n)=>`Ver ${c} imagens: ${n}`,viewImage:n=>`Ver imagem: ${n}`,viewImagesTitle:'Ver imagens',viewImageTitle:'Ver imagem',
  editDiagram:(n,s)=>`Editar diagrama: ${n}${s}`,removeImage:(n,s)=>`Remover imagem: ${n}${s}`,
  dragReorder:'Arraste para reordenar',reorderImage:(n,s)=>`Reordenar imagem: ${n}${s}`,moveImageUp:(n,s)=>`Mover imagem para cima: ${n}${s}`,moveImageDown:(n,s)=>`Mover imagem para baixo: ${n}${s}`,
  linkCount:c=>`${c} ${plural(c,'link','links')}`,links:'Links',openLink:l=>`Abrir link: ${l}`,viewLinks:(c,n)=>`Ver ${c} links: ${n}`,removeLink:l=>`Remover link: ${l}`,
  linkPrompt:'Endereço do link (https://…)',linkInvalid:'Link inválido (use http ou https)',
  unsaved:'Alterações não salvas',saving:'Salvando…',saved:'Salvo',saveError:'Erro ao salvar',
  confirmDeleteIdea:(n,c)=>`Excluir "${n}" e ${c} ideia(s) abaixo dela?`,
  uploadError:'Erro ao enviar imagem',onlyImages:'Só imagens são aceitas (png, jpg, webp, gif ou svg)',
  lineColor:'Cor das ligações',lineColorOf:n=>`Cor das ligações: ${n}`,step1:'1. Escolha a cor',anotherColor:'Outra cor',customColor:'Cor personalizada',step2:'2. Aplicar em',
  onlyDirect:'Só filhos diretos',direct:c=>`${c} ${plural(c,'ligação','ligações')} a partir deste card`,
  wholeBranch:'Toda a ramificação abaixo',branchLines:c=>`${c} ${plural(c,'ligação','ligações')} neste card e em todos abaixo`,
  defaultColor:'Cor padrão',colorName:c=>`Cor ${c}`,
  child:'Filho',sibling:'Irmão',before:'Antes',parent:'Pai',makeRoot:'Virar raiz',image:'Imagem',diagram:'Diagrama',link:'Link',colorLines:'Cor linhas',del:'Excluir',
  addChild:'Adicionar filho',addSibling:'Adicionar irmão',insertBefore:'Inserir antes de',insertParent:'Inserir pai de',toRoot:'Transformar em card raiz',addImage:'Adicionar imagem',addDiagram:'Adicionar diagrama',addLink:'Adicionar link',deleteIdea:'Excluir ideia',
  becameRoot:n=>`“${n}” virou um card raiz`,closeEditMenu:'Fechar menu de edição',editWheel:'Editar: abre a roda de ações',editNode:n=>`Editar: ${n}`,
  mermaidMissing:'Mermaid indisponível',mermaidLoad:'Não foi possível carregar o Mermaid',writeDiagram:'Escreva o código do diagrama',
  defaultDiagram:'flowchart TD\n  A[Início] --> B{Decisão}\n  B -->|Sim| C[Fim]\n  B -->|Não| A',
  diagramPreview:'Pré-visualização do diagrama',diagramAlt:n=>`Diagrama: ${n}`,diagramSaveError:'Erro ao salvar o diagrama',
  dropReposition:'soltar aqui: reposicionar',dropNewRoot:'soltar aqui: novo card raiz',ideasCount:n=>`${n} ideias`,
  dragHint:'Botão do meio move o quadro · roda do mouse dá zoom · Esc cancela',repositioned:n=>`“${n}” reposicionado`,
  moved:(n,below)=>`“${n}”${below?` e mais ${below} ideia(s)`:''} movido`,
  ideaText:'Texto da ideia',titlePlaceholder:'Título (opcional)',subtitlePlaceholder:'Subtítulo (aparece ao passar o mouse)',ideaSubtitle:'Subtítulo da ideia',
  collapse:n=>`Recolher: ${n}`,expand:n=>`Expandir: ${n}`,collapseChildren:'Recolher filhos',expandChildren:'Expandir filhos',
  gripRoot:'Arraste para reposicionar ou conectar a outro card',gripNode:'Arraste para mover este card e tudo abaixo dele (solte no espaço vazio para criar uma nova raiz)',moveNode:n=>`Mover: ${n}`,
  linearReading:'LEITURA LINEAR',
  mainLibrary:'Biblioteca do app',removeFolder:l=>`Remover a pasta da lista: ${l}`,removeFolderTitle:'Remover a pasta da lista (os arquivos não são apagados)',removeFolderError:'Erro ao remover a pasta',
  newPresPrompt:'Nome da nova apresentação',copySuffix:'cópia',otherFolder:'Outra pasta…',pickerWaiting:'Aguardando a janela de escolha de pasta…',
  pickerUnavailable:'Seletor de pasta indisponível: digite o caminho completo.',pickerFailed:'Não foi possível abrir o seletor: digite o caminho completo.',
  enterName:'Informe um nome.',enterFolder:'Informe ou escolha a pasta.',inFolder:d=>d?`na pasta ${d}`:'na pasta escolhida',inLibrary:'em presentations/',
  nowIn:(t,w)=>`Agora você está em “${t}” (salva ${w})`,copySaved:(t,w)=>`Cópia “${t}” salva ${w} — você continua nesta apresentação`,copyError:'Erro ao salvar a cópia.',
  folderAdded:p=>`Pasta adicionada: ${p}`,folderPrompt:'Não foi possível abrir o seletor. Digite o caminho completo da pasta:',invalidFolder:'Pasta inválida',
  confirmDeletePres:t=>`Excluir a apresentação "${t}"? O arquivo será removido da pasta presentations.`,
  nameTaken:'Já existe uma apresentação com esse nome. Escolha outro.',nameKept:(v,k)=>`Já existe uma apresentação chamada “${v}”; o nome “${k}” foi mantido`,
 }
};
const apiStrings={
 en:{
  apiButton:'API',apiButtonTitle:'API client (split view)',apiTitle:'API client',apiClose:'Close API client',apiResize:'Resize the API panel',
  apiCollection:'Collection',apiNoCollections:'No collections yet. Create one or import a Bruno collection (.zip).',apiNoCollectionsShort:'No collections',
  apiNewCollection:'New collection…',apiPromptCollection:'Collection name',apiImport:'Import (.zip)…',apiExport:'Export as ZIP',apiDeleteCollection:'Delete collection',
  apiConfirmDeleteCollection:n=>`Delete the collection "${n}" and all its requests?`,apiImported:n=>`Collection “${n}” imported`,apiMore:'More',
  apiEnvironment:'Environment',apiEnvironments:'Environments',apiNoEnv:'No environment',apiEditEnv:'Edit environments',apiNewEnv:'New environment…',apiPromptEnv:'Environment name',apiDeleteEnv:'Delete environment',
  apiNoEnvYet:'No environments yet.',apiAddVariable:'Add variable',apiSecret:'Secret',apiSecretNote:'Secret values are stored only on this machine (never in the collection files, exports or the repository).',
  apiFilter:'Filter requests…',apiNewRequest:'New request',apiNewFolder:'New folder',apiPromptRequest:'Request name',apiPromptFolder:'Folder name',apiPromptRename:'New name',apiRename:'Rename',apiDelete:'Delete',
  apiConfirmDelete:n=>`Delete "${n}"?`,apiEmptyCollection:'Empty collection. Add a request with +.',apiPickRequest:'Pick a request on the left or create one with +.',apiAttach:'Attach to the card',
  apiName:'Name',apiValue:'Value',apiAdd:'Add',apiEnabled:'Enabled',apiRemove:'Remove',apiMethod:'Method',apiSend:'Send',apiCancel:'Cancel',apiSending:'Sending…',
  apiTab_params:'Params',apiTab_headers:'Headers',apiTab_body:'Body',apiTab_auth:'Auth',apiTab_vars:'Vars',apiTab_docs:'Docs',apiTab_scripts:'Scripts',
  apiQuery:'Query params',apiPathParams:'Path params',apiInherited:'Also sent (from the collection)',
  apiBodyNone:'No body',apiBodyText:'Text',apiBodyForm:'Form URL-encoded',apiBodyMultipart:'Multipart (not supported yet)',apiMultipartNote:'Multipart bodies are kept in the file but cannot be sent yet.',
  apiPrettify:'Format JSON',apiInvalidJson:'Invalid JSON',
  apiAuthNone:'No auth',apiAuthBearer:'Bearer token',apiAuthBasic:'Basic auth',apiAuthInherit:'Inherit from collection',apiToken:'Token',apiUsername:'Username',apiPassword:'Password',apiAuthInheritNote:'The collection-level headers are used.',
  apiVarsNote:'Use {{name}} anywhere. Order: collection < environment < request variables. Built-ins: {{$timestamp}}, {{$isoTimestamp}}, {{$guid}}, {{$randomInt}}.',apiResolved:'Resolved request',apiDocsPlaceholder:'Notes about this request (Markdown)',
  apiScriptPre:'Pre-request script',apiScriptPost:'Post-response script',apiTests:'Tests',apiScriptsNote:'Scripts, tests and assertions are kept in the file (Bruno can run them) but are not executed here yet.',apiNoScripts:'This request has no scripts.',
  apiNoResponse:'No response yet. Press Send (Ctrl+Enter).',apiTimeout:s=>`Timed out after ${s} s`,apiCancelled:'Cancelled',apiFailed:'Request failed',apiTruncated:'truncated',apiBinary:n=>`Binary response (${n}) — not shown`,
  apiRespBody:'Body',apiRespHeaders:'Headers',apiRaw:'Raw',apiPretty:'Pretty',apiCopy:'Copy',apiCopied:'Copied',
  apiTileLabel:n=>`API: ${n}`,apiTileCount:n=>`${n} ${n===1?'request':'requests'}`,apiTileMore:n=>`+${n} more`,apiOpenTile:n=>`Open API client: ${n}`,apiDetach:'Remove API from card',apiAttachHint:n=>`Drag a collection or folder from the API panel onto “${n}”, or use ⤓ on one of them`,apiAttached:n=>`“${n}” attached to the card`,apiMissing:'collection not found'
 },
 pt:{
  apiButton:'API',apiButtonTitle:'Cliente de API (tela dividida)',apiTitle:'Cliente de API',apiClose:'Fechar o cliente de API',apiResize:'Redimensionar o painel de API',
  apiCollection:'Coleção',apiNoCollections:'Nenhuma coleção ainda. Crie uma ou importe uma coleção do Bruno (.zip).',apiNoCollectionsShort:'Sem coleções',
  apiNewCollection:'Nova coleção…',apiPromptCollection:'Nome da coleção',apiImport:'Importar (.zip)…',apiExport:'Exportar como ZIP',apiDeleteCollection:'Excluir coleção',
  apiConfirmDeleteCollection:n=>`Excluir a coleção "${n}" e todas as requests dela?`,apiImported:n=>`Coleção “${n}” importada`,apiMore:'Mais',
  apiEnvironment:'Ambiente',apiEnvironments:'Ambientes',apiNoEnv:'Sem ambiente',apiEditEnv:'Editar ambientes',apiNewEnv:'Novo ambiente…',apiPromptEnv:'Nome do ambiente',apiDeleteEnv:'Excluir ambiente',
  apiNoEnvYet:'Nenhum ambiente ainda.',apiAddVariable:'Adicionar variável',apiSecret:'Segredo',apiSecretNote:'Valores secretos ficam só nesta máquina (nunca nos arquivos da coleção, nas exportações nem no repositório).',
  apiFilter:'Filtrar requests…',apiNewRequest:'Nova request',apiNewFolder:'Nova pasta',apiPromptRequest:'Nome da request',apiPromptFolder:'Nome da pasta',apiPromptRename:'Novo nome',apiRename:'Renomear',apiDelete:'Excluir',
  apiConfirmDelete:n=>`Excluir "${n}"?`,apiEmptyCollection:'Coleção vazia. Adicione uma request com +.',apiPickRequest:'Escolha uma request à esquerda ou crie uma com +.',apiAttach:'Anexar ao card',
  apiName:'Nome',apiValue:'Valor',apiAdd:'Adicionar',apiEnabled:'Ativo',apiRemove:'Remover',apiMethod:'Método',apiSend:'Enviar',apiCancel:'Cancelar',apiSending:'Enviando…',
  apiTab_params:'Parâmetros',apiTab_headers:'Cabeçalhos',apiTab_body:'Corpo',apiTab_auth:'Auth',apiTab_vars:'Variáveis',apiTab_docs:'Docs',apiTab_scripts:'Scripts',
  apiQuery:'Parâmetros de consulta',apiPathParams:'Parâmetros de caminho',apiInherited:'Também enviados (da coleção)',
  apiBodyNone:'Sem corpo',apiBodyText:'Texto',apiBodyForm:'Formulário URL-encoded',apiBodyMultipart:'Multipart (ainda não suportado)',apiMultipartNote:'Corpos multipart ficam guardados no arquivo, mas ainda não podem ser enviados.',
  apiPrettify:'Formatar JSON',apiInvalidJson:'JSON inválido',
  apiAuthNone:'Sem autenticação',apiAuthBearer:'Bearer token',apiAuthBasic:'Basic auth',apiAuthInherit:'Herdar da coleção',apiToken:'Token',apiUsername:'Usuário',apiPassword:'Senha',apiAuthInheritNote:'Os cabeçalhos da coleção são usados.',
  apiVarsNote:'Use {{nome}} em qualquer lugar. Ordem: coleção < ambiente < variáveis da request. Embutidas: {{$timestamp}}, {{$isoTimestamp}}, {{$guid}}, {{$randomInt}}.',apiResolved:'Request resolvida',apiDocsPlaceholder:'Notas sobre esta request (Markdown)',
  apiScriptPre:'Script de pré-requisição',apiScriptPost:'Script pós-resposta',apiTests:'Testes',apiScriptsNote:'Scripts, testes e asserções ficam guardados no arquivo (o Bruno consegue executá-los), mas ainda não são executados aqui.',apiNoScripts:'Esta request não tem scripts.',
  apiNoResponse:'Sem resposta ainda. Clique em Enviar (Ctrl+Enter).',apiTimeout:s=>`Tempo esgotado após ${s} s`,apiCancelled:'Cancelada',apiFailed:'A requisição falhou',apiTruncated:'truncada',apiBinary:n=>`Resposta binária (${n}) — não exibida`,
  apiRespBody:'Corpo',apiRespHeaders:'Cabeçalhos',apiRaw:'Bruto',apiPretty:'Formatado',apiCopy:'Copiar',apiCopied:'Copiado',
  apiTileLabel:n=>`API: ${n}`,apiTileCount:n=>`${n} ${n===1?'request':'requests'}`,apiTileMore:n=>`+${n} mais`,apiOpenTile:n=>`Abrir o cliente de API: ${n}`,apiDetach:'Remover a API do card',apiAttachHint:n=>`Arraste uma coleção ou pasta do painel de API para “${n}”, ou use ⤓ em uma delas`,apiAttached:n=>`“${n}” anexada ao card`,apiMissing:'coleção não encontrada'
 }
};
Object.assign(dict.en,apiStrings.en);Object.assign(dict.pt,apiStrings.pt);
export const t=(key,...args)=>{const v=dict[lang][key]??dict.en[key]??key;return typeof v==='function'?v(...args):v;};

// Textos fixos do index.html: data-i18n (texto), data-i18n-attr="atributo:chave;atributo:chave".
export function applyStatic(root=document){
 document.documentElement.lang=lang==='pt'?'pt-BR':'en';
 for(const el of root.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);
 for(const el of root.querySelectorAll('[data-i18n-attr]'))for(const pair of el.dataset.i18nAttr.split(';')){const [attr,key]=pair.split(':');el.setAttribute(attr,t(key));}
}
