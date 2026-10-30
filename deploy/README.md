# Instalar o Flow Bot + Evolution (custo zero de software)

Tudo roda num servidor seu com Docker: Postgres, Redis, Evolution API v2 e Flow Bot. Opção gratuita: máquina
"Always Free" da Oracle Cloud (pede cartão só para verificar a conta). Use um **número de WhatsApp secundário** no
começo: a Evolution usa o WhatsApp comum e excesso de mensagens automáticas pode levar a bloqueio.

## Passo a passo

1. No servidor: `git clone https://github.com/herslander-netizen/flow-bot && cd flow-bot/deploy`
2. `cp .env.example .env` e preencha (gere cada segredo com `openssl rand -hex 32`).
3. `cp workspaces.example.json workspaces.json` e ajuste: `id` do negócio, `instance` (nome da instância na
   Evolution), `flowId`, `realityUrl`/`handoffUrl` do seu sistema.
4. `docker compose up -d --build`
5. Ponha HTTPS na frente (Caddy, Nginx ou o painel da hospedagem): Evolution na porta 8080, Flow Bot na 8081.
6. Publique o fluxo:
   `docker compose exec flow-bot node packages/server/bin/flow-bot-server.mjs publicar studio-exemplo presets/flow/atendimento.json presets/flow/perfil.json`
7. Crie a instância e leia o QR Code na Evolution (painel da Evolution ou pelo Flow).
8. Ligue o webhook da instância ao Flow Bot:
   `docker compose exec flow-bot node packages/server/bin/flow-bot-server.mjs ligar-webhook flow-studio-exemplo http://flow-bot:8080`
   (dentro da mesma máquina o endereço interno basta; o segredo vai no cabeçalho).
9. Mande "oi" para o número de teste. Acompanhe com `docker compose logs -f flow-bot`.

Aprendizado: `docker compose exec flow-bot node packages/server/bin/flow-bot-server.mjs perguntas studio-exemplo`.
