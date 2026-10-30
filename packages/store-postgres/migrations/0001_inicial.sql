-- Flow Bot: persistência e execução durável. Tudo no schema flow_bot e sempre por workspace_id (isolamento).

CREATE SCHEMA IF NOT EXISTS flow_bot;

-- Versões publicadas: imutáveis, com checksum do documento.
CREATE TABLE IF NOT EXISTS flow_bot.flow_versions (
  workspace_id text NOT NULL,
  flow_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  checksum text NOT NULL,
  document jsonb NOT NULL,
  published_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, flow_id, version)
);

-- Uma conversa = uma sessão do motor, presa à versão do fluxo em que começou.
CREATE TABLE IF NOT EXISTS flow_bot.conversations (
  workspace_id text NOT NULL,
  conversation_key text NOT NULL,
  flow_id text NOT NULL,
  flow_version integer NOT NULL,
  session jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, conversation_key)
);

-- Eventos recebidos: a chave (canal + id do provedor) garante que um reenvio nunca é processado duas vezes.
CREATE TABLE IF NOT EXISTS flow_bot.inbound_events (
  workspace_id text NOT NULL,
  event_key text NOT NULL,
  conversation_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('message', 'timer', 'webhook_result')),
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, event_key)
);

-- Histórico de execução: decisão, motivo e passos de cada evento.
CREATE TABLE IF NOT EXISTS flow_bot.executions (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  conversation_key text NOT NULL,
  event_key text NOT NULL,
  flow_id text NOT NULL,
  flow_version integer NOT NULL,
  status text NOT NULL,
  motivo text NOT NULL,
  steps jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS executions_conversa_idx
  ON flow_bot.executions (workspace_id, conversation_key, id);

-- Prazos duráveis (fim de espera, fim de atraso): sobrevivem a reinício.
CREATE TABLE IF NOT EXISTS flow_bot.jobs (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  conversation_key text NOT NULL,
  node_id text NOT NULL,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'cancelled', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_vencidos_idx ON flow_bot.jobs (run_at) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS jobs_conversa_idx ON flow_bot.jobs (workspace_id, conversation_key) WHERE status = 'pending';

-- Caixa de saída: cada ação a entregar, com chave de idempotência e novas tentativas.
CREATE TABLE IF NOT EXISTS flow_bot.outbound (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  conversation_key text NOT NULL,
  idempotency_key text NOT NULL,
  action jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL,
  sent_at timestamptz,
  UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS outbound_pendentes_idx
  ON flow_bot.outbound (next_attempt_at) WHERE status IN ('pending', 'sending');
