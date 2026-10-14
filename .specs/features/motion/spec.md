# Movimento e conexões

## Problem Statement

Abertura instantânea e conexões sem feedback não conduzem atenção.

## Goals

Abertura suave e realce da conexão ao primeiro filho; hover na conexão de entrada.

## Out of Scope

Mudanças de dados, câmera automática nova, editor, publicação ou cópia de código da referência.

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Duração | Layout 420 ms, apresentação 1000 ms | Curto e perceptível | Assumido |
| Hover | Apenas conexão de entrada | Corresponde à linha até o card | Assumido |
| Movimento reduzido | Layout imediato, realce sem desenho animado | Acessibilidade | Assumido |

Open questions: none. Transições concorrentes e movimento reduzido cobertos; demais dimensões N/A por ser visualizador local.

## User Stories

### P1: Guiar atenção

Acceptance Criteria:

1. WHEN abrir um ramo THEN o sistema SHALL interpolar posições dos cards e suas conexões por 420 ms, sem salto direto ao estado final (MOT-01).
2. WHEN abrir um ramo THEN o sistema SHALL destacar somente sua conexão ao primeiro filho por 1000 ms, com desenho progressivo da linha (MOT-02).
3. WHEN o ponteiro entrar em um card não raiz THEN o sistema SHALL aumentar espessura e brilho de sua conexão de entrada, retornando ao padrão ao sair (MOT-03).
4. IF movimento reduzido estiver ativo THEN o sistema SHALL posicionar imediatamente, sem desenho progressivo, preservando realce estático e hover (MOT-04).
5. WHEN ocorrer nova alternância durante animação THEN o sistema SHALL cancelar efeitos antigos e terminar no estado solicitado, sem conexões órfãs ou destaques presos após 1200 ms (MOT-05).

## Edge Cases

WHEN abrir a raiz recolhida THEN o sistema SHALL apresentar a conexão ao primeiro ramo (MOT-02).
WHEN passar sobre a raiz sem conexão de entrada THEN o sistema SHALL deixar as conexões sem hover (MOT-03).

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MOT-01 | P1 | Execute | Pending |
| MOT-02 | P1 | Execute | Pending |
| MOT-03 | P1 | Execute | Pending |
| MOT-04 | P1 | Execute | Pending |
| MOT-05 | P1 | Execute | Pending |

## Success Criteria

Regressões anteriores e teste motion.mjs passam; inspeção visual e Verifier independente. Uma entrega atômica, sem tasks formal.
