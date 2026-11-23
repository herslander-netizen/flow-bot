# FlowBot — Gateway Evolution Alvo

**Status: implementação na branch, sem deploy nem conexão real.**

## Contratos verificados

- A Evolution Alvo na Oracle está online (v2.3.7). Na última consulta: **6 instâncias cadastradas, 0 conectadas**.
- Projeto **FlowBot** cadastrado isoladamente, mas ainda sem pareamento, sem token provisionado.
- A saída do gateway usa POST /v1/messages/text, Authorization: Bearer (token exclusivo por projeto) e Idempotency-Key estável, aceitando 202 com status accepted. Aceite NÃO comprova entrega ou leitura WhatsApp.
- GET /v1/connection consulta o estado do projeto autorizado pelo token. O endpoint de gateway **não gerencia webhooks**.
- Entrada no motor Node.js continua via POST /webhooks/evolution, segredo x-webhook-secret, evento messages.upsert e instância mapeada para workspace.

## Instalação de teste

1. Acesse o painel privado: https://evolution-alvo.regalbrink4.chatgpt.site
2. Pareie o **projeto flowbot** em um número de teste autorizado, separando-o dos números de Flow, Alvo OS e Nexus.
3. Guarde o token privado SOMENTE em variáveis/segredos da infraestrutura. Nunca copie o token para Git, PR ou chat.
4. Copie as configurações de deploy/evolution-alvo.env.example e deploy/evolution-alvo.workspaces.example.json. Ajuste o fluxo e o workspace sem misturar tokens.
5. Inicie o motor com Postgres compatível e migre o schema próprio flow_bot em ambiente isolado. O Supabase de prospecção do FlowBot é projeto distinto da base do runtime; a migração não foi feita nele.
6. Publique o fluxo de atendimento com simulação e teste a entrada do webhook em HTTPS. A configuração do webhook da Evolution nativa Oracle deve ser feita por procedimento administrativo seguro **só para a instância do FlowBot**.
7. Envie mensagens de teste inbound em um telefone autorizado; confirme roteamento, idempotência, outbox, resposta, handoff e logs.
8. Só depois de testes de isolamento, consentimento, reconciliação e fila cancelar pendente, considerar produção.

## Segurança

- EVOLUTION_PROVIDER=alvo ativa o adaptador de saída para gateway; o padrão direct preserva a integração nativa.
- Cada workspace exige evolutionTokenEnv apontando para sua própria variável de ambiente. Token repetido entre workspaces é recusado.
- A chave idempotente é SHA-256([workspaceId, chaveDaOutbox]); não muda após retry/restart.
- Resposta unknown (ou timeout) deve ser **reconciliada com a mesma chave**. Nunca emitir segunda mensagem com nova chave. A aplicação ainda não implementa conciliação final de entrega.
- O comando ligar-webhook é bloqueado no modo alvo para não executar a chamada incorreta da Evolution nativa no gateway.
- P0 pendente: distinção de fromMe humano versus bot, handoff que para pendências em voo, segredo do webhook por conexão, LID, retries e reconciliação unknown, testes de ponta a ponta reais.
- Sem disparos automáticos de prospecção. Nenhum sistema relacionado foi publicado ou alterado.
