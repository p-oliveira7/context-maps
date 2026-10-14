# Cobertura dos cards

Gates anteriores e novos passaram: quatro testes de modelo, browser.mjs e cards.mjs. Nenhum teste anterior foi alterado, removido ou enfraquecido.

| AC | Asserção / arquivo | Resultado e mapeamento reverso |
| --- | --- | --- |
| CARD-01 | tests/cards.mjs:12 deepEqual(ids, eight+filhos), :13 deepEqual(ids,eight), :21 node-title count=0 | Isolamento do ramo e folha não interativa; manter |
| CARD-02 | tests/cards.mjs:14 e :15 deepEqual(ids,['root']), :16 deepEqual(ids,eight) | Raiz isolada e estado anterior restaurado; manter |
| CARD-03 | tests/cards.mjs:17 e :19 activeElement=true, :18 length=5 | Teclado e foco; manter |
| CARD-04 | tests/cards.mjs:23 níveis presentes, :28 src/alt iguais, :29 imagem carregada, :35 imagens de leitura iguais | Mídia opcional nos três níveis e leitura; manter |
| CARD-05 | tests/cards.mjs:31 diálogo aberto/src/alt e IDs iguais, :32 fechado e foco=true | Imagem correta sem recolher; manter |
| CARD-06 | tests/cards.mjs:26 count=image?1:0 | Sem placeholder em nós sem mídia; manter |

Uma entrega atômica: títulos e mídia no renderer de cards; implementação e verificação independente concluídas. Tasks formal omitido como previsto para um passo; validate_tasks confirmou ausência. Inspeção visual desktop/mobile realizada pelo autor; screenshots em work/cards-*.png fora do repositório. Verifier: 6/6 critérios e 2/2 mutações detectadas. Nenhuma nova lição de falha: rodada limpa.
