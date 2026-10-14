# Response Maps

Prévia independente de um visualizador de mapas. Conteúdo, ilustração SVG e implementação originais. Sem backend, CDN ou dependências de runtime.

## Abrir localmente

Na pasta do projeto, execute `python -m http.server 4173 --bind 127.0.0.1` e abra http://127.0.0.1:4173. Não abra index.html via file://, pois usa módulos JavaScript.

Arraste o fundo para navegar, role para zoom, clique nos botões + dos ramos. Enquadrar recentraliza. O modo texto preserva a câmera e a expansão. O estado reinicia ao recarregar.

## Testes

`npm test` executa os testes de modelo com Node. Para navegador, disponibilize playwright-core, configure PLAYWRIGHT_MODULE com seu caminho absoluto e execute `node tests/browser.mjs` com o servidor ativo. BROWSER_EXECUTABLE permite selecionar Chromium; PREVIEW_URL permite mudar a porta.

## Limites da prévia

Um mapa demonstrativo de 17 ideias, sem editor ou salvamento. Mobile oferece pan com um dedo e botões de zoom; pinch não implementado. Expansão global enquadra o resultado: escolha deliberada de usabilidade, diferente da referência. Ilustração feita como SVG próprio; nenhuma mídia ou texto editorial da referência foi reutilizado. Nenhuma publicação automática.
