# State

## Decisions

AD-001: HTML/CSS/ES modules sem dependências de runtime; conteúdo e SVG originais. Estado em memória. Repositório clonado vazio em outputs. Sem push/deploy.

## Handoff

Plano de duas entregas atômicas: modelo (model.js, tests/model.test.js, package.json, spec), depois interface (index.html, styles.css, app.js, city.svg, README e teste de navegador). Tasks formal omitido por serem dois passos; validate_tasks informa ausência esperada. Modelo verificado por npm test; interface será verificada no navegador e por Verifier independente.
