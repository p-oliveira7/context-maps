# Context Maps — instruções para agentes

App local de mapas mentais (HTML/CSS/JS + `server.mjs` em Node, sem dependências de runtime).
Cada apresentação é um arquivo `presentations/<id>.json`.

## Montar uma apresentação a partir de contexto (fluxos, arquitetura)

Fonte única das instruções: **`skills/context-maps/SKILL.md`** (procedimento) e
**`skills/context-maps/schema.md`** (formato e boas práticas). Leia os dois antes de começar.
Guia completo: `docs/skill.md`.

Resumo:

1. `node skills/context-maps/scripts/rm.mjs serve` — garante o servidor em `http://127.0.0.1:4173`.
2. Leia o contexto (código, README, specs). Não invente; use "A definir" para lacunas.
3. Escreva um outline markdown (`# Título`, itens `- ideia` com indentação; marcadores
   `[img:arquivo|alt]`, `[mermaid:arquivo.mmd]`, `[link:https://…|rótulo]`, `{color=#hex}`).
4. `node skills/context-maps/scripts/rm.mjs validate --outline arquivo.md`
5. `node skills/context-maps/scripts/rm.mjs create --outline arquivo.md --id <slug>`
   (use `--replace` apenas se o usuário pedir para sobrescrever).
6. Informe a URL (`…/?p=<id>`), a contagem de nós e o que foi pulado.

Diagramas mermaid exigem `mmdc` (mermaid-cli) no PATH ou em `MMDC`; use `MMDC_BROWSER` para
apontar um Chrome já instalado.

## Desenvolvimento

- Servidor: `node server.mjs` (variáveis `PORT`, `PRESENTATIONS_DIR`).
- Testes: `npm test` (modelo) e `node tests/{browser,cards,motion,edit,skill}.mjs`
  com `PLAYWRIGHT_MODULE` apontando para `playwright-core`. `edit` e `skill` sobem servidor temporário próprio.
- Não adicione dependências de runtime; o Mermaid em `vendor/` é carregado sob demanda só pelo editor de diagramas.
