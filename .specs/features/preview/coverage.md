# Cobertura antes do commit

Gate: npm test (4/4) e node tests/browser.mjs (cenários desktop/mobile). Sem testes removidos ou enfraquecidos. Nenhuma diretriz preexistente no repositório vazio.

| AC | Evidência de asserção | Resultado especificado / mapeamento reverso |
| --- | --- | --- |
| MAP-01 | tests/model.test.js:4 assert.equal(...length,5); tests/browser.mjs:11 assert.equal(await count(),5) | Cinco nós, manter ambos: modelo e integração |
| MAP-02 | tests/model.test.js:6 assert.equal(...length,17); tests/browser.mjs:12 count=17 e :13 count=5 | Expansão/recolhimento, manter |
| MAP-03 | tests/model.test.js:12 assert.deepEqual(...IDs...); tests/browser.mjs:14 count=8, :15 outro ramo ausente, :16 count=5 | Apenas três filhos do ramo, reversível, manter |
| MAP-04 | tests/browser.mjs:19 headings=17; :21 count=8 e camera=before | Leitura completa e preservação, manter |
| MAP-05 | tests/model.test.js:18 scale=2 e âncora 200/100; :19 limites 2.5/.15 | Zoom limitado e ancorado, manter |
| MAP-06 | tests/browser.mjs:26 assert.notEqual(camera,panBefore) e dialog=false | Deslocamento sem imagem, manter |
| MAP-07 | tests/browser.mjs:22 diálogo=true, :23 false, :24 foco=true | Abre, fecha, restaura foco, manter |
| MAP-08 | tests/browser.mjs:34 bounding boxes após reload; :39 após fit | Dentro do viewport nas duas larguras, manter |

Inspeção visual: desktop enquadrado; mobile enquadrado com texto pequeno na visão geral, usando zoom ou modo texto para ler. Não equivale a teste em dispositivo físico.
