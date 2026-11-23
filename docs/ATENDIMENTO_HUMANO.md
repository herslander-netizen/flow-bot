# Atendimento humano — etapa segura do FlowBot

**Estado:** implementação em PR de homologação. Sem merge, deploy, pareamento WhatsApp ou uso comercial.

## Por que é necessário

O webhook da Evolution pode informar `fromMe: true` tanto para mensagens enviadas pelo próprio bot quanto para mensagens de um atendente. Hoje o motor ignora esses eventos para evitar loops. Não devemos interpretar todo `fromMe` como atendimento humano: isso pararia o bot após enviar suas próprias respostas.

Esta etapa disponibiliza um controle servidor-servidor autenticado, ligado a cada workspace, para assumir e retomar uma conversa de modo seguro. A integração da caixa de atendimento (interface), e a identificação automática de um humano no WhatsApp, são etapas posteriores.

## Contratos HTTP no serviço Node.js do motor

- `POST /ops/conversations/handoff`: assume uma conversa já existente e cancela ações e prazos pendentes.
- `POST /ops/conversations/resume`: devolve uma conversa previamente assumida para o bot, em estado `new`.
- Cabeçalho: `Authorization: Bearer <token-de-operador-do-workspace>`.
- Corpo JSON: `{ "workspaceId": "id-do-workspace", "conversationKey": "5582999990000" }`.
- Resposta: `{ "ok": true, "changed": true|false }`. Repetições são idempotentes.
- Token ausente/inválido ou de outro workspace: HTTP 401. Sem token de operador, o controle não é ativado.

## Segredos

No JSON `FLOW_BOT_WORKSPACES`, um workspace pode incluir `operatorTokenEnv: "OPERADOR_FLOWBOT"`. Essa chave refere-se ao nome de variável de ambiente do backend. Defina o valor da variável em um cofre de segredos, com no mínimo 32 caracteres aleatórios. O token deve ser diferente do segredo de webhook, token da Evolution e token de integração do sistema hospedeiro. Nunca o coloque no PWA, JavaScript público ou logs.

Um serviço de inbox autenticado deve validar sessão, papel e workspace do operador antes de invocar esses endpoints. Esse serviço deve manter os tokens exclusivamente no servidor. O endpoint não substitui autenticação pessoal, auditoria por operador e LGPD.

## Garantias de execução

- O backend trava a linha de conversa na transação de takeover e altera status para `handed_off`, cancelando a outbox e os timers em `pending` na mesma transação.
- A outbox trava essa mesma conversa durante o envio a canais externos; a operação de takeover só confirma após completar eventual transmissão em curso. Após o retorno de sucesso, não se inicia outro envio daquela conversa pelo adaptador protegido.
- O fluxo `handed_off` continua ignorando mensagens e timers até `resume` explícito.
- Os testes de integração usam PostgreSQL descartável e servidor HTTP simulado; não enviam WhatsApp.

## Limitações e bloqueios P0

- `fromMe` automático **não** distingue humano de bot sem correlação de ID de saída da Evolution e observabilidade de eventos reais; permanece ignorado.
- O gateway Evolution Alvo precisa de pareamento e token real do projeto FlowBot. Última checagem: 6 instâncias, 0 conectadas.
- Reconciliar status de envio `unknown` antes de liberar saída comercial; `accepted` não comprova entrega/leitura.
- Antes de produção: testes com dois usuários e dois workspaces, piloto WhatsApp autorizado, controle de acesso real, audit trail e política de opt-in.

Referências: motor `herslander-netizen/flow-bot` PR #4 e PR #6; aplicativo `herslander-netizen/flowbot` PR #3. Nenhum desses trabalhos é incorporado automaticamente.
