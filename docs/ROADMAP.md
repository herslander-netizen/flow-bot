# Roadmap de implementação

## Situação (30/10/2026)

| Fase                                    | Situação                                               |
| --------------------------------------- | ------------------------------------------------------ |
| 0 — Fundação e auditoria                | Concluída (`f0dee45`, licença MIT)                     |
| 1 — Contratos e DSL                     | Concluída na fundação (schema, validador, JSON Schema) |
| 2 — Runtime em memória                  | **Em andamento** (inclui simulador e limite de passos) |
| 3 — Persistência e execução durável     | A fazer                                                |
| 4 — Editor visual e simulador visual    | A fazer                                                |
| 5 — Adapter de canal                    | A fazer                                                |
| 6 — AI Authoring externo                | A fazer                                                |
| 7 — Futuro (integração com o Flow SaaS) | A fazer                                                |

## Fase 0 — Fundação e auditoria

- criar repositório público independente `herslander-netizen/flow-bot`;
- definir licença própria (recomendação MIT, sujeita à confirmação);
- configurar TypeScript, lint, testes e CI;
- registrar decisões e matriz de licenças/dependências;
- nenhum provider WhatsApp e nenhuma chamada de IA no runtime.

## Fase 1 — Contratos e DSL

- JSON Schema versionado;
- tipos de fluxo/nó/aresta;
- validador sintático e semântico;
- formato de importação/exportação;
- fixtures de exemplo.

**Aceite:** arquivos válidos passam; fluxos inválidos apontam erro preciso com nó/campo.

## Fase 2 — Runtime determinístico em memória

- matcher de regras;
- interpretador de nós;
- variáveis tipadas;
- sessão por conversa;
- espera por entrada;
- menus e condições;
- limite de passos e prevenção de loop.

**Aceite:** testes unitários cobrem o catálogo inicial sem banco ou provider externo.

## Fase 3 — Persistência e execução durável

- armazenar versões publicadas;
- persistir sessão e variáveis;
- eventos inbound idempotentes;
- fila de atrasos/timeouts/retries;
- exclusão/expiração e locks por conversa.

**Aceite:** reiniciar processo no meio de uma espera não perde a conversa e não duplica respostas.

## Fase 4 — Editor visual e simulador

- React Flow para canvas;
- painéis de configuração por nó;
- validação visual;
- simulação de conversa;
- execução passo a passo e logs.

**Aceite:** editar grafo, salvar, carregar e simular sem alterar o runtime publicado.

## Fase 5 — Adapter de canal

- começar com mock/test adapter;
- definir contrato inbound/outbound;
- implementar um provider WhatsApp somente após avaliação de custo, estabilidade e termos;
- callbacks, entrega, status e mídia conforme suporte.

**Aceite:** mesmo fluxo funciona no simulador e no adapter de teste; duplicidade não gera duas respostas.

## Fase 6 — AI Authoring externo

- instrução e schema para ferramentas externas;
- importação de pacote gerado;
- validação, cenários de teste e diff;
- aprovação humana e publicação.

**Aceite:** pacote gerado por IA nunca vai direto a produção sem passar pelos validadores e pela aprovação.

## Fase 7 — Futuro

- integração opcional com o Flow SaaS via API/webhook;
- pacotes de modelos por segmento;
- analytics avançado e gestão de múltiplos canais/workspaces.
