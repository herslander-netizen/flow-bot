-- Aprendizado sem dado pessoal: sobrevive à limpeza das mensagens (retenção de 90 dias). Só acréscimo.

-- Frases anonimizadas que o fluxo não soube tratar (sem assunto / resposta inválida), com contagens.
CREATE TABLE IF NOT EXISTS flow_bot.learning_phrases (
  workspace_id text NOT NULL,
  flow_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sem_assunto', 'resposta_invalida')),
  phrase text NOT NULL CHECK (char_length(phrase) <= 120),
  contacts integer NOT NULL DEFAULT 0,
  occurrences integer NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, flow_id, kind, phrase)
);

-- Só para contar pessoas diferentes por frase: hash com segredo da instalação, apagado com a retenção.
CREATE TABLE IF NOT EXISTS flow_bot.learning_phrase_contacts (
  workspace_id text NOT NULL,
  flow_id text NOT NULL,
  kind text NOT NULL,
  phrase text NOT NULL,
  contact_hash text NOT NULL,
  seen_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, flow_id, kind, phrase, contact_hash)
);
CREATE INDEX IF NOT EXISTS learning_phrase_contacts_seen_idx ON flow_bot.learning_phrase_contacts (seen_at);

-- Contadores por dia: gatilhos, escolhas, motivos, encaminhamentos, fatos ausentes.
CREATE TABLE IF NOT EXISTS flow_bot.learning_counters (
  workspace_id text NOT NULL,
  flow_id text NOT NULL,
  day date NOT NULL,
  metric text NOT NULL,
  key text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, flow_id, day, metric, key)
);

-- Índices para a limpeza por data.
CREATE INDEX IF NOT EXISTS inbound_events_received_idx ON flow_bot.inbound_events (received_at);
CREATE INDEX IF NOT EXISTS executions_created_idx ON flow_bot.executions (created_at);
CREATE INDEX IF NOT EXISTS outbound_created_idx ON flow_bot.outbound (created_at);
CREATE INDEX IF NOT EXISTS jobs_created_idx ON flow_bot.jobs (created_at);
CREATE INDEX IF NOT EXISTS conversations_updated_idx ON flow_bot.conversations (updated_at);
