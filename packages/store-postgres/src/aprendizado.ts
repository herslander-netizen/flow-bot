/**
 * O que fica depois que as mensagens são apagadas: frases anonimizadas que o fluxo não soube tratar e contadores
 * por dia. Nada aqui guarda telefone, nome ou conversa.
 */
import { createHmac } from "node:crypto";

import type { Passo, Resultado } from "@flow-bot/runtime";

import { anonimizar } from "./anonimizar.js";
import type { Cliente } from "./banco.js";

export type TipoDeFrase = "sem_assunto" | "resposta_invalida";

/** Tipo de frase a aprender a partir do rastro da decisão, se houver. */
export function frasesDoResultado(r: Resultado): TipoDeFrase | null {
  if (r.motivo === "nenhum_gatilho") return "sem_assunto";
  const primeiro = r.passos[0];
  if (primeiro?.detalhe === "qualquer_mensagem") return "sem_assunto";
  const invalida = r.passos.some(
    (p) =>
      (p.type === "logic.switch" && p.port === "default") ||
      (p.type === "data.capture" && p.port === "invalid"),
  );
  return invalida ? "resposta_invalida" : null;
}

/** Contadores de um processamento: [métrica, chave]. */
export function contadoresDoResultado(r: Resultado): [string, string][] {
  const saida: [string, string][] = [["motivo", r.motivo]];
  r.passos.forEach((p: Passo, i) => {
    if (p.type.startsWith("trigger.") && p.detalhe !== "em_pausa")
      saida.push(["gatilho", p.nodeId]);
    if ((p.type === "logic.switch" || p.type === "logic.condition") && p.port)
      saida.push(["caminho", `${p.nodeId}:${p.port}`]);
    if (p.type === "action.handoff")
      saida.push(["encaminhamento", r.passos[i - 1]?.nodeId ?? "inicio"]);
  });
  for (const f of r.realidadeAusente) saida.push(["realidade_ausente", f]);
  return saida;
}

export async function registrarAprendizado(
  c: Cliente,
  p: {
    workspaceId: string;
    flowId: string;
    conversationKey: string;
    agora: Date;
    resultado: Resultado;
    texto: string | null;
    contato: { firstName?: string | undefined; name?: string | undefined };
    /** Sem segredo, as frases não são registradas (só os contadores). */
    segredo: string | null;
  },
) {
  const dia = p.agora.toISOString().slice(0, 10);
  for (const [metrica, chave] of contadoresDoResultado(p.resultado))
    await c.query(
      `INSERT INTO flow_bot.learning_counters (workspace_id, flow_id, day, metric, key, count)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (workspace_id, flow_id, day, metric, key) DO UPDATE SET count = learning_counters.count + 1`,
      [p.workspaceId, p.flowId, dia, metrica, chave.slice(0, 200)],
    );

  const tipo = p.texto !== null ? frasesDoResultado(p.resultado) : null;
  if (!tipo || !p.segredo || p.texto === null) return;
  const frase = anonimizar(p.texto, p.contato);
  if (!frase) return;
  const pessoa = createHmac("sha256", p.segredo)
    .update(`${p.workspaceId}\u0000${p.conversationKey}`)
    .digest("hex");
  const nova = await c.query(
    `INSERT INTO flow_bot.learning_phrase_contacts (workspace_id, flow_id, kind, phrase, contact_hash, seen_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [p.workspaceId, p.flowId, tipo, frase, pessoa, p.agora],
  );
  await c.query(
    `INSERT INTO flow_bot.learning_phrases
       (workspace_id, flow_id, kind, phrase, contacts, occurrences, first_seen, last_seen)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $6)
     ON CONFLICT (workspace_id, flow_id, kind, phrase) DO UPDATE
       SET contacts = learning_phrases.contacts + $5,
           occurrences = learning_phrases.occurrences + 1,
           last_seen = $6`,
    [p.workspaceId, p.flowId, tipo, frase, nova.rowCount ? 1 : 0, p.agora],
  );
}
