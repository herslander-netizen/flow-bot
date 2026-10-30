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

## D-007 — Licença do repositório próprio ainda não fixada

**Recomendação:** MIT para código original, desde que o responsável confirme a intenção de permitir reutilização e distribuição ampla. A licença final deve ser adicionada antes da publicação pública do código.
