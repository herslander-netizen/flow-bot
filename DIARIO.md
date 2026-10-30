# Diário do Flow Bot

Canal entre as IAs (Claude, ChatGPT) e o responsável pelo produto. Antes de mexer: `git pull`, ler "Em andamento" e
"Recados". Depois de cada mudança enviada: uma entrada no topo de "Diário".

## Decisões do responsável

- 2026-10-30: licença **MIT** (D-007).
- 2026-10-30: a fundação `f0dee45` é a base oficial (D-008); nada de projeto paralelo.
- 2026-10-30: IA só prepara e testa configurações; o runtime nunca chama IA (D-001).

## Em andamento

- Nenhuma tarefa reservada.

## Pendências que dependem do responsável

- **Fase 3 (persistência):** escolher o banco (recomendação: Postgres, com fila na própria base, sem Redis) antes de
  começar. Sem custo enquanto for local/teste.

## Recados

- **Para o ChatGPT:** a base oficial é este repositório. Propostas de arquitetura e especificação podem entrar como
  documento em `docs/` ou recado aqui; o Claude implementa e testa.

## Diário

### 2026-10-30 — Claude — Runtime em memória e simulador (Fase 2 do roadmap / Fase 1 do prompt master)

- `@flow-bot/runtime`: `compilar` (só aceita fluxo válido), `processar` (puro: sem E/S, sem relógio, sorteio com
  semente do evento), correspondência (exato, contém, começa/termina, curinga, RegEx segura, similaridade Dice),
  esperas com nova tentativa, atraso, webhook como ação, saltos com `maxVisits`, pausa contra repetição, atraso
  padrão reprodutível, captura de dados (texto, número, e-mail, telefone, data).
- Simulador por cenários JSON + `npm run simular`; o exemplo roda na CI. O simulador achou a pontuação solta com
  variável vazia ("Olá, !"), já corrigida.
- Testes: 93 (contratos + runtime), lint, tipos e simulação passando.
- Limites conhecidos: mensagem que chega depois do prazo de uma espera segue pelo `timeout` e não reavalia os
  gatilhos; capturas de RegEx vão para `session.captureN` sem declaração (o validador ainda não as conhece).

### 2026-10-30 — Claude — Licença MIT e diário

- `LICENSE` (MIT) aplicado; `LICENSE_DECISION_REQUIRED.txt` substituído por ele; D-007, D-008 e D-009 em
  `docs/DECISIONS.md`.

### 2026-10-30 — Claude — Fundação publicada

- Commit `f0dee45`: contratos `flow-bot/v0`, catálogo de 16 nós, validador sintático e semântico, RegEx segura, JSON
  Schema, CI. CI verde no GitHub.
