# Context Maps

**Português (BR)** · [English](README.md)

**Mapas mentais montados a partir de contexto.** Um app local para visualizar e editar apresentações em
formato de mapa mental, mais uma *skill* para agentes (Claude, Codex, Cursor) que lê o contexto de uma
aplicação — código, specs, fluxos, decisões — e publica o mapa pronto, com imagens, diagramas e links.

> Sem backend externo, sem CDN, sem dependências de runtime. Tudo roda em `127.0.0.1` e cada
> apresentação é um arquivo JSON que você versiona com Git.

---

## A ideia

Explicar um sistema costuma exigir três coisas que vivem em lugares diferentes: **o texto** (README,
specs), **os diagramas** (fluxos, arquitetura) e **as evidências** (prints, links). Um mapa mental junta
as três numa só superfície navegável: você começa pela visão geral e abre os ramos conforme a conversa.

O Context Maps nasce da combinação de duas peças:

1. **Um visualizador/editor local** de mapas mentais, rápido e sem dependências, onde as apresentações são
   arquivos simples dentro do repositório.
2. **Uma skill para agentes** que transforma contexto em apresentação. Em vez de montar o mapa à mão, você
   pede — *"monte um mapa do fluxo de checkout desta aplicação"* — e o agente lê o projeto, escreve a
   estrutura, anexa diagramas e links, valida e entrega uma URL para abrir e ajustar no modo de edição.

O resultado é revisável (é um JSON no Git), editável (modo de edição no app) e reproduzível (a skill pode
regerar ou ampliar o mapa quando o sistema muda).

### Por que arquivos JSON locais?

- **Versionamento de graça:** `git diff` mostra exatamente que ideia mudou.
- **Sem conta, sem nuvem:** o conteúdo da sua arquitetura não sai da sua máquina.
- **Legível por agentes:** o formato é pequeno e documentado ([`schema.md`](skills/context-maps/schema.md)).

---

## Visão geral

| Peça | O que é | Onde |
| --- | --- | --- |
| **App** | Visualizador e editor de mapas (HTML/CSS/ES modules) | `index.html`, `app.js`, `motion.js`, `model.js`, `store.js`, `styles.css` |
| **Servidor local** | Node sem pacotes: serve o app e grava as apresentações | `server.mjs` |
| **Apresentações** | Um JSON por mapa + pasta de imagens | `presentations/<id>.json`, `presentations/<id>/assets/` |
| **Skill** | Procedimento + CLI para agentes montarem mapas | `skills/context-maps/` |
| **Guia da skill** | Documentação detalhada da skill | [`docs/skill.pt-BR.md`](docs/skill.pt-BR.md) |
| **Testes** | Modelo, navegador, cards, movimento, edição e skill | `tests/` |

```
 contexto (código, specs, README)        ┌──────────────────────────────┐
        │                                │  app no navegador            │
        ▼                                │  exibir · editar · diagramas │
 agente + skill ──outline──▶ rm.mjs ──▶  └──────────────▲───────────────┘
                                │                       │ GET/PUT/upload
                                ▼                       │
                        server.mjs (127.0.0.1) ─────────┘
                                │
                                ▼
                  presentations/<id>.json  ──▶  Git
```

---

## Começando

Requisitos: **Node 18+** (testado em Node 24). Nenhum `npm install` é necessário para usar o app.

```bash
node server.mjs          # ou: npm start
```

Abra <http://127.0.0.1:4173>. Na primeira execução o servidor cria a apresentação de demonstração em
`presentations/`. Variáveis opcionais:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `4173` | Porta do servidor |
| `PRESENTATIONS_DIR` | `./presentations` | Pasta onde ficam os mapas |

> Sem o servidor (por exemplo `python -m http.server`), o app abre **somente em exibição**, com o mapa
> de demonstração embutido. Não abra o `index.html` por `file://` (usa módulos ES).

---

## Usando o app

### Exibição
- **Arrastar** o fundo (ou segurar o **botão do meio do mouse** em qualquer lugar, até sobre cards) move o mapa; **rolar** dá zoom; os botões − / + e ⌗ (enquadrar) ficam no canto.
- **Clique no título** (ou Enter/Espaço) expande ou recolhe um ramo; o botão em leque ao lado do card também.
  Abrir um ramo anima os cards por 420 ms e destaca por 1 s a conexão ao primeiro filho
  (respeita `prefers-reduced-motion`).
- **Vários cards raiz** nunca se sobrepõem: quando uma árvore aberta cobriria outra, as demais se afastam (com a animação de abrir) e voltam à posição salva ao recolher.
- **Passar o mouse** num card destaca a linha que chega até ele, e o card **cresce um pouco** (a imagem também ganha zoom); desativado na edição e com movimento reduzido.
- **Expandir tudo / Recolher tudo**, **Tela cheia** (modo de tela cheia do navegador; o mapa funciona exatamente igual) e **Modo texto** (leitura linear do mapa inteiro) na barra inferior.
- **Imagens e diagramas** abrem em tela cheia; com várias mídias há setas ‹ › (ou ← →) e contador.
- **Subtítulos** (texto de apoio) aparecem num pequeno painel sob o card **somente ao passar o mouse**.
- **Links** aparecem como selo "🔗 N link(s)" abaixo do card: um link abre direto, vários abrem uma lista.

### Edição
Ative o switch **Editar** na barra inferior.

| Ação | Como |
| --- | --- |
| Editar texto | Clique no texto; Enter confirma |
| Cards raiz | **Card raiz** (barra inferior, modo edição) adiciona outro ponto de partida em qualquer lugar do mapa; uma apresentação pode ter vários. Arraste uma raiz pela alça **⋮⋮** para posicioná-la livremente, ou sobre outro card para conectá-la como filha. Soltar qualquer card no **espaço vazio** o transforma (com tudo abaixo) em uma nova raiz (**Virar raiz** na roda faz o mesmo); **Excluir** funciona nas raízes enquanto sobrar ao menos uma |
| Nome da apresentação | **Duplo clique** no nome, no menu do canto superior esquerdo, para renomear (separado do texto dos cards raiz). Os nomes são únicos: um nome já usado é recusado com um aviso (e *nova/cópia* acrescentam " (2)", " (3)"…) |
| Menu de edição | Passe o mouse num card e clique no botão **✎** no topo, ao centro: abre uma **roda de ações** em volta dele (fecha com **Esc**, × ou clicando fora) |
| Adicionar ideia | **+ Filho**, **+ Irmão** (depois), **+ Antes** (irmão antes) ou **+ Pai** (envolve a ideia num novo card pai); profundidade livre |
| Reordenar mídias | Com 2+ imagens/diagramas no card: botões **↑ ↓** ou arraste a alça **⋮⋮** sobre outro item (uma linha verde mostra onde cai) |
| Imagens | **+ Imagem** (aceita vários arquivos) ou **arraste arquivos de imagem para o card**; cada arquivo é **copiado** para `presentations/<id>/assets/` e o original não é alterado; **×** remove uma |
| Diagramas | **+ Diagrama** abre o editor Mermaid com pré-visualização ao vivo; **Editar** reabre |
| Cards sem título | Apague o título de um card que tenha imagem/diagrama ou subtítulo: ele passa a mostrar só esse conteúdo (card só com subtítulo mostra o subtítulo o tempo todo) |
| Subtítulo | Digite no campo "Subtítulo" abaixo do título (apague para remover); aparece no hover na exibição |
| Links | **+ Link** (http/https); chips com **×** para remover |
| Cor das ligações | **Cor linhas** na roda (qualquer ideia com filhas, inclusive a raiz): escolha a cor (paleta, personalizada ou padrão) e depois **Só filhos diretos** (as linhas que saem daquele card) ou **Toda a ramificação abaixo** (aquele card e todos abaixo dele). O próprio card, as filhas e a linha que chega até ele nunca mudam |
| Mover | Arraste a **alça ⋮⋮** à esquerda do card. O card e **tudo abaixo dele** saem do mapa e acompanham o cursor como uma pequena árvore. Solte sobre outro card (vira filho; folhas pulsam e uma linha tracejada mostra a conexão) ou na borda de cima/baixo (vira irmão). Pairar sobre um **ramo fechado o abre sozinho**, para você percorrer as ramificações (fecha de novo ao sair). Segure o **botão do meio do mouse** para mover o quadro durante o arraste, a roda dá zoom e **Esc** cancela; depois de cada movimento aparece **Desfazer** |
| Excluir | **Excluir** (pede confirmação se houver ideias abaixo) |

**Salvar como…** e **Salvar uma cópia…** (no menu de apresentações, ou **Ctrl+Shift+S**) criam outra apresentação a partir da atual com o nome que você digitar: o arquivo e as imagens são copiados para `presentations/<nome>/`, para você guardar versões e evitar perdas. *Salvar como* abre a cópia; *Salvar uma cópia* mantém você onde está. Nomes repetidos ganham um sufixo numérico.

O **salvamento é automático** (o estado aparece ao lado do nome: *Salvo / Salvando… / Erro ao salvar*).
O menu no canto superior esquerdo troca, cria ou exclui apresentações.

---

## Usando a skill

A skill transforma contexto em mapa. Resumo do fluxo (detalhes em [`docs/skill.pt-BR.md`](docs/skill.pt-BR.md)):

1. O agente garante o servidor: `node skills/context-maps/scripts/rm.mjs serve`.
2. Lê o contexto relevante (código, README, specs, diagramas existentes).
3. Escreve um **outline** em markdown:

   ```markdown
   # Fluxo de login [img:docs/capa.png|Capa]
   - Autenticar {color=#c76a61}
     - Validar credenciais [link:https://owasp.org/|OWASP]
     - Fluxo detalhado [mermaid:docs/login.mmd]
   - Sessão
     - Renovar token
   ```
4. Valida e publica:

   ```bash
   node skills/context-maps/scripts/rm.mjs validate --outline mapa.md
   node skills/context-maps/scripts/rm.mjs create   --outline mapa.md --id fluxo-login
   ```
5. Recebe a URL (`http://127.0.0.1:4173/?p=fluxo-login`), o arquivo gerado e um relatório (nós, mídias,
   itens pulados).

Exemplos de pedidos: *"mapa da arquitetura deste repositório"*, *"mapa dos fluxos de pagamento com os
diagramas do `docs/`"*, *"transforme esta especificação em um mapa para a reunião de amanhã"*.

### Compatibilidade com agentes

| Agente | Como a skill é encontrada | Status |
| --- | --- | --- |
| **Claude (Claude Code)** | `skills/context-maps/SKILL.md` (copie para `~/.claude/skills/` para uso global) | Formato nativo |
| **Codex** | `AGENTS.md` na raiz aponta para o `SKILL.md` | Preparado; não testado |
| **Cursor** | `.cursor/rules/context-maps.mdc` e `AGENTS.md` | Preparado; não testado |

O trabalho pesado fica em um CLI Node (`rm.mjs`), então qualquer agente com acesso ao terminal consegue usar.

> As instruções para agentes (`SKILL.md`, `schema.md`, `AGENTS.md`) estão em inglês, com cópias em português
> (`SKILL.pt-BR.md`, `schema.pt-BR.md`). As mensagens do CLI seguem `RM_LANG=en|pt` (padrão: idioma do sistema).

---

## Formato dos dados

```json
{
  "id": "meu-fluxo",
  "title": "Nome da apresentação",
  "roots": [{
    "id": "root",
    "title": "Primeiro card raiz",
    "x": 0, "y": 0,
    "children": [
      {
        "id": "n-1a2b3c4d",
        "title": "Ideia",
        "color": "#c76a61",
        "linksColor": "#ffffff",
        "subtitle": "Texto de apoio exibido ao passar o mouse",
        "images": [
          {"src": "presentations/meu-fluxo/assets/tela.png", "alt": "Tela inicial"},
          {"src": "presentations/meu-fluxo/assets/d.svg", "alt": "Diagrama", "kind": "diagram", "source": "flowchart TD…"}
        ],
        "links": [{"url": "https://exemplo.com/docs", "label": "Docs"}],
        "children": []
      }
    ]
  }]
}
```

Referência completa e boas práticas de modelagem: [`skills/context-maps/schema.md`](skills/context-maps/schema.md).

## API do servidor

Escuta apenas em `127.0.0.1`. Todas as rotas respondem JSON e `Cache-Control: no-store`.

| Método e rota | Função |
| --- | --- |
| `GET /api/presentations` | Lista (`id`, `title`, `updatedAt`) |
| `POST /api/presentations` | Cria (`{title, id?}`) |
| `GET /api/presentations/:id` | Lê |
| `PUT /api/presentations/:id` | Salva `{title, roots}` (o antigo `{tree}` ainda é aceito; valida ids únicos, profundidade ≤ 40, mídias/links ≤ 50 por nó) |
| `POST /api/presentations/:id/copy` | Copia a apresentação com um novo nome (`{title}`), incluindo as imagens |
| `DELETE /api/presentations/:id` | Remove o arquivo e as imagens |
| `POST /api/presentations/:id/assets?name=…` | Envia imagem (png, jpg, webp, gif, svg; até 15 MB) |

Segurança básica: sem acesso a arquivos fora da pasta do app/`presentations/`, só links http/https, e o
Mermaid roda em `securityLevel: strict`.

---

## Testes

`npm test` roda os testes de modelo (Node). Os demais usam Playwright e Chrome instalados:

```bash
export PLAYWRIGHT_MODULE=file:///caminho/para/playwright-core/index.mjs   # caminho absoluto
node tests/edit.mjs      # EDIT-01..25  edição, diagramas, mídias, links (sobe servidor temporário)
node tests/skill.mjs     # SKILL-01..06 CLI da skill (sobe servidor temporário)
node tests/browser.mjs   # MAP-01..11   navegação, zoom, modo texto, mobile, tela cheia
node tests/cards.mjs     # CARD-01..06  títulos, raiz, teclado, imagens
node tests/motion.mjs    # MOT-01..05   animações e movimento reduzido
```

`browser`, `cards` e `motion` esperam um servidor ativo (`PREVIEW_URL`, padrão `http://127.0.0.1:4173`)
**com os dados de demonstração**: rode-os contra um servidor com `PRESENTATIONS_DIR` vazio ou temporário
para não depender das suas apresentações. `BROWSER_EXECUTABLE` escolhe o Chrome/Chromium.

---

## Limitações conhecidas

- **Sem ligações cruzadas** entre ideias (a estrutura é uma árvore). Ciclos viram texto ou diagrama.
- **Reordenar** ideias ou mídias por arrastar ainda não existe.
- **Diagramas via CLI** exigem `mmdc` (mermaid-cli); no editor do app o Mermaid já vem embutido.
- URLs remotas de imagem **não são baixadas** pela skill (use arquivos locais).
- Mobile: arrastar com um dedo e botões de zoom; pinch não implementado.
- Remover uma mídia não apaga o arquivo em `assets/`.
- Uso pensado para **máquina local, usuário único**: não há autenticação nem edição simultânea.

## Terceiros

`vendor/mermaid.min.js` — [Mermaid](https://github.com/mermaid-js/mermaid) 12.2.0, licença MIT
(`vendor/mermaid.LICENSE`). Carregado sob demanda apenas pelo editor de diagramas.

## Origem

O comportamento do visualizador foi inspirado na observação de um visualizador de mapas mentais público.
Conteúdo, ilustrações, código e textos deste repositório são originais; nada da referência foi copiado.
