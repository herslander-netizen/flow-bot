# Gateway Claude — FlowBot (opt-in, somente rascunhos)

Este componente conecta o servidor Node.js do FlowBot à Anthropic Messages API para **preparar sugestões de respostas**, nunca enviar mensagens nem executar agendamentos. Ele é independente do gateway Evolution Alvo e da futura Meta Cloud API.

## Estado inicial / custo

**Desligado por padrão**, mesmo com API key disponível. Não existe autoenvio de WhatsApp, nem rotina que chame a IA a cada mensagem recebida. A API da Anthropic pode gerar cobranças: uma assinatura Claude no navegador não garante créditos de API. A chave precisa ser criada e gerida na Claude Console. O administrador deve configurar **limite de gastos diretamente na Anthropic**; a cota do FlowBot é uma segunda proteção, não substitui o limite financeiro do provedor.

Para habilitar **apenas em homologação** e com operadores autorizados, configure as variáveis do processo backend (nunca no frontend, GitHub ou arquivos públicos):

- FLOWBOT_CLAUDE_ENABLED=0 (altere para 1 somente quando autorizar chamadas pagas).
- ANTHROPIC_API_KEY: segredo gerenciado no backend (ausente na instalação inicial).
- FLOWBOT_CLAUDE_MODEL: modelo específico suportado pela sua conta. Exemplo para testes: claude-haiku-4-5-20251001; confirme disponibilidade e preços antes de habilitar.
- FLOWBOT_CLAUDE_DAILY_LIMIT=5: limite de chamadas reservadas por estabelecimento/UTC; intervalo aceito de 1 a 100.
- FLOWBOT_CLAUDE_MAX_OUTPUT_TOKENS=256: 64 a 1024.
- operatorTokenEnv: token exclusivo do operador desse workspace (já existente no motor).
- claudeEnabled: true no JSON de workspaces daquele negócio **somente após homologação**. O padrão é desabilitado.

Exemplo parcial, SEM nenhum segredo no JSON:

    {
      "workspaces": [
        {
          "id": "flowbot",
          "instance": "alvo-flowbot",
          "flowId": "atendimento",
          "operatorTokenEnv": "FLOWBOT_OPERATOR_TOKEN",
          "claudeEnabled": false
        }
      ]
    }

## Endpoint

POST /ops/ai/claude/draft

Authorization: Bearer token-do-operador-do-workspace

Corpo:

    {
      "workspaceId": "flowbot",
      "conversationKey": "5582999990000",
      "requestKey": "solicitacao-unica-2026-0001",
      "message": "Qual o preço do corte?",
      "facts": {
        "reality.businessName": "Estúdio Exemplo",
        "reality.services": ["Corte: R$ 40,00"],
        "reality.todayHours": "9h às 18h"
      }
    }

Os fatos devem ter sido obtidos e verificados pelo backend ou por operador autorizado, **não** copiados sem validação de mensagens do cliente. O servidor envia ao Claude apenas a mensagem e os fatos apresentados; o número, a chave da solicitação e o ID do workspace são usados localmente, sem incluí-los no prompt.

Sucesso HTTP 200 (rascunho, não mensagem enviada):

    {
      "ok": true,
      "draft": "O corte custa R$ 40,00.",
      "needsHuman": false,
      "usage": { "inputTokens": 100, "outputTokens": 40 }
    }

Nunca declarar que o agendamento/pagamento foi executado com base apenas no texto gerado. O operador deve revisar a sugestão; ações reais passam por RPCs/serviços verificados, com permissões e auditoria próprias. \`needsHuman=true\` é um pedido de análise humana, não uma transferência já realizada.

## Segurança e limites

- Operator token vinculado ao workspace; o segredo da Evolution NÃO autoriza a IA.
- Chave Anthropic apenas no ambiente do servidor; a API é chamada por HTTPS em URL fixa, sem ferramentas da IA.
- Cota por workspace persistida no PostgreSQL, com inserção transacional e idempotência. Repetir a mesma \`requestKey\` retorna 409 e **não chama novamente o provedor**.
- Rejeita chaves inválidas, mensagens maiores que 2.000 caracteres, mais de 20 fatos e resultados truncados.
- Depois de um timeout ou erro de rede, a reserva não é revertida: a Anthropic pode ter processado a chamada. Nenhuma repetição automática.
- Não armazena o texto da conversa nem a resposta nos contadores; logs têm apenas workspace e números de tokens.
- A aplicação das migrações é feita pelo comando \`flow-bot-server migrar\` ou na inicialização do motor. O gateway não deve ser exposto antes de migrar.
- O fluxo determinístico de atendimento pela Evolution continua inalterado. Este endpoint não fornece disparos em massa, automação de vendas, moderação da Meta ou autoenvio.

## Próximas integrações (não ativadas)

1. Vincular um operador no painel a esta rota, com revisão e envio manual.
2. Integrar a resposta da IA ao Flow Core **atrás do motor de ações**, apenas quando os fatos forem verificados.
3. Registrar métricas/custo, retenção e limpeza dos contadores conforme política de privacidade.
4. Homologar dados pessoais/LGPD, bloqueios por opt-out e limite financeiro antes de atender clientes reais.

Referências: https://platform.claude.com/docs/en/api/messages/create e https://platform.claude.com/docs/en/manage-claude/authentication .
