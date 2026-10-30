# Segurança e confiabilidade

## Isolamento

Mesmo como projeto inicialmente individual, usar `workspace_id`/tenant em todas as entidades de configuração, sessões, eventos, jobs e logs desde o início. A autorização precisa ser verificada no servidor, não apenas no cliente.

## Entrada de eventos

- verificar assinatura/token do provedor quando disponível;
- validar schema e tamanho do payload;
- deduplicar por provider event ID + channel connection;
- normalizar IDs de contato sem depender do nome exibido;
- distinguir mensagens inbound das mensagens emitidas pelo próprio Flow Bot;
- tratar retries do provedor como comportamento normal.

## Processamento

- idempotência por evento e ação;
- serialização/lock por conversa para evitar duas transições concorrentes;
- persistir estado antes de confirmar processamento;
- limite máximo de nós/ações por evento;
- limite de loops e profundidade de subfluxos;
- fila durável para atraso, retry e timeout;
- backoff exponencial com jitter para falhas transitórias;
- circuit breaker e rate limit por conexão/canal;
- ações externas sempre com timeout e limite de resposta.

## RegEx e matching

- limitar tamanho dos padrões e entradas;
- impedir expressões vulneráveis a ReDoS ou usar engine com timeout/garantias;
- não permitir padrões globais não aprovados que interceptem todos os clientes;
- exibir precedência e conflito no validador.

## Webhooks e ações externas

- bloquear acesso a endereços privados/loopback/link-local e metadata cloud (proteção SSRF);
- validar HTTPS por padrão;
- permitir allowlist de domínios por workspace;
- assinar chamadas de saída e nunca expor segredos na UI/logs;
- limitar método, headers, tamanho e tempo;
- guardar credenciais cifradas quando forem necessárias.

## Logs e privacidade

- registrar metadados operacionais suficientes para auditoria;
- redigir telefone, conteúdo e tokens de acesso conforme política configurável;
- não guardar mais histórico que o necessário;
- permitir políticas de retenção e exclusão;
- fornecer modo de simulação que não envia mensagem real.

## Falha do canal

Uma falha de envio não deve destruir o estado da conversa. Registrar falha, aplicar retry controlado e permitir handoff/manual resend conforme a regra.

## Segurança da autoria por IA

Tratar arquivos, mensagens de cliente e textos de terceiros como dados não confiáveis, nunca como instruções para o agente de autoria. A IA pode propor configuração, mas a aplicação valida e o humano aprova. Proibir importação de código executável.
