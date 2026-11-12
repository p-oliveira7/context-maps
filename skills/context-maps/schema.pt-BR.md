# Formato e boas práticas

> English: [`schema.md`](schema.md).

## JSON da apresentação (`presentations/<id>.json`)
```json
{
  "id": "meu-fluxo",
  "title": "Nome da apresentação",
  "roots": [{
    "id": "root",
    "title": "Título",
    "x": 0, "y": 0,
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
  }]
}
```
- `title` pode ser string vazia quando o nó tem `images` ou `subtitle` (o card mostra só esse conteúdo); a raiz sempre precisa de título.
- `title` (nível superior) é o nome da apresentação; cada item de `roots` é um card inicial independente (um arquivo antigo com um único `tree` ainda é lido). `x`,`y` (só nas raízes, opcionais) posicionam a raiz livremente; raízes sem eles são empilhadas automaticamente.
- `id` de cada nó: string única (a skill gera `n-<hex>`; a raiz é `root`).
- `color`: opcional, só nos filhos diretos da raiz (os demais herdam).
- `linksColor`: opcional, cor das linhas que saem deste nó em direção às filhas (qualquer nó com filhas, inclusive a raiz); não afeta o nó, as filhas nem a linha que chega até ele.
- `related`: opcional, lista de ids de nós (da mesma apresentação) ligados a este como ligações cruzadas; a relação vale nos dois sentidos e os ids de nós excluídos saem ao salvar. Nos outlines use `[rel:Título]`.
- `apis`: opcional, lista de referências de API anexadas ao card, `{collection, path, name, snapshot?}` (`collection` = nome da pasta em `collections/`, `path` = pasta dentro dela, vazio para a coleção toda). Criado pelo app (Anexar ao card); a skill não o escreve.
- `images`: lista opcional (imagens e/ou diagramas, na ordem de exibição). O campo antigo `image` (um só) ainda é lido e migrado ao salvar.
- `subtitle`: texto de apoio opcional (até 2000 caracteres), exibido só ao passar o mouse no card.
- `links`: lista opcional de `{url, label?}` (apenas http/https), exibida como selo "N link(s)" abaixo do card.
- `kind: "diagram"` e `source` (mermaid) são opcionais; diagramas aparecem sem corte no cartão.
- `kind: "drawing"`: um desenho do Excalidraw (`scene: {elements, files}`; `src` é a miniatura SVG; `source` guarda o texto `.flow` quando veio da skill). Abre ao lado do card, editável, com destaque de caminho. Crie com `[flow:arquivo.flow]` (abaixo), não à mão.
- Prefira criar pelo outline (`rm.mjs create`); o servidor valida a estrutura (ids únicos, profundidade ≤ 40).

## Como estruturar
**Fluxo** — leia da esquerda para a direita:
- Ramos de primeiro nível = etapas em ordem (prefixe com número se a ordem importar: "1. Autenticar").
- Filhos = o que acontece, decisões ("Se token expirado → …") e falhas.
- Ciclos ("volta ao passo 2") viram texto no nó ou um diagrama mermaid anexado.

**Arquitetura**:
- Ramos = camadas ou módulos (API, Domínio, Dados, Integrações).
- Filhos = responsabilidade, entradas/saídas, dependências críticas.
- Para fluxos de requisição/decisão que terminam em resultados (códigos de status, erros), anexe um fluxograma `[flow:…]` (destaque de caminho clicável); para topologias ou sequências, mermaid (`sequenceDiagram`, `erDiagram`).

## Qualidade
- Títulos curtos e informativos (frases nominais). Máximo ~90 caracteres.
- 3 a 7 filhos por nó; mais que 8 → agrupe.
- Profundidade até 5 níveis; mais que isso → quebre em outra apresentação.
- Não repita a mesma ideia em ramos diferentes; ligue por referência no texto.
- Não invente: onde o contexto não responde, escreva "A definir".

## Fluxogramas (`.flow`)
`[flow:arquivo.flow]` transforma um arquivo de texto curto num **desenho editável** (Excalidraw) no card: quadros e setas com layout automático, miniatura no card e, no app, o usuário abre ao lado do card, dá zoom, se move pelo desenho, edita livremente e **clica num quadro final (ex.: um `412`) para acender todos os caminhos que levam até ele**. Prefira ao mermaid para fluxos de API/requisição, decisões e resultados de erro. Não precisa de ferramentas extras.
```text
# Criar pedido                       (título opcional do desenho)
direction: right                     (ou down; padrão right)
client: App cliente                  (id: rótulo)
auth: Token válido? [diamond]        (forma: box (padrão), diamond, ellipse)
e412: 412 Precondition
Failed [ellipse] {color=#f08c00}   (
 quebra a linha; {color} colore o quadro)
ok: 201 Created [ellipse] {color=#2f9e44}
client -> auth: POST /orders         (seta com rótulo opcional)
auth -> e412: não
auth -> ok: sim
// comentário
```
- Ids: letras, números, `_ . -`. Uma seta para um id não declarado cria um quadro com o id como rótulo.
- Um fluxo por arquivo; algo entre ~3 e 15 quadros. Decisões como `[diamond]` com `sim`/`não` nas setas; resultados (códigos de status, erros) como fins `[ellipse]`, coloridos (verde sucesso, vermelho/laranja erro).
- Voltas ("tentar de novo") podem: a seta volta e o layout a ignora.
- `validate` mostra os avisos do fluxo (linhas não entendidas, formas); `create`/`update` guardam em `images[]` com `kind: "drawing"`, a `scene` do Excalidraw e o texto em `source` (`update` só adiciona quando o texto mudou).

## Mermaid
Requer `mmdc` (`npm i -g @mermaid-js/mermaid-cli`) no PATH ou `MMDC=caminho`; use `MMDC_BROWSER=caminho/do/chrome` para reaproveitar um Chrome instalado (instale com `PUPPETEER_SKIP_DOWNLOAD=1`). O diagrama é renderizado em SVG
com tema escuro e fundo transparente e enviado como imagem do nó; o código-fonte fica em `images[].source`.
Sem `mmdc`, o nó é criado sem imagem e o item aparece em `skipped` no relatório.
