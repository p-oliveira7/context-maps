# Cards interativos

## Problem Statement

O título não recolhe ramos e apenas a raiz admite imagem. Corrigir ambos conforme pedido do usuário.

## Goals

Título interativo até a raiz; mídia opcional em qualquer nível.

## Out of Scope

Editor/upload, persistência, publicação e alterações de pan/zoom.

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Reabrir | Preservar expansão interna | Não perder exploração | Assumido |
| Recolher tudo | Manter comportamento de 5 nós; título raiz permite 1 | Pedido é clique no card | Assumido |
| Mídia | Campo image com src e alt; SVG original de exemplo | Sem editor solicitado | Assumido |

Open questions: none. Estado e separação de cliques são as dimensões presentes; demais N/A, dados locais fixos.

## User Stories

### P1: Cards

Acceptance Criteria:

1. WHEN clicar no título de um ramo com filhos THEN o sistema SHALL alternar seus três filhos sem mudar ramos irmãos (CARD-01).
2. WHEN clicar no título da raiz THEN o sistema SHALL alternar entre somente raiz e o conjunto anteriormente visível, sem erros (CARD-02).
3. WHEN usar Enter ou Espaço em um título com filhos THEN o sistema SHALL alternar o ramo e preservar foco no título recriado (CARD-03).
4. WHERE um nó possui image o sistema SHALL exibir essa imagem e alt em raiz, ramo ou folha, no mapa e na leitura (CARD-04).
5. WHEN clicar em imagem de qualquer nível THEN o sistema SHALL abrir a imagem correta sem alterar expansão; Escape fecha e restaura foco ao botão da mesma imagem (CARD-05).
6. WHERE um nó não possui imagem o sistema SHALL renderizar apenas seu texto sem imagem substituta (CARD-06).

## Edge Cases

WHEN recolher raiz expandida e alternar modo texto THEN o sistema SHALL manter somente a raiz ao voltar (CARD-02).
WHERE o nó não possui filhos o sistema SHALL manter o título não interativo (CARD-01).

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CARD-01 | P1 | Execute | Pending |
| CARD-02 | P1 | Execute | Pending |
| CARD-03 | P1 | Execute | Pending |
| CARD-04 | P1 | Execute | Pending |
| CARD-05 | P1 | Execute | Pending |
| CARD-06 | P1 | Execute | Pending |

## Success Criteria

Gates anteriores e novo teste de cards passam. Verifier independente, mutações e inspeção visual. Uma entrega atômica: componente de card, dados de exemplo e testes; Tasks formal omitido.
