-- Guarda permanente de resultados incertos de envio.
-- Colunas aditivas: não altera estados antigos nem apaga filas.
-- A decisão de desbloqueio exige reconciliação comprovada e revisão administrativa.
ALTER TABLE flow_bot.outbound
  ADD COLUMN IF NOT EXISTS delivery_uncertain boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS outbound_uncertain_by_workspace
  ON flow_bot.outbound (workspace_id, conversation_key, id)
  WHERE delivery_uncertain = true;
