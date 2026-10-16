---
name: context-maps-pt-br-reference
description: Monta apresentações em mapa mental no app Context Maps a partir do contexto de uma aplicação (código, specs, README, fluxos, arquitetura, decisões). Use quando o usuário pedir um mapa mental, mapa de fluxo, mapa de arquitetura ou apresentação visual de um sistema/processo para abrir e editar no Context Maps.
---

# Context Maps — montar apresentações a partir de contexto

> English: [`SKILL.md`](SKILL.md) (versão usada pelos agentes). Guia completo: [`docs/skill.pt-BR.md`](../../docs/skill.pt-BR.md).

O app Context Maps guarda cada apresentação como um JSON em `presentations/`. Esta skill transforma
contexto (código, documentos, conversa) em uma árvore de ideias e a publica **pela API do servidor local**.

## Pré-requisitos
- Node 18+ (usa `fetch`). Sem dependências.
- Servidor do app no ar (padrão `http://127.0.0.1:4173`; mude com `RM_URL`).
- As mensagens do CLI seguem `RM_LANG=en|pt` (padrão: idioma do sistema).
- Opcional, para diagramas: `mmdc` (mermaid-cli) no PATH ou em `MMDC`. Sem Chrome do puppeteer, aponte um Chrome instalado com `MMDC_BROWSER`.

CLI: `node skills/context-maps/scripts/rm.mjs <comando>` (a partir da raiz do app).

| Comando | O que faz |
| --- | --- |
| `serve` | Inicia o servidor se não estiver ativo |
| `status` | Lista as apresentações existentes |
| `validate --outline f.md` | Confere o outline e mostra avisos (sai com 3 se houver) |
| `create --outline f.md [--id slug] [--replace]` | Cria (ou sobrescreve) a apresentação, envia imagens/diagramas e imprime a URL |
| `upload <id> <arquivo>` | Envia uma imagem e imprime o `src` |

## Procedimento
1. **Garanta o servidor:** `rm.mjs serve`. Rode `rm.mjs status` para ver o que já existe (evite sobrescrever sem pedir).
2. **Colete o contexto** necessário: leia README, specs, rotas, módulos, testes, diagramas existentes. Não invente
   o que não está no material; marque lacunas como ideia "A definir".
3. **Escolha a forma do mapa** (veja `schema.md`):
   - *Fluxo / jornada:* raiz = o fluxo; ramos = etapas na ordem; filhos = ações, decisões, erros e saídas.
   - *Arquitetura:* raiz = o sistema; ramos = camadas/módulos; filhos = responsabilidades, interfaces, dependências.
   - *Ambos:* raiz = o sistema; um ramo "Arquitetura" e um ramo "Fluxos", cada um com sua estrutura.
4. **Escreva o outline** em markdown (formato abaixo) num arquivo temporário. Textos curtos (≤ 90 caracteres),
   3–7 filhos por nó, profundidade ≤ 5.
5. **Anexe mídia quando existir:** prints/diagramas do projeto com `[img:caminho|alt]`; fluxos complexos como
   mermaid com `[mermaid:arquivo.mmd]` (renderizado para SVG se `mmdc` estiver disponível).
6. **Valide e publique:** `rm.mjs validate --outline f.md`, corrija avisos, depois `rm.mjs create --outline f.md --id <slug>`.
7. **Entregue:** informe a URL (`…/?p=<id>`), o arquivo gerado (`presentations/<id>.json`), contagem de nós e
   o que foi pulado (imagens/diagramas não anexados). Lembre que dá para ajustar no modo **Editar** e versionar no Git.

## Formato do outline
```markdown
# Título da apresentação [img:docs/capa.png|Capa]
- Etapa 1 {color=#c76a61}
  - Ação ou decisão
  - Fluxo detalhado [mermaid:docs/login.mmd]
- Etapa 2
  - Print da tela [img:docs/tela.png|Tela de login]
```
- `# Título` (primeira linha) vira a raiz e o nome da apresentação.
- Cada `-` é uma ideia; a indentação (2 espaços ou tab) define a hierarquia.
- `{color=#rrggbb}` só tem efeito nos ramos do primeiro nível.
- `{links=#rrggbb}` colore as linhas daquela ideia até as filhas (qualquer ideia com filhas).
- Um item pode ficar **sem título** quando tem marcador (ex.: `- [mermaid:fluxo.mmd]` ou `- [subtitle:nota]`): o card mostra só a mídia / texto secundário.
- `[subtitle:Texto de apoio]` adiciona um subtítulo exibido só ao passar o mouse no card (sem `]` dentro).
- `[link:https://site.com|Rótulo]` adiciona um link clicável abaixo do card (o rótulo é opcional; vários permitidos; só http/https).
- Uma ideia pode ter **várias** mídias: repita os marcadores ([img:a.png|A] [mermaid:fluxo.mmd] [img:b.png|B]); elas aparecem empilhadas no card, na ordem escrita.
- Caminhos de imagem/diagrama são relativos ao arquivo outline. URLs remotas **não** são baixadas.
- Imagens: png, jpg, webp, gif, svg.

## Regras
- Nunca apague apresentações nem use `--replace` sem o usuário pedir.
- Não copie conteúdo protegido; resuma com suas palavras.
- Se o servidor estiver fora do ar e `serve` falhar, informe o comando manual (`node server.mjs`) em vez de gravar arquivos direto.
- Reporte avisos e itens pulados com transparência.
