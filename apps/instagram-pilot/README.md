# Instagram: piloto isolado, fase 1

Esta fase contém política pura de intenções e validação HMAC, sem runtime de atendimento, endpoint, envio, OAuth ou banco. Executar `node --test apps/instagram-pilot/policy.test.mjs`. Dados exclusivamente sintéticos. Não registrar tokens, IDs reais ou conversas no repositório público.

## Integração planejada

- Produto/interface: herslander-netizen/flowbot, PR #17 (homologação); motor: este repositório. Não duplicar CRM, Bot Studio, takeover ou permissões.
- Instagram API with Instagram Login, conta profissional, graph.instagram.com, permissões instagram_business_basic, instagram_business_manage_comments, instagram_business_manage_messages. Referência: https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/
- Fase 2: OAuth e armazenamento seguro de tokens; webhook HTTPS com challenge e HMAC sobre bytes originais, parser de eventos validado com fixtures oficiais, associação conta-workspace server-side; limitar tamanho e rejeitar ecos. Validar versão Graph e formatos reais antes de ativar.
- Comentário: somente mídia selecionada e palavra-chave exata; verificar timestamp de criação via API. Uma resposta privada por comentário dentro de sete dias; comentário público de confirmação somente após entrega comprovada. DM subsequente apenas após mensagem recebida; janela conservadora de 24h. Live e campanhas de anúncios fora do piloto. Não usar HUMAN_AGENT para automação.
- Fase 3: persistir inbox/outbox, deduplicação atômica por conta/evento/ação, opt-out persistente, takeover, janelas e status de entrega; bloquear envio incerto; revalidar política no despacho. A chave produzida pelo piloto não constitui idempotência persistente. Não enviar nem guardar dados reais nesta fase.
- Fase 4: UI em Conexões/Instagram e Bot Studio da branch de homologação, reaproveitando contratos e identidade existentes. CRM somente após interação autorizada e regras LGPD; roteamento humano e auditoria. Flow Core auxilia autoria, sem impor LLM em runtime determinístico.
- Fase 5: testar conta autorizada, aprovação Meta/Advanced Access quando necessário, testes de isolamento, repetição, expiração, falha de rede e atendimento humano. Flag de envio desligada por padrão; não implantar antes de homologar.

O piloto não toca a Evolution Alvo, Supabase, Cloudflare, Alvo OS nem a produção.
