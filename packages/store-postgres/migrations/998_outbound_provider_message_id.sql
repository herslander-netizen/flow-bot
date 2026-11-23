-- Reconhecimento de eco do próprio FlowBot. Só gravar um ID devolvido pelo provedor
-- após aceite da transmissão, nunca gerar ou inferir um identificador.
ALTER TABLE flow_bot.outbound
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_provider_echo_idx
  ON flow_bot.outbound (workspace_id, conversation_key, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
