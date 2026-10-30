# Decisões arquiteturais iniciais (ADRs resumidos)

## D-001 — IA não participa do atendimento em tempo real

**Decisão:** o runtime é determinístico e não possui dependência de LLM. IA só prepara, atualiza e testa rascunhos de configuração externamente ou em uma camada de autoria separada.

**Motivo:** custo previsível, respostas consistentes, auditabilidade e autonomia operacional.

## D-002 — Fluxo declarativo como contrato canônico

**Decisão:** JSON/DSL versionado, independente da biblioteca de editor.

**Motivo:** editor, IA e runtime não ficam acoplados ao formato de estado interno do React Flow.

## D-003 — Sessões persistentes e execução durável

**Decisão:** guardar estado/cursor/variáveis da conversa e usar jobs duráveis para esperas.

**Motivo:** reinícios e falhas não podem perder timers nem duplicar respostas.

## D-004 — Separação de canal e motor

**Decisão:** conectores de mensageria ficam em adapters; núcleo é channel-agnostic.

**Motivo:** permitir WhatsApp e outros canais sem reescrever regras e fluxos.

## D-005 — Referências MIT como primeiras opções de código

**Decisão:** avaliar WhatsApp Flow, React Flow e XState como referências; qualquer reutilização será feita módulo a módulo com avisos de licença preservados.

**Motivo:** utilidade técnica e maior clareza de permissões. Typebot (FSL) e WA Convo (GPL-3.0) permanecem apenas como referências de ideias enquanto não houver decisão jurídica.

## D-006 — Projeto independente do Flow SaaS

**Decisão:** o repositório Flow Bot é autônomo; integração futura será por contratos públicos/API.

**Motivo:** evoluir o motor sem risco ao sistema em produção e sem alterar o repositório atual do Flow.

## D-007 — Licença MIT (decidida em 30/10/2026)

**Decisão:** o código original do Flow Bot é MIT (`LICENSE`). Avisos de copyright e licenças de dependências e de
código de terceiros reaproveitado continuam preservados.

**Motivo:** permitir reutilização ampla, inclusive pelo Flow SaaS no futuro, sem atrito. Confirmado pelo responsável
pelo produto.

## D-008 — Fundação adotada como base oficial (30/10/2026)

**Decisão:** a fundação publicada no commit `f0dee45` (contratos `flow-bot/v0`, validador, JSON Schema, CI) é a base
oficial. O "Flow_Bot_Starter_0.1.0.zip" citado em instruções não foi encontrado; se aparecer, o que tiver de útil
entra nesta base em commits pequenos, sem criar projeto paralelo.

## D-009 — Runtime puro e determinístico

**Decisão:** `@flow-bot/runtime` processa um evento (mensagem, fim de prazo, resultado de webhook) sobre uma sessão e
devolve a nova sessão, as ações a executar e o rastro da decisão, sem E/S, relógio ou aleatoriedade própria: o tempo
vem no evento e o sorteio usa semente registrada. Persistência, fila e canais ficam em camadas de fora (Fase 2).

**Motivo:** reprodutível em testes e no simulador; a mesma entrada sempre gera a mesma saída; fácil de auditar.

## D-010 — Postgres para persistência e fila (30/10/2026)

**Decisão:** `@flow-bot/store-postgres` guarda versões, conversas, eventos, prazos, caixa de saída e histórico no
schema `flow_bot` de um Postgres. A fila de prazos e de entregas é a própria base (`FOR UPDATE SKIP LOCKED`), sem
Redis ou serviço extra. Testes rodam contra Postgres real (local ou serviço da CI).

**Motivo:** um serviço só, transações que juntam estado e efeitos (tudo ou nada), custo zero para desenvolver.
Aprovado pelo responsável pelo produto.

**Limites conhecidos:** atraso mínimo real depende de quantas vezes o laço chama `processarVencidos`/
`entregarPendentes`; a ordem por conversa faz uma resposta com falha segurar as seguintes até desistir; retenção dos
eventos e do histórico ainda não definida (dados de conversa).

## D-011 — Realidade como contrato com o sistema hospedeiro (30/10/2026)

**Decisão:** fatos que mudam no mundo real entram só pelo namespace `reality.*`, definidos por um perfil versionado
do hospedeiro (`flow/v1` é o primeiro) e entregues a cada evento. O fluxo declara o perfil, só lê os fatos e o
validador confere cada um. Fato ausente fica registrado e reprova a simulação.

**Motivo:** pedido do responsável pelo produto ("variável de realidade do Flow", e usar o sistema como modelo em
outros sistemas). Separa o motor (igual para todos) do conhecimento do negócio (de cada hospedeiro) e impede respostas
inventadas.
