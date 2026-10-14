# Response Maps

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
