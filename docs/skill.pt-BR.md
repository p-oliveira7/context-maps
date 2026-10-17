# Guia da skill `context-maps`

**Português (BR)** · [English](skill.md)

Este guia explica **o que a skill faz, por que existe, como instalá-la e como tirar bom proveito dela**.
O procedimento operacional que o agente segue está em
[`skills/context-maps/SKILL.md`](../skills/context-maps/SKILL.md); o formato dos dados e as boas práticas
de modelagem estão em [`skills/context-maps/schema.md`](../skills/context-maps/schema.md).

## 1. Propósito

> Transformar contexto de uma aplicação (código, specs, fluxos, decisões) em uma apresentação em mapa
> mental navegável e editável, sem montar nada à mão.

A skill resolve um problema recorrente: documentar ou apresentar um sistema exige reunir texto, diagramas
e evidências. Em vez de escrever slides, você pede ao agente, que:

1. **lê** o material do projeto;
2. **estrutura** o conhecimento como árvore (fluxo, arquitetura ou ambos);
3. **anexa** imagens, diagramas Mermaid e links;
4. **publica** na API do app local e devolve a URL.

O mapa resultante é um JSON no repositório: revisável em PR, ajustável no modo **Editar** e regerável quando
o sistema muda.

## 2. Quando usar (e quando não)

| Use quando… | Evite quando… |
| --- | --- |
| Precisa explicar um sistema/processo para outras pessoas | O objetivo é documentação textual longa (use docs) |
| Quer visão geral navegável: do macro ao detalhe | Precisa de relações cruzadas complexas (grafos) |
| Tem diagramas e prints espalhados e quer reuni-los | O conteúdo é confidencial e o agente roda em nuvem sem política de dados |
| Quer um ponto de partida para editar à mão | Precisa de edição simultânea por várias pessoas |

## 3. Como funciona

```
pedido do usuário
      │
      ▼
 1 serve  ──────────  garante o servidor em 127.0.0.1:4173
 2 coletar contexto ─ código, README, specs, diagramas existentes
 3 modelar ─────────  escolhe fluxo / arquitetura / ambos
 4 outline (.md) ───  árvore + marcadores [img] [mermaid] [link] {color}
 5 validate ────────  avisos: títulos longos, profundidade, nós largos
 6 create ──────────  POST/PUT na API, upload de mídias, renderiza mermaid
 7 entregar ────────  URL, arquivo, contagem de nós, itens pulados
```

### Por que um *outline* markdown e não o JSON direto?
Listas indentadas são o formato mais natural e menos propenso a erro para um modelo de linguagem: não há
ids para inventar, vírgulas para esquecer nem chaves para balancear. O CLI converte o outline em JSON,
gera ids únicos, valida e envia.

### Por que usar a API do servidor?
A API é o único ponto que valida estrutura, protege contra caminhos inválidos e grava de forma atômica.
Escrever o arquivo direto contornaria essas regras e duplicaria lógica. Se o servidor estiver fora do ar, a
skill o inicia (`serve`) ou informa o comando manual — nunca grava em `presentations/` por fora.

## 4. Instalação

### Claude (Claude Code)
A skill já está no repositório em `skills/context-maps/`. Para usá-la em **qualquer** projeto, copie a
pasta para o diretório de skills do usuário:

```bash
# macOS / Linux
cp -r skills/context-maps ~/.claude/skills/context-maps
# Windows (PowerShell)
Copy-Item -Recurse skills\context-maps $env:USERPROFILE\.claude\skills\context-maps
```

Quando a skill é usada **fora** do repositório do app:

- chame o CLI pelo caminho absoluto de `rm.mjs`;
- inicie o servidor manualmente (`node /caminho/context-maps/server.mjs`) ou defina `RM_URL` apontando
  para um servidor já ativo — o comando `serve` só encontra o `server.mjs` quando a skill está na pasta do app.

### Codex e Cursor
O repositório inclui `AGENTS.md` (Codex; também reconhecido pelo Cursor) e
`.cursor/rules/context-maps.mdc`. Ambos apontam para o mesmo `SKILL.md`, que é a fonte única das
instruções. O formato e as referências são verificados automaticamente (`npm test`: front matter, caminhos
existentes, todos os comandos do CLI documentados), mas eles **ainda não foram exercitados pelos apps reais do Codex
ou do Cursor**.

Para verificar um agente na mão (5 minutos), abra este repositório nele e peça: *"Monte um mapa da arquitetura deste
repositório com o Context Maps"*. Passou se o agente: (1) lê o `AGENTS.md` / a regra e o `SKILL.md`, (2) roda
`rm.mjs serve` e `validate` antes do `create`, (3) termina com uma URL que abre um mapa e (4) não grava arquivos em
`presentations/` diretamente. Depois peça *"atualize o mapa depois de acrescentar X"* e confira se ele usa
`rm.mjs update` (suas edições manuais precisam sobreviver). Registre o resultado numa issue.

## 5. Pré-requisitos e configuração

| Item | Obrigatório | Detalhe |
| --- | --- | --- |
| Node 18+ | Sim | Usa `fetch` nativo; sem pacotes |
| Servidor do app | Sim | `node server.mjs` (padrão `http://127.0.0.1:4173`) |
| `mmdc` (mermaid-cli) | Só para `[mermaid:…]` via CLI | `npm i -g @mermaid-js/mermaid-cli` |

| Variável | Uso |
| --- | --- |
| `RM_URL` | Endereço do servidor (padrão `http://127.0.0.1:4173`) |
| `RM_LANG` | Idioma das mensagens do CLI: `en` ou `pt` (padrão: idioma do sistema) |
| `MMDC` | Caminho do executável `mmdc` se não estiver no PATH |
| `MMDC_BROWSER` | Chrome/Chromium já instalado, para evitar baixar o do Puppeteer |

> Dica: instale o mermaid-cli com `PUPPETEER_SKIP_DOWNLOAD=1` e aponte `MMDC_BROWSER` para o Chrome que você
> já tem.

## 6. Referência do CLI (`rm.mjs`)

```bash
node skills/context-maps/scripts/rm.mjs <comando> [opções]
```

| Comando | Opções | Resultado |
| --- | --- | --- |
| `serve` | — | Inicia o servidor se não estiver ativo |
| `status` | — | JSON com as apresentações existentes |
| `validate` | `--outline f.md` | Estatísticas e avisos; **sai com código 3** se houver avisos |
| `create` | `--outline f.md` `[--id slug]` `[--dir pasta]` `[--title "…"]` `[--replace]` | Cria/sobrescreve, envia mídias, imprime relatório JSON |
| `update` | `--id slug` `--outline f.md` `[--prune]` `[--dry-run]` `[--title "…"]` | Mescla o outline numa apresentação existente (veja abaixo); imprime `added`, `updated`, `kept`, `removed` |
| `upload` | `<id> <arquivo>` | Envia uma imagem e imprime o `src` |

Códigos de saída: `0` ok · `1` erro · `2` servidor indisponível · `3` avisos na validação · `64` uso incorreto.

Exemplo de relatório do `create`:

```json
{
  "id": "fluxo-login",
  "url": "http://127.0.0.1:4173/?p=fluxo-login",
  "file": "presentations/fluxo-login.json",
  "nodes": 12, "depth": 3,
  "images": 2, "diagrams": 1, "links": 3,
  "warnings": [],
  "skipped": []
}
```

### Atualizando um mapa existente (`update`)

Quando o sistema muda, edite o outline e rode `update` em vez de `create --replace`. Ele mantém o que as pessoas fizeram no app:

- **Casamento:** as ideias são casadas pelo título (sem diferenciar maiúsculas e espaços extras), raiz com raiz e filho com filho. As ideias casadas mantêm `id`, cores, posição da raiz e imagens ou links adicionados à mão.
- **O outline vale para o que ele declara:** `[subtitle:…]`, `{color=…}` ou `{links=…}` no outline substituem o valor salvo; marcadores novos `[img:…]`, `[mermaid:…]` e `[link:…]` só entram se a ideia ainda não os tiver (imagens pelo texto alternativo, diagramas pelo código, links pela URL), então rodar duas vezes não muda nada.
- **Ordem e ideias novas:** os filhos seguem a ordem do outline; ideias que só existem no mapa ficam no fim (relatadas em `kept`) ou saem com `--prune` (`removed`). Uma ideia **renomeada** aparece como nova, e a antiga fica em `kept` até você usar `--prune`.
- **Rede de segurança:** `--dry-run` imprime o relatório sem alterar nada. O mapa salva automaticamente no app, então recarregue a página depois.

## 7. Formato do outline

```markdown
# Título da apresentação [img:docs/capa.png|Capa]
- Etapa 1 {color=#c76a61}
  - Ação ou decisão [link:https://exemplo.com/regra|Regra de negócio]
  - Fluxo detalhado [mermaid:docs/login.mmd]
- Etapa 2
  - Tela de login [img:docs/tela.png|Print da tela] [img:docs/erro.png|Estado de erro]
```

| Elemento | Regra |
| --- | --- |
| `# Título` | Primeira linha: primeiro card raiz e nome da apresentação; outras linhas `# Título` adicionam cards raiz independentes |
| `- item` | Uma ideia; **indentação** (2 espaços ou tab) define a hierarquia |
| `{color=#rrggbb}` | Cor do ramo; só tem efeito no primeiro nível |
| `{links=#rrggbb}` | Cor das linhas daquela ideia até as filhas |
| `[img:caminho\|alt]` | Imagem local (png, jpg, webp, gif, svg); `alt` opcional |
| `[mermaid:arquivo.mmd]` | Diagrama; renderizado com tema escuro e fundo transparente |
| `[link:https://…\|rótulo]` | Link http/https; rótulo opcional (padrão: domínio) |
| `[subtitle:texto]` | Texto de apoio exibido só ao passar o mouse no card (sem `]` dentro) |
| `[rel:Título de outra ideia]` | Ligação cruzada com outra ideia, pelo título exato; títulos desconhecidos ou ambíguos geram avisos |
| Vários marcadores | Repita à vontade; aparecem na ordem escrita |
| Caminhos | Relativos ao arquivo do outline; URLs remotas de imagem **não** são baixadas |

## 8. Como modelar bem o mapa

**Fluxo / jornada** — leitura da esquerda para a direita:
- raiz = o fluxo; ramos = etapas **na ordem** (prefixe com números se a ordem importa);
- filhos = ações, decisões ("Se token expirado → …") e falhas.

**Arquitetura**:
- raiz = o sistema; ramos = camadas ou módulos;
- filhos = responsabilidades, interfaces e dependências críticas;
- anexe `flowchart`, `sequenceDiagram` ou `erDiagram` para topologias e sequências.

**Ambos** — raiz = o sistema, com um ramo "Arquitetura" e outro "Fluxos".

Qualidade (o `validate` avisa quando passa dos limites):

- títulos curtos, em frase nominal, até ~90 caracteres;
- 3 a 7 filhos por nó (mais de 8 → agrupe);
- profundidade até 5 níveis (além disso, quebre em outra apresentação);
- sem repetir a mesma ideia em ramos diferentes;
- sem inventar: onde o contexto não responde, escreva **"A definir"**.

## 9. Exemplo completo

Pedido: *"monte um mapa da visão do sistema Context Maps, com diagramas e links das tecnologias."*

1. O agente lê `README.md`, `server.mjs`, `app.js` e `tests/`.
2. Escreve `sistema.md`:

   ```markdown
   # Context Maps — visão do sistema
   - Arquitetura {color=#6fa3d6}
     - Diagramas do sistema [mermaid:arquitetura.mmd] [mermaid:fluxo-edicao.mmd] [link:https://mermaid.js.org/|Mermaid]
     - App no navegador (HTML, CSS e módulos ES, sem dependências)
     - Servidor local (server.mjs, Node sem pacotes) [link:https://nodejs.org/api/http.html]
   - Fluxos {color=#d4a458}
     - Editar uma apresentação
       - Autosave envia a árvore completa para a API
   ```
3. `validate` → sem avisos; `create --id visao-do-sistema` → URL + relatório.

Um exemplo real gerado assim acompanha o repositório em `presentations/` ("visão do sistema").

## 10. Regras de segurança e boas maneiras do agente

- **Não sobrescrever** apresentações sem o usuário pedir (`--replace`); o CLI recusa se o `id` já existe.
- **Nunca apagar** apresentações pela skill.
- **Não copiar** conteúdo protegido; resumir com as próprias palavras.
- **Transparência:** reportar `warnings` e `skipped`.
- O servidor só escuta em `127.0.0.1` e o CLI não envia dados para fora da máquina.

## 11. Solução de problemas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `Servidor indisponível` / `Server unavailable` (código 2) | Servidor parado ou porta diferente | `rm.mjs serve` ou `node server.mjs`; ajuste `RM_URL` |
| `Já existe a apresentação "x"` / `Presentation "x" already exists` | `--id` repetido | Escolha outro `--id` ou, se o usuário pediu, `--replace` |
| Diagrama em `skipped` ("mmdc não encontrado") | mermaid-cli ausente | Instale-o ou defina `MMDC`/`MMDC_BROWSER` |
| Diagrama em `skipped` ("falha ao renderizar") | Erro de sintaxe Mermaid | Corrija o `.mmd` (teste no editor do app) |
| Imagem em `skipped` | Caminho errado ou URL remota | Use caminho local relativo ao outline |
| Aviso "título com N caracteres" | Texto longo | Resuma; use filhos para detalhar |
| Página em branco após atualizar | Cache do navegador com módulos antigos | Recarregue com `Ctrl+Shift+R` |

## 12. Limitações

- Estrutura em **árvore**; as ligações cruzadas (`[rel:…]`) são linhas pontilhadas simples, sem direção nem rótulo.
- Para trocar a ordem das ideias, edite o outline e rode `update` (ele segue a ordem do outline e mantém suas edições manuais).
- Mídias por URL remota não são baixadas.
- Renderização de Mermaid pelo CLI depende do `mmdc` externo (no editor do app já é embutido).
- Fora do app, Codex e Cursor foram preparados, mas **não testados**.
