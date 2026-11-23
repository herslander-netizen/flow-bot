# FlowBot — piloto isolado de integração WhatsApp

**Este Worker é um piloto provisório**, não é o motor Node.js completo de atendimento.
Não faz agendamento, envia campanhas nem executa intervenções humanas. O motor completo permanece nas PRs #4, #6, #7, #10, #11 e #12.

## Comportamento

- `POST /webhooks/evolution` autentica `x-webhook-secret`, valida `instance`, ignora `fromMe`, grupos e tipos desconhecidos.
- Somente responde à frase `teste flowbot`, `flowbot teste`, `oi flowbot` ou `olá flowbot`. A saudação tenta primeiro **botões experimentais** na rota `/v1/messages/buttons`; aceita o clique por ID `1` ou `2` durante 24h.
- Em rejeições definitivas de botões (HTTP 400/404/405/415/422), envia menu numérico usando **nova chave idempotente por formato**. Em `pending`, `unknown`, timeout, 429 ou 5xx **não reenvia**: pode já ter enviado.
- Se o gateway aceitar mas o WhatsApp não renderizar, o cliente pode enviar **`menu texto`** para receber a versão textual. Não há confirmação técnica de renderização pelos retornos `accepted`.
- Registra o ID inbound antes de enviar para evitar duplicação. Quando a Evolution devolve `unknown`, não reenvia e bloqueia novos envios para aquele contato até revisão.
- D1 exclusivo: apenas IDs técnicos, número destinatário, status, ID do provedor e timestamps. Rotina `scheduled` elimina registros antigos; o cron deve ser configurado à parte.
- Em `GET /health`, retorna flags não sensíveis da configuração, sem expor telefone ou tokens.
- Piloto pode ser desligado com `PILOT_ENABLED=0`; essa flag não altera as demais instâncias.

## Variáveis/Bindings Cloudflare

- D1 `DB`, criado exclusivamente para este piloto.
- `EVOLUTION_ALVO_TOKEN` (**segredo**; Bearer exclusivo do FlowBot).
- `WEBHOOK_SECRET` (**segredo**, mínimo 32 caracteres, configurado também na instância Evolution específica).
- `INSTANCE_NAME` (nome real da instância de teste do FlowBot).
- `PILOT_ENABLED` (0/1, iniciar desligado até confirmar webhook).
- `PILOT_INTERACTIVE_BUTTONS` (1/0; opcional, padrão 1 quando piloto habilitado; use 0 para forçar menu numérico sem alterar o gateway).

Nunca publicar segredos no GitHub nem compartilhá-los como mensagem no WhatsApp.
O token temporário deve ser substituído após homologação.

## Procedimento

1. Confirme o nome **exato** da instância no painel Evolution Alvo.
2. Configure no servidor Evolution nativo, **somente nessa instância**, o webhook de `messages.upsert` apontando para `https://<worker>/webhooks/evolution`, com cabeçalho `x-webhook-secret` correspondente.
3. Confirme GET /health e teste POST com segredo correto/incorreto, fromMe e ID repetido.
4. Ative PILOT_ENABLED=1 somente após confirmar a autenticação e o isolamento.
5. De outro número próprio ou autorizado, envie **teste flowbot**; verifique se os botões apareceram, clique 1 ou 2. Se não forem renderizados, envie **menu texto** e escolha a opção numérica.
6. Revise estado da D1 e logs. Caso haja `unknown`, não tente com nova chave; investigue.
7. Antes de ampliar, integrar o motor Node.js e testes reais de atendimento humano e fila.

**Não usar como bot de produção** nem como base para prospecção em massa.

## Disparos via Meta (arquitetura futura, NÃO ativada)

O módulo de campanhas pela Meta Cloud API será uma integração **separada** do Worker piloto. Antes de qualquer envio, requer: número/API Meta verificados, opt-in documentado por categoria/estabelecimento, templates aprovados, deduplicação por campanha/destinatário, bloqueio de opt-out, janela de 24h, limites por lote, teto de custos e auditoria de entrega/cobrança. A franquia de 1.000 mensagens de **atendimento** por mês por número (regra de outubro/2026) **não é uma franquia de marketing**. Não usar o mesmo número para as duas APIs sem checar compatibilidade oficial de coexistência.
