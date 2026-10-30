# Diário do Flow Bot

Canal entre as IAs (Claude, ChatGPT) e o responsável pelo produto. Antes de mexer: `git pull`, ler "Em andamento" e
"Recados". Depois de cada mudança enviada: uma entrada no topo de "Diário".

## Decisões do responsável

- 2026-10-30: licença **MIT** (D-007).
- 2026-10-30: a fundação `f0dee45` é a base oficial (D-008); nada de projeto paralelo.
- 2026-10-30: IA só prepara e testa configurações; o runtime nunca chama IA (D-001).
- 2026-10-30: **retenção de 90 dias** para mensagens recebidas e histórico de decisões; o aprendizado continua por
  agregados anônimos (perguntas sem resposta, assuntos, escolhas de menu), sem telefone nem nome.

## Em andamento

- Nenhuma tarefa reservada.

## Pendências que dependem do responsável

- Nenhuma no momento.

## Recados

- **Para o ChatGPT:** a base oficial é este repositório. Propostas de arquitetura e especificação podem entrar como
  documento em `docs/` ou recado aqui; o Claude implementa e testa.

## Diário

### 2026-10-30 — Claude — Correção: CI vermelha no envio do aprendizado

- A CI do commit `dd2bc08` falhou (eu tinha relatado como "rodando"): o teste da limpeza de 90 dias, com relógio
  adiantado e rodando em paralelo, apagava o histórico de outro teste porque `limparAntigos` valia para o banco todo.
  `limparAntigos` ganhou o filtro opcional `workspaceId` (como as filas) e o teste usa esse filtro. Suíte completa
  estável em 6 rodadas. Em produção não havia efeito (um relógio só), mas o isolamento agora é explícito.

### 2026-10-30 — Claude — Serviço do Flow Bot com a Evolution

- Plano do responsável: Flow (sistema) + Flow Bot (automação, para este e outros sistemas) + Evolution gratuita
  (WhatsApp). `@flow-bot/channel-evolution` (lê aviso, envia texto, liga webhook), `@flow-bot/server` (HTTP com
  segredo em tempo constante, realidade e encaminhamento por HTTP com token, webhook de fluxo só HTTPS público,
  laços de prazos/entregas/limpeza, comando `flow-bot-server`), `Dockerfile` e `deploy/` (Postgres, Redis, Evolution,
  Flow Bot). D-013, `docs/INTEGRATION.md`, `deploy/README.md`.
- Testes: ponta a ponta com Evolution e sistema falsos sobre Postgres real (realidade, idempotência, sem loop,
  encaminhamento, menu numerado). Build de produção reproduzido numa cópia limpa; servidor subiu e respondeu.
- Sem Docker no ambiente da sessão: a imagem em si não foi construída aqui (o compose foi validado).

### 2026-10-30 — Claude — Aprendizado anônimo e retenção de 90 dias

- `anonimizar` (telefone, e-mail, documento, link, valor, número longo, nome do contato; sem acento e pontuação),
  tabelas `learning_phrases`/`learning_phrase_contacts`/`learning_counters` (migração 0003), `perguntasSemResposta`
  (só frases vistas por 3+ pessoas), `contadores`, `limparAntigos` (90 dias). D-012 e `docs/LEARNING.md`.
- Testes: 143 (34 de persistência, estáveis em 5 rodadas), 18/18 cenários do Flow.
- Para o ChatGPT: a próxima peça natural é o "pacote de autoria" — instrução e formato para a IA transformar
  `perguntasSemResposta` + perfil de realidade em propostas de gatilhos/respostas/cenários (Fase de AI Authoring).

### 2026-10-30 — Claude — Variável de realidade e preset do Flow

- Pedido do responsável: "variável de realidade do Flow", fluxos do Flow e usar o sistema como modelo em outros
  sistemas. `PerfilDeRealidade` + namespace `reality.*` (contratos, motor, simulador, Postgres), D-011,
  `docs/REALITY.md` (passo a passo para outro sistema).
- `presets/flow`: perfil `flow/v1` (10 fatos), fluxo de atendimento (28 nós) e 18 cenários; roda na CI
  (`npm run simular:flow`). O simulador achou "vocês estão abertos?" sem resposta (só havia "aberto"); corrigido.
- Próximo passo natural: o Flow (cortai-app) implementar a função de realidade `flow/v1` a partir do motor oficial
  (agenda, catálogo, horário) — depende de autorização no repositório do Flow.

### 2026-10-30 — Claude — Persistência e execução durável (Postgres)

- `@flow-bot/store-postgres`: `migrar`, `FlowBot.publicar` (versão imutável + checksum), `receberMensagem`
  (idempotente, trava por conversa, tudo numa transação), `processarVencidos` (prazos duráveis), `entregarPendentes`
  (caixa de saída com idempotência, novas tentativas e ordem por conversa), `cancelarPendentes`, `historico`.
- Os testes acharam um defeito real: o `RETURNING` do Postgres não garante ordem e duas respostas podiam sair
  trocadas; agora a entrega respeita a ordem por conversa (teste dedicado).
- Testes: 108 com Postgres (15 de persistência, estáveis em 10 rodadas seguidas); CI ganhou serviço Postgres 16.

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
