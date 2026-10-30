/**
 * Aviso da Evolution API v2 (webhook) → evento do Flow Bot. Só mensagem de texto de uma pessoa vira evento:
 * mensagem do próprio número (`fromMe`), grupo, transmissão e status são ignorados, o que também evita loop.
 */
export type EntradaDaEvolution =
  | {
      tipo: "mensagem";
      instancia: string;
      /** Id da mensagem no WhatsApp: vira a chave idempotente do evento. */
      id: string;
      /** Só dígitos, com DDI (ex.: 5582999990000). É a chave da conversa. */
      telefone: string;
      nome: string | null;
      texto: string;
    }
  | { tipo: "conexao"; instancia: string; estado: string }
  | { tipo: "ignorado"; motivo: string };

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Texto de uma mensagem do WhatsApp (conversa simples, texto estendido, legenda de foto/vídeo, resposta de botão). */
export function textoDaMensagem(mensagem: Record<string, unknown>): string | null {
  if (typeof mensagem["conversation"] === "string") return mensagem["conversation"];
  const estendida = objeto(mensagem["extendedTextMessage"]);
  if (typeof estendida["text"] === "string") return estendida["text"];
  for (const tipo of ["imageMessage", "videoMessage", "documentMessage"]) {
    const legenda = objeto(mensagem[tipo])["caption"];
    if (typeof legenda === "string" && legenda.trim()) return legenda;
  }
  const botao = objeto(mensagem["buttonsResponseMessage"])["selectedDisplayText"];
  if (typeof botao === "string") return botao;
  const lista = objeto(objeto(mensagem["listResponseMessage"])["singleSelectReply"])[
    "selectedRowId"
  ];
  if (typeof lista === "string") return lista;
  return null;
}

export function lerAvisoDaEvolution(corpo: unknown): EntradaDaEvolution {
  const c = objeto(corpo);
  const evento = String(c["event"] ?? "")
    .toLowerCase()
    .replace(/_/g, ".");
  const instancia = typeof c["instance"] === "string" ? c["instance"] : "";
  if (!instancia) return { tipo: "ignorado", motivo: "sem_instancia" };
  const dados = objeto(c["data"]);

  if (evento === "connection.update")
    return {
      tipo: "conexao",
      instancia,
      estado: String(dados["state"] ?? dados["connection"] ?? ""),
    };
  if (evento !== "messages.upsert")
    return { tipo: "ignorado", motivo: `evento:${evento || "vazio"}` };

  const chave = objeto(dados["key"]);
  if (chave["fromMe"] === true) return { tipo: "ignorado", motivo: "enviada_pelo_proprio_numero" };
  const jid = String(chave["remoteJid"] ?? "");
  if (!jid.endsWith("@s.whatsapp.net"))
    return { tipo: "ignorado", motivo: "nao_e_conversa_individual" };
  const telefone = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
  const id = typeof chave["id"] === "string" ? chave["id"] : "";
  if (!telefone || !id) return { tipo: "ignorado", motivo: "sem_telefone_ou_id" };
  const texto = textoDaMensagem(objeto(dados["message"]));
  if (texto === null || !texto.trim()) return { tipo: "ignorado", motivo: "sem_texto" };
  const nome =
    typeof dados["pushName"] === "string" && dados["pushName"].trim()
      ? dados["pushName"].trim()
      : null;
  return { tipo: "mensagem", instancia, id, telefone, nome, texto: texto.slice(0, 4000) };
}
