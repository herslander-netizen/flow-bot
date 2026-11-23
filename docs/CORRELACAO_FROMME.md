# Identificação da origem de mensagens próprias — preparação da issue #8

**Estado:** branch de homologação. Não há transferência automática ativada e nenhuma mensagem real foi enviada.

O evento `fromMe: true` não prova autoria humana: pode ser eco de uma resposta produzida pelo FlowBot, operação de um atendente no aplicativo ou outro emissor integrado.

## Prova de eco do próprio bot

- Na saída do motor, quando o provedor confirma `accepted` ou sucesso HTTP com um `key.id`, o campo `provider_message_id` é salvo em `flow_bot.outbound` (migração aditiva `998_outbound_provider_message_id.sql`).
- O webhook autentica o segredo de entrada e extrai `instance`, `remoteJid` e `key.id` do evento `messages.upsert` com `fromMe: true`.
- A busca `ecoBotConfirmado(workspaceId, conversationKey, providerMessageId)` só retorna verdadeiro se houver saída aceita com esse identificador **na mesma empresa e mesma conversa**.
- Quando há correlação: `proveniencia=bot_confirmado`. Quando não há: `proveniencia=indeterminada`. Em nenhum caso se executa handoff automático.
- Um JID `@lid` ainda não é transformado em número sem mapeamento confirmado. Nesse caso, a origem permanece indeterminada.
- O parser principal de inbound continua ignorando `fromMe` para impedir loops. O webhook não registra conteúdo pessoal dessa mensagem em logs; apenas tipo de evento e workspace.
- Mensagem `fromMe` repetida é consultada novamente mas não muda a sessão nem dispara resposta.

## O que ainda impede a detecção automática de atendente

- O gateway Evolution Alvo pode confirmar `accepted` **sem retornar ID externo**. Isso limita a prova do eco.
- Um `fromMe` desconhecido não é necessariamente humano: pode ser envio do próprio bot antes do registro do ID, resultado `unknown`, outro sistema ligado ao WhatsApp ou evento com LID ainda não resolvido.
- Para ativar takeover automático com segurança, é necessário obter amostras reais e autorizadas dos eventos, validar a origem das mensagens e construir um mecanismo que **confirme** autoria humana sem inferir pela ausência de ID.
- Até isso existir, usar as operações autenticadas da PR #7 para tomar/retomar o atendimento explicitamente.

## Homologação exigida

Testar IDs reais da Evolution em um número de teste exclusivo, ida/volta, eventos atrasados, replays, mensagens do operador, erros de rede, LID e múltiplos tenants. Nenhuma integração de origem humana deve ser ativada por padrão neste estágio.

Dependências: PR #4 → #6 → #7 → #10. O Flow, Alvo OS e Nexus permanecem isolados.
