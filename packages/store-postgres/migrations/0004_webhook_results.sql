-- Fila durável para aplicar resultados de webhooks sem repetir a chamada externa.
CREATE TABLE IF NOT EXISTS flow_bot.webhook_results (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  outbound_id bigint NOT NULL,
  conversation_key text NOT NULL,
  ok boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL,
  processed_at timestamptz,
  UNIQUE (workspace_id, outbound_id)
);
CREATE INDEX IF NOT EXISTS webhook_results_pendentes_idx
  ON flow_bot.webhook_results (next_attempt_at, id)
  WHERE status IN ('pending', 'running');
