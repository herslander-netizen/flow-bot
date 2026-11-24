-- Reserva de uso da IA por tenant, somente no servidor.
-- Sem conteúdo de conversas ou credenciais nesta estrutura.
CREATE TABLE IF NOT EXISTS flow_bot.claude_requests (
  workspace_id text NOT NULL,
  request_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, request_key)
);
CREATE INDEX IF NOT EXISTS claude_requests_created_at
  ON flow_bot.claude_requests (created_at);

CREATE TABLE IF NOT EXISTS flow_bot.claude_daily (
  workspace_id text NOT NULL,
  day_utc date NOT NULL,
  requests integer NOT NULL CHECK (requests >= 0),
  PRIMARY KEY (workspace_id, day_utc)
);

REVOKE ALL ON flow_bot.claude_requests FROM PUBLIC;
REVOKE ALL ON flow_bot.claude_daily FROM PUBLIC;
