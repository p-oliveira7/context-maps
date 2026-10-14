# State

## Decisions

AD-001: HTML/CSS/ES modules sem dependências de runtime; conteúdo e SVG originais. Estado em memória. Repositório clonado vazio em outputs. Sem push/deploy.

## Handoff

Concluído: modelo (90044bb), interface (1863daa) e reforço de testes (b96f4aa). Tasks formal omitido por serem dois passos; validate_tasks informa ausência esperada. Gate: 4 testes de modelo, cenários de navegador desktop/mobile e Verifier independente PASS, 8/8 ACs. Sensor inicial encontrou dois testes insuficientes, ambos corrigidos e revalidados com mutantes mortos. Relatório autoritativo em features/preview/validation.md; coverage.md é registro histórico anterior ao reforço.

Prévia ativa em http://127.0.0.1:4173 (Python PID 51116). Branch main, commits somente locais, sem push/deploy. Próximo passo: avaliação visual pelo usuário. Duas pastas temporárias de revisão permanecem porque a limpeza foi bloqueada; servidores auxiliares parados. Caminhos registrados nos relatórios de revisão da conversa. Não tentar contornar bloqueio.
