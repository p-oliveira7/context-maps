# Cobertura dos cards

Gates anteriores e novos passaram: quatro testes de modelo, browser.mjs e cards.mjs. Nenhum teste anterior foi alterado, removido ou enfraquecido.

| AC | Asserção / arquivo | Resultado e mapeamento reverso |
| --- | --- | --- |
| CARD-01 | tests/cards.mjs:13 deepEqual(ids, eight+filhos), :14 deepEqual(ids,eight), :22 node-title count=0 | Isolamento do ramo e folha não interativa; manter |
| CARD-02 | tests/cards.mjs:15 e :16 deepEqual(ids,['root']), :17 deepEqual(ids,eight) | Raiz isolada e estado anterior restaurado; manter |
| CARD-03 | tests/cards.mjs:18 e :20 activeElement=true, :19 length=5 | Teclado e foco; manter |
| CARD-04 | tests/cards.mjs:24 níveis presentes, :29 src/alt iguais, :30 imagem carregada, :36 imagens de leitura iguais | Mídia opcional nos três níveis e leitura; manter |
| CARD-05 | tests/cards.mjs:32 diálogo aberto/src/alt e IDs iguais, :33 fechado e foco=true | Imagem correta sem recolher; manter |
| CARD-06 | tests/cards.mjs:27 count=image?1:0 | Sem placeholder em nós sem mídia; manter |

Uma entrega atômica: títulos e mídia no renderer de cards; implementação concluída, aguardando verificação independente. Tasks formal omitido como previsto para um passo; validate_tasks confirmou ausência.
