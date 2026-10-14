# Response Maps preview

## Problem Statement

Conferir uma primeira implementação original dos comportamentos observados, sem copiar conteúdo ou código da referência.

## Goals

Mapa estático local com quatro ramos, leitura alternativa e navegação espacial.

## Out of Scope

Backend, autenticação, edição, persistência, publicação e conteúdo da referência.

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Conteúdo | Cidades habitáveis, original, 17 nós | Demonstra hierarquia sem cópia | Assumido |
| Estado | Memória; reload reinicia | Prévia sem backend | Assumido |
| Mobile | Enquadrar inicialmente | Evitar corte observado na referência | Assumido |
| Dependências | HTML CSS JS nativos | Sem build nem runtime externo | Assumido |

Open questions: none; defaults acima são reversíveis. Dimensões presentes: limites de zoom e transições de estado; demais dimensões N/A por ser visualizador local de dados fixos.

## User Stories

### P1: Explorar e ler

Acceptance Criteria:

1. WHEN abrir o mapa THEN o sistema SHALL mostrar raiz e quatro ramos, total 5 nós (MAP-01).
2. WHEN expandir tudo THEN o sistema SHALL mostrar 17 nós; recolher tudo retorna a 5 (MAP-02).
3. WHEN alternar um ramo THEN o sistema SHALL mostrar ou ocultar somente seus três filhos (MAP-03).
4. WHEN alternar modo textual e voltar THEN o sistema SHALL preservar expansão e câmera, exibindo todos os 17 títulos no texto (MAP-04).
5. WHEN usar zoom THEN o sistema SHALL limitar escala entre 0.15 e 2.5 e manter o ponto de ancoragem (MAP-05).
6. WHEN arrastar o fundo THEN o sistema SHALL deslocar a câmera sem abrir imagem (MAP-06).
7. WHEN abrir a imagem e pressionar Escape THEN o sistema SHALL fechar o diálogo e devolver foco ao botão de imagem (MAP-07).
8. WHEN carregar em 390x844 ou 1280x720 THEN o sistema SHALL enquadrar os cinco nós iniciais dentro da área do mapa (MAP-08).

## Edge Cases

IF zoom ultrapassar limites THEN o sistema SHALL manter escala no intervalo MAP-05.
WHEN recarregar THEN o sistema SHALL retornar ao estado inicial MAP-01.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MAP-01 | P1 | Execute | Verified |
| MAP-02 | P1 | Execute | Verified |
| MAP-03 | P1 | Execute | Verified |
| MAP-04 | P1 | Execute | Verified |
| MAP-05 | P1 | Execute | Verified |
| MAP-06 | P1 | Execute | Verified |
| MAP-07 | P1 | Execute | Verified |
| MAP-08 | P1 | Execute | Verified |

## Success Criteria

Testes de modelo e navegador passam; inspeção visual desktop e mobile; revisão independente.
