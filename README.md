# Context Maps

Prévia independente de um visualizador de mapas. Conteúdo, ilustração SVG e implementação originais. Sem backend, CDN ou dependências de runtime.

## Abrir localmente

Na pasta do projeto, execute `python -m http.server 4173 --bind 127.0.0.1` e abra http://127.0.0.1:4173. Não abra index.html via file://, pois usa módulos JavaScript.

Arraste o fundo para navegar, role para zoom, clique nos botões + dos ramos. Enquadrar recentraliza. O modo texto preserva a câmera e a expansão. O estado reinicia ao recarregar.

Clique no título de um card com filhos (ou use Enter/Espaço) para expandir/recolher. O título da raiz permite deixar apenas o primeiro card; reabrir preserva ramos abertos. Qualquer nó em model.js pode receber `image: {src: 'arquivo.svg', alt: 'Descrição'}`. A imagem é opcional, aparece também no modo texto e abre ampliada no mapa, sem recolher o ramo. Há exemplos na raiz, em Natureza e na primeira folha desse ramo.

`node tests/cards.mjs` verifica títulos, raiz, teclado e imagens nos três níveis com a mesma configuração de navegador abaixo.

Abrir um card movimenta os nós e suas linhas por 420 ms. A conexão ao primeiro filho recebe um destaque de apresentação por 1 segundo. Passar o mouse sobre um card destaca apenas sua linha de entrada. A preferência de movimento reduzido desativa movimento e desenho progressivo, mantendo o realce estático. `node tests/motion.mjs` verifica esses efeitos, incluindo alternâncias rápidas.

## Testes

`npm test` executa os testes de modelo com Node. Para navegador, disponibilize playwright-core, configure PLAYWRIGHT_MODULE com seu caminho absoluto e execute `node tests/browser.mjs` com o servidor ativo. BROWSER_EXECUTABLE permite selecionar Chromium; PREVIEW_URL permite mudar a porta.

## Limites da prévia

Um mapa demonstrativo de 17 ideias, sem editor ou salvamento. Mobile oferece pan com um dedo e botões de zoom; pinch não implementado. Expansão global enquadra o resultado: escolha deliberada de usabilidade, diferente da referência. Ilustração feita como SVG próprio; nenhuma mídia ou texto editorial da referência foi reutilizado. Nenhuma publicação automática.

## Modo de edição e apresentações

Execute `node server.mjs` (sem dependências) e abra http://127.0.0.1:4173. O servidor serve o app e grava cada apresentação como um arquivo JSON em `presentations/` (imagens enviadas ficam em `presentations/<id>/assets/`), prontos para versionar com Git. Sem o servidor (por exemplo, com `python -m http.server`), o app abre somente em modo de exibição com o mapa de demonstração.

- **Switch "Editar"** na barra inferior alterna entre exibição e edição.
- **Edição:** clique no texto para editar (Enter confirma). Ao passar o mouse sobre uma ideia aparecem: + Filho, + Irmão, Imagem, Sem imagem, cor (ramos principais) e Excluir. A profundidade é livre.
- **Salvamento automático** a cada alteração; o estado aparece ao lado do nome da apresentação.
- **Apresentações:** o menu no canto superior esquerdo troca, cria (+ Nova apresentação) ou exclui a apresentação atual.
- `PORT` e `PRESENTATIONS_DIR` configuram porta e pasta. `node tests/edit.mjs` sobe um servidor temporário e verifica o fluxo completo.
- **Diagramas:** em edição, "+ Diagrama" (ou "Editar diagrama") abre um editor Mermaid com pré-visualização ao vivo; ao aplicar, o SVG é salvo como imagem do nó e o código fica em image.source. O Mermaid (`vendor/mermaid.min.js`, MIT) é carregado só nesse momento; fora dele o app segue sem dependências.
- **Várias mídias por ideia:** cada ideia aceita qualquer quantidade de imagens e diagramas ("+ Imagem" aceita vários arquivos; "+ Diagrama" adiciona outro). Em edição, cada mídia tem "Editar" (diagramas) e "×". Ao ampliar, setas ‹ › ou ← → navegam entre elas. Apresentações antigas com uma única imagem são migradas ao salvar.
