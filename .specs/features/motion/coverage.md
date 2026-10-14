# Cobertura de movimento

Entrega atômica: motion.js, integração app.js, styles.css, README e tests/motion.mjs. Gates anteriores preservados sem modificar seus testes; novo teste usa relógio controlado para amostrar rAF sem depender do agendamento variável do navegador headless. As asserções originais não foram enfraquecidas. validate_tasks informa ausência esperada por passo único.

| Critério | Evidência de asserção | Mapeamento reverso |
| --- | --- | --- |
| MOT-01 | tests/motion.mjs:19 mid != start e d != firstD; :20 mid != end; :21 posição final estável | Interpolação real dos nós/linhas; manter |
| MOT-02 | :15 IDs presenting=['mobility-1']; :17 dash>0; :18 espessura>3; :22 dash diminui; :23 classe desaparece; :31 raiz apresenta mobility | Primeiro filho e raiz; manter |
| MOT-03 | :27 hovered=['nature']; :28 width aumenta/filter muda; :29 retorna ao padrão; :30 raiz não destaca | Hover isolado; manter |
| MOT-04 | :34 posição imediata estável; :35 animationName=none e dasharray=none; :36 hover preservado | Reduced motion; manter |
| MOT-05 | :33 filho e conexão ausentes, nenhum presenting após alternâncias | Sem efeitos antigos; manter |

Estado: implementado e gates locais passaram, aguardando Verifier. Sem novos recursos além dos efeitos pedidos. Padrão nativo JS/CSS do projeto mantido.
