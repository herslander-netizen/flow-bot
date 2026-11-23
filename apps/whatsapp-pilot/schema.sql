-- Banco D1 exclusivo do piloto FlowBot, sem dados Flow/Alvo OS/TapFlow.
CREATE TABLE IF NOT EXISTS pilot_events (
 instance TEXT NOT NULL,
 event_id TEXT NOT NULL,
 contact TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('processing','sent','failed','unknown','rate_limited')),
 provider_message_id TEXT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(instance, event_id)
);
CREATE INDEX IF NOT EXISTS pilot_events_contact_status
 ON pilot_events(instance, contact, outcome, created_at);
CREATE TABLE IF NOT EXISTS pilot_sessions (
 instance TEXT NOT NULL,
 contact TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(instance, contact)
);
CREATE INDEX IF NOT EXISTS pilot_sessions_expiry ON pilot_sessions(expires_at);
