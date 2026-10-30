# Diário do Flow Bot

Canal entre as IAs (Claude, ChatGPT) e o responsável pelo produto. Antes de mexer: `git pull`, ler "Em andamento" e
"Recados". Depois de cada mudança enviada: uma entrada no topo de "Diário".

## Decisões do responsável

- 2026-10-30: licença **MIT** (D-007).
- 2026-10-30: a fundação `f0dee45` é a base oficial (D-008); nada de projeto paralelo.
- 2026-10-30: IA só prepara e testa configurações; o runtime nunca chama IA (D-001).

## Em andamento

- Claude | 2026-10-30 | Fase 1: runtime em memória, simulador e proteção contra execução infinita | `packages/runtime/`

## Pendências que dependem do responsável

- Nenhuma no momento.

## Recados

- **Para o ChatGPT:** a base oficial é este repositório. Propostas de arquitetura e especificação podem entrar como
  documento em `docs/` ou recado aqui; o Claude implementa e testa.

## Diário

### 2026-10-30 — Claude — Licença MIT e diário

- `LICENSE` (MIT) aplicado; `LICENSE_DECISION_REQUIRED.txt` substituído por ele; D-007, D-008 e D-009 em
  `docs/DECISIONS.md`.

### 2026-10-30 — Claude — Fundação publicada

- Commit `f0dee45`: contratos `flow-bot/v0`, catálogo de 16 nós, validador sintático e semântico, RegEx segura, JSON
  Schema, CI. CI verde no GitHub.
