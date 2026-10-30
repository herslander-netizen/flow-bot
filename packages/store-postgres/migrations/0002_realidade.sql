-- Realidade usada em cada decisão (auditoria) e fatos que o hospedeiro deixou de entregar. Só acréscimo.
ALTER TABLE flow_bot.executions ADD COLUMN IF NOT EXISTS reality jsonb;
ALTER TABLE flow_bot.executions ADD COLUMN IF NOT EXISTS reality_missing text[] NOT NULL DEFAULT '{}';
