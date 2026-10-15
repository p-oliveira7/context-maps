# Formato e boas práticas

> English: [`schema.md`](schema.md).

## JSON da apresentação (`presentations/<id>.json`)
```json
{
  "id": "meu-fluxo",
  "tree": {
    "id": "root",
    "title": "Título",
    "children": [
      {
        "id": "n-1a2b3c4d",
        "title": "Ideia",
        "color": "#c76a61",
        "images": [
          {"src": "presentations/meu-fluxo/assets/foto.png", "alt": "Descrição"},
          {"src": "presentations/meu-fluxo/assets/d.svg", "alt": "Diagrama", "kind": "diagram", "source": "flowchart TD…"}
        ],
        "children": []
      }
    ]
  }
}
```
- `title` pode ser string vazia quando o nó tem `images` ou `subtitle` (o card mostra só esse conteúdo); a raiz sempre precisa de título.
- `id` de cada nó: string única (a skill gera `n-<hex>`; a raiz é `root`).
- `color`: opcional, só nos filhos diretos da raiz (os demais herdam).
- `images`: lista opcional (imagens e/ou diagramas, na ordem de exibição). O campo antigo `image` (um só) ainda é lido e migrado ao salvar.
- `subtitle`: texto de apoio opcional (até 2000 caracteres), exibido só ao passar o mouse no card.
- `links`: lista opcional de `{url, label?}` (apenas http/https), exibida como selo "N link(s)" abaixo do card.
- `kind: "diagram"` e `source` (mermaid) são opcionais; diagramas aparecem sem corte no cartão.
- Prefira criar pelo outline (`rm.mjs create`); o servidor valida a estrutura (ids únicos, profundidade ≤ 40).

## Como estruturar
**Fluxo** — leia da esquerda para a direita:
- Ramos de primeiro nível = etapas em ordem (prefixe com número se a ordem importar: "1. Autenticar").
- Filhos = o que acontece, decisões ("Se token expirado → …") e falhas.
- Ciclos ("volta ao passo 2") viram texto no nó ou um diagrama mermaid anexado.

**Arquitetura**:
- Ramos = camadas ou módulos (API, Domínio, Dados, Integrações).
- Filhos = responsabilidade, entradas/saídas, dependências críticas.
- Para topologias ou sequências, anexe mermaid (`flowchart`, `sequenceDiagram`, `erDiagram`).

## Qualidade
- Títulos curtos e informativos (frases nominais). Máximo ~90 caracteres.
- 3 a 7 filhos por nó; mais que 8 → agrupe.
- Profundidade até 5 níveis; mais que isso → quebre em outra apresentação.
- Não repita a mesma ideia em ramos diferentes; ligue por referência no texto.
- Não invente: onde o contexto não responde, escreva "A definir".

## Mermaid
Requer `mmdc` (`npm i -g @mermaid-js/mermaid-cli`) no PATH ou `MMDC=caminho`; use `MMDC_BROWSER=caminho/do/chrome` para reaproveitar um Chrome instalado (instale com `PUPPETEER_SKIP_DOWNLOAD=1`). O diagrama é renderizado em SVG
com tema escuro e fundo transparente e enviado como imagem do nó; o código-fonte fica em `images[].source`.
Sem `mmdc`, o nó é criado sem imagem e o item aparece em `skipped` no relatório.
