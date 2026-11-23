# FlowBot — estratégia comercial e execução técnica
Data de referência: 23/11/2026. Estado: **proposta para validação**, não plano financeiro aprovado nem certificação de produção.

## Produto e posicionamento
FlowBot é um produto da **Alvo Digital** para atendimento comercial e automações adaptáveis ao negócio. O serviço de execução deste repositório (`flow-bot`) será o núcleo; o produto PWA (`flowbot`) deve oferecer configuração, Bot Studio, atendimento humano, observabilidade e governança. O SaaS **Flow** de agendamentos continua independente, integrável somente por contratos de API.

**Promessa vendável e verificável:** responder contatos rapidamente, qualificar pedidos, consultar fatos atuais, encaminhar ao profissional e, quando houver integração segura, executar ações confirmadas pelo sistema de origem. Não prometer IA ilimitada, mensagens sem custo nem redução percentual de faltas antes de medir.

**Arquitetura básica:** canal -> normalização/validação -> evento idempotente -> sessão/DSL versionada -> motor determinístico -> fila de ações -> adaptador. Acrescentar:
- **Realidade:** fatos read-only, tipados e atuais devolvidos pelo sistema responsável.
- **Ações:** catálogo declarativo de operações com input/output validado, limites, autorização por empresa, confirmação quando aplicável, chave idempotente e comprovação do resultado.
- **Controle humano:** tomar/retomar conversa, bloquear respostas automatizadas e cancelar jobs/saídas pendentes de modo transacional.
- **IA opcional:** autoria de fluxos offline; depois suporte a FAQ/RAG; agentes só propõem ações validadas pelo executor do servidor.
- **Consentimento:** propósitos, prova de opt-in, opt-out e política de canal antes de mensagens iniciadas pela empresa.
- **Operação:** métricas, alertas, dashboard por empresa, privacidade, retenção, exclusão, backup e restauração testada.

## Estratégia de entrada no mercado
**Decisão de produto proposta:** iniciar o piloto em **barbearias e salões com 2–8 profissionais**, especialmente onde já se mede volume de mensagens e agendamentos. Motivos: regras e integrações mais simples; possibilidade de reutilizar conhecimento adquirido no Flow sem acoplar os códigos; menor risco de dados sensíveis do que clínicas. **Clínicas permanecem no mercado-alvo futuro**, após controles para dados sensíveis, avaliação jurídica e validação de integrações. Esta é uma mudança deliberada em relação à sugestão da pesquisa preliminar que priorizava clínicas.

**Critérios do cliente piloto:** proprietário presente, volume suficiente de conversas recorrentes, disposição para medir indicadores de referência, autorização para um número de teste ou canal oficial, disponibilidade para testar handoff e pagar pelo valor percebido.

**Oferta de teste (hipótese, não preço anunciado):** implantação assistida por R$ 199 + mensalidade de R$ 149 por estabelecimento, durante até 60 dias, 1 canal e até 2 atendentes; limites de conversas e custos de mensagens/IA deverão constar de contrato e orçamento individual. Canais oficiais da Meta, BSP, taxas, templates e serviços externos são cobrados conforme tarifa vigente ou repassados de forma transparente. Não anunciar mensagens ilimitadas.

**Entrevistas de descoberta (10):** medir tempo de primeira resposta, mensagens repetitivas, perda de leads, cancelamentos, atendimento fora de horário, receio de bloqueio e teto de preço. Evitar perguntar só se a pessoa “gostaria de um bot”.

**Pilotos:** 3 estabelecimentos independentes com fluxos simples: informações/serviços, qualificação, confirmação de horário via sistema de origem quando autorizado, pedido de humano. Não integrar pagamentos, prontuários, campanhas em massa ou IA autônoma nesta etapa.

**Métricas com baseline antes/depois:** tempo mediano de primeira resposta, taxa de solicitações resolvidas sem humano, taxa de transferência, tentativas de envio ambíguas, agendamentos comprovados no sistema de origem, tempo de configuração, incidentes por 1.000 eventos, renovação paga e horas de suporte por cliente.

## Stack e decisões build / buy / integrate
| Componente | Decisão inicial | Justificativa |
| --- | --- | --- |
| Runtime | Manter TypeScript/JSON DSL/Zod/PostgreSQL próprios | Código existente e contratos auditáveis |
| Studio | Construir com React Flow (MIT) | Editor como representação, não fonte de execução |
| Inbox humano | MVP mínimo próprio **ou** integração posterior Chatwoot (núcleo MIT) | Avaliar custo real de RAM/CPU e licença de recursos utilizados |
| Ações e filas | Outbox transacional em PostgreSQL e adaptadores próprios | Evitar introduzir Redis/RabbitMQ prematuramente |
| Canais | Simulador e Evolution controlada para homologação; avaliar Cloud API oficial para clientes pagantes | Evitar prometer conformidade/estabilidade de conexão não oficial |
| IA | Opcional e desligada no piloto; testar propostas via APIs gratuitas somente dentro de suas cotas | Custo previsível e isolamento de dados |
| Infra | Validar capacidade real da Oracle/Evolution Alvo e Cloudflare; não acoplar ambientes sem autorização | Software gratuito ≠ custo operacional zero |

**Referências a estudar e avaliar licenças antes de copiar/empacotar:** React Flow, Chatwoot, XState, Activepieces core MIT, Node-RED, Langflow. Não incorporar automaticamente projetos com licenças restritivas para SaaS, como n8n, Typebot ou componentes enterprise de outros produtos. Preservar avisos de licença.

## P0 — barreiras obrigatórias antes de cliente real
| Prioridade | Lacuna observada na leitura estática | Critério de aceite |
| --- | --- | --- |
| Bloqueadora | Reenvio de resposta após timeout/queda sem confirmação do canal | Testar crash após envio, IDs de provedor, reconciliação e duplicidade; não afirmar exactly-once sem suporte externo |
| Bloqueadora | Intervenção humana não é inferida com segurança das mensagens `fromMe` | Diferenciar mensagens do próprio bot e da equipe com IDs do provedor; tomada manual autenticada; zero respostas automáticas após takeover |
| Alta | Retries de webhook declarados no contrato eram ignorados | Configuração aplicada, backoff, teste em Postgres, limite global; destino externo **deve** deduplicar por `Idempotency-Key` |
| Alta | Webhook inbound usa segredo compartilhado entre instâncias | Autenticidade vinculada ao canal/empresa; rotação de credenciais e testes contra spoofing |
| Alta | DNS validado antes de fetch pode não ser IP efetivo da conexão | Proteção SSRF eficaz, política de destinos, DNS rebinding, testes de hosts privados |
| Alta | Parser Evolution só reconhece parte dos JIDs | Testes com formatos reais; não inventar equivalências entre LID e telefone |
| Alta | Falta catálogo de ações aprovadas pelo negócio | Nenhuma ação muda agenda/pagamento sem confirmação de backend |
| Alta | Falta operação multiempresa autônoma | RBAC/RLS, isolamento, alertas, backups, quotas, consentimento, rastreabilidade |
| Média | Documentação e exemplos defasados | README e CI batem com os pacotes e testes existentes |

**Limitação expressa:** reenviar um webhook mutável pode repetir uma operação caso o receptor não implemente idempotência. A inclusão do cabeçalho `idempotency-key` não resolve sozinha essa garantia. Destinos de ação devem exigir idempotência comprovada ou revisão manual de resultados ambíguos.

## Sequência de entregas
- **P0 / segurança e confiabilidade:** completar correções críticas acima, integração CI com Postgres, teste de carga leve, homologação Evolution sem clientes reais.
- **P1 / piloto fechado:** cadastro de estabelecimentos, contexto real, catálogo mínimo de ações, inbox com takeover manual, trilha de auditoria e 3 pilotos.
- **P2 / Bot Studio:** React Flow, templates por nicho, pré-visualização no celular, simulações, versões imutáveis e rollback.
- **P3 / comercialização:** onboarding guiado, cobrança, quotas, suporte, DPA/contratos, políticas de mensagens, isolamento entre empresas.
- **P4 / IA assistida:** FAQ e RAG com origem da resposta, limites de custo, fallback e testes de segurança.
- **P5 / expansão:** outros nichos/canais e integrações conforme demanda comprovada.

## 30 / 60 / 90 dias (metas, não previsões)
- **30:** PRs P0 revisadas, testes de produção simulada, 10 entrevistas e baseline dos pilotos. Sem disparos em produção.
- **60:** 3 pilotos fechados, fluxo seguro ponta a ponta, dashboard mínimo, registro de custos e falhas.
- **90:** 3 renovações pagas ou decisão fundamentada de reposicionamento; definir preço definitivo pela margem real e suporte consumido.

**Critérios de interrupção:** qualquer vazamento entre tenants, mensagem após takeover, duplicações sem processo de reconciliação, ação de negócio sem confirmação, problemas graves de consentimento ou custo por cliente acima da receita recorrente. Suspender pilotos diante dessas falhas.

## Comercial, privacidade e responsabilidades
A empresa cliente geralmente decide as finalidades de atendimento (controladora) e a Alvo Digital opera dados sob contrato (operadora), conforme o tratamento concreto. Preparar DPA, termos, política de retenção, exportação/exclusão, papéis de acesso e resposta a incidentes; consultar assessoria jurídica/contábil brasileira. Base legal e necessidade de encarregado não são idênticas para todos os tratamentos. Não presumir obrigação universal de seis meses de logs nem percentuais garantidos de redução de faltas.

## Notas de pesquisa e validação
A pesquisa exploratória de 23/11/2026 serve como **hipóteses**: preços de concorrentes, custos de IA, números de no-show, estimativas de CAC/churn e cronogramas não são garantia contratual. Revalidar preços na fonte oficial do fornecedor, tarifas vigentes da Meta por país/categoria, detalhes da licença do código efetivamente incorporado e regras brasileiras atuais antes de lançar.

Documentação interna: `docs/SECURITY_RELIABILITY.md`, `docs/REALITY.md`, `docs/INTEGRATION.md`, `docs/DECISIONS.md`. Repositórios: https://github.com/herslander-netizen/flow-bot e https://github.com/herslander-netizen/flowbot.
