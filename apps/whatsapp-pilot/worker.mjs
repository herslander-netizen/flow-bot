/**
 * FlowBot: piloto isolado para homologar Evolution Alvo via Cloudflare Workers.
 * Não é o motor conversacional completo nem compartilha credenciais com Flow/Alvo OS.
 * Somente respostas a "teste flowbot" e, depois, às opções 1/2 por 24h.
 * Os envios são at-most-once por evento: incerteza bloqueia a conversa.
 */
const URL_GATEWAY = "https://evolution-alvo.regalbrink4.chatgpt.site";
const TE = new TextEncoder();
const LIMITE_CORPO = 32768;
const DIAS_RETENCAO = 30;
const SEGUNDOS_SESSAO = 86400;
const GATILHOS = new Set(["teste flowbot", "flowbot teste", "oi flowbot", "ola flowbot"]);

function responder(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", TE.encode(value));
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join("");
}
async function credencialValida(recebido, esperado) {
  if (!recebido || !esperado || recebido.length > 256 || esperado.length < 32) return false;
  const [a, b] = await Promise.all([hash(recebido), hash(esperado)]);
  // Strings da mesma largura após o hash; nenhuma comparação por prefixo.
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function corpoLimitado(request) {
  const indicado = Number(request.headers.get("content-length") || 0);
  if (indicado > LIMITE_CORPO) throw new Error("corpo_grande");
  let bytes = 0;
  const chunks = [];
  const reader = request.body?.getReader();
  if (!reader) throw new Error("corpo_vazio");
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > LIMITE_CORPO) throw new Error("corpo_grande");
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    buffer.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}

function textoNormalizado(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function lerEvento(corpo, instance) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  if (String(corpo.instance ?? "") !== instance) return null;
  if (
    String(corpo.event ?? "")
      .toLowerCase()
      .replace(/_/g, ".") !== "messages.upsert"
  )
    return null;
  const data = corpo.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const key = data.key;
  if (!key || typeof key !== "object" || key.fromMe !== false) return null;
  const id = typeof key.id === "string" ? key.id : "";
  if (!id || id.length > 200) return null;
  const jid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (!jid.endsWith("@s.whatsapp.net")) return null;
  const contact = jid.split("@")[0];
  if (!/^\d{10,15}$/.test(contact)) return null;
  const message = data.message;
  if (!message || typeof message !== "object") return null;
  const input =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.buttonsResponseMessage?.selectedButtonId ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (typeof input !== "string" || input.length > 1000) return null;
  return { id, contact, input: textoNormalizado(input) };
}

function respostaDoPiloto(input, sessionActive) {
  if (GATILHOS.has(input) || input === "menu" || input === "menu texto") {
    return "👋 *FlowBot — teste de atendimento*\n\nConexão WhatsApp funcionando! ✅\n\nDigite:\n*1* — Conhecer o FlowBot\n*2* — Atendimento humano (simulação)\n\n_Este é um ambiente de homologação._";
  }
  if (!sessionActive) return null;
  if (input === "1")
    return "O FlowBot está sendo preparado para automatizar conversas e organizar atendimentos. Este número está em modo de teste, sem agendamento real.";
  if (input === "2")
    return "Solicitação de atendimento humano recebida *apenas neste teste*. A transferência automática ainda não está ativada.";
  return null;
}

const BOTOES_TESTE = [
  { id: "1", displayText: "Conhecer FlowBot" },
  { id: "2", displayText: "Falar com atendente" },
];

async function enviarGateway(env, numero, mensagem, key) {
  const formato = mensagem.type === "buttons" ? "buttons" : "text";
  const corpo =
    formato === "buttons"
      ? {
          number: numero,
          title: "FlowBot — atendimento de teste",
          description: "Bem-vindo! Como posso ajudar? (ambiente de homologação)",
          footer: "Se os botões não aparecerem, envie: menu texto",
          buttons: BOTOES_TESTE,
        }
      : { number: numero, text: mensagem.text };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(URL_GATEWAY + "/v1/messages/" + formato, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + env.EVOLUTION_ALVO_TOKEN,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(corpo),
      signal: controller.signal,
      redirect: "error",
    });
    const obj = await r.json().catch(() => null);
    if ((r.status === 200 || r.status === 202) && obj?.status === "accepted")
      return { outcome: "sent", id: typeof obj.key?.id === "string" ? obj.key.id : null };
    if (obj?.status === "unknown" || obj?.status === "pending")
      return { outcome: "unknown", id: null };
    // Apenas rejeição definitiva de um envio interativo permite o menu alternativo.
    // Uma aceitação pode ter chegado ao WhatsApp: nunca enviar fallback nesse caso.
    if (formato === "buttons" && [400, 404, 405, 415, 422].includes(r.status))
      return { outcome: "unsupported", id: null };
    if ([400, 401, 403, 404, 405, 413, 415, 422].includes(r.status))
      return { outcome: "failed", id: null };
    return { outcome: "unknown", id: null };
  } catch {
    return { outcome: "unknown", id: null };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      return responder(200, {
        ok: true,
        component: "flowbot-whatsapp-pilot",
        configured: Boolean(
          env.DB && env.WEBHOOK_SECRET && env.EVOLUTION_ALVO_TOKEN && env.INSTANCE_NAME,
        ),
        enabled: env.PILOT_ENABLED === "1",
      });
    }
    if (request.method === "GET" && path === "/connection-status") {
      if (!env.EVOLUTION_ALVO_TOKEN) return responder(503, { ok: false, reason: "no_token" });
      try {
        const upstream = await fetch(URL_GATEWAY + "/v1/connection", {
          headers: {
            authorization: "Bearer " + env.EVOLUTION_ALVO_TOKEN,
            accept: "application/json",
          },
          redirect: "error",
          signal: AbortSignal.timeout(6000),
        });
        const value = await upstream.json().catch(() => null);
        const state = ["open", "close", "connecting", "unconfigured"].includes(value?.state)
          ? value.state
          : "unknown";
        return responder(upstream.ok ? 200 : 502, {
          ok: upstream.ok,
          state: upstream.ok ? state : "unknown",
          upstreamStatus: upstream.status,
        });
      } catch {
        return responder(503, { ok: false, reason: "upstream_unavailable" });
      }
    }
    if (path !== "/webhooks/evolution") return responder(404, { error: "not_found" });
    if (request.method !== "POST") return responder(405, { error: "method_not_allowed" });
    if (
      !env.DB ||
      !env.INSTANCE_NAME ||
      !env.WEBHOOK_SECRET ||
      !env.EVOLUTION_ALVO_TOKEN ||
      env.PILOT_ENABLED !== "1"
    )
      return responder(503, { error: "pilot_disabled" });
    if (!(await credencialValida(request.headers.get("x-webhook-secret"), env.WEBHOOK_SECRET)))
      return responder(401, { error: "unauthorized" });

    let payload;
    try {
      payload = await corpoLimitado(request);
    } catch (e) {
      return responder(e?.message === "corpo_grande" ? 413 : 400, { error: "invalid_body" });
    }
    const event = lerEvento(payload, env.INSTANCE_NAME);
    if (!event) return responder(200, { ok: true, ignored: true });
    const now = Math.floor(Date.now() / 1000);

    const pending = await env.DB.prepare(
      "SELECT 1 AS blocked FROM pilot_events WHERE instance = ? AND contact = ? AND outcome IN ('unknown', 'processing') LIMIT 1",
    )
      .bind(env.INSTANCE_NAME, event.contact)
      .first();
    if (pending) return responder(200, { ok: true, blocked: true });

    const previous = await env.DB.prepare(
      "SELECT expires_at FROM pilot_sessions WHERE instance = ? AND contact = ?",
    )
      .bind(env.INSTANCE_NAME, event.contact)
      .first();
    const sessionActive = Number(previous?.expires_at || 0) > now;
    const responseText = respostaDoPiloto(event.input, sessionActive);
    if (!responseText) return responder(200, { ok: true, ignored: true });

    // Sem texto pessoal no banco; deduplicação é feita pelo ID da Evolution.
    const inserted = await env.DB.prepare(
      "INSERT OR IGNORE INTO pilot_events (instance, event_id, contact, outcome, created_at) VALUES (?, ?, ?, 'processing', ?)",
    )
      .bind(env.INSTANCE_NAME, event.id, event.contact, now)
      .run();
    if ((inserted.meta?.changes ?? 0) === 0) return responder(200, { ok: true, duplicate: true });

    // Limite de teste por número para evitar disparos automáticos excessivos.
    const recent = await env.DB.prepare(
      "SELECT count(*) AS total FROM pilot_events WHERE instance = ? AND contact = ? AND created_at >= ?",
    )
      .bind(env.INSTANCE_NAME, event.contact, now - 60)
      .first();
    if (Number(recent?.total ?? 0) > 4) {
      await env.DB.prepare(
        "UPDATE pilot_events SET outcome = 'rate_limited' WHERE instance = ? AND event_id = ?",
      )
        .bind(env.INSTANCE_NAME, event.id)
        .run();
      return responder(200, { ok: true, rate_limited: true });
    }
    const idem = "flowbot:" + (await hash(env.INSTANCE_NAME + ":" + event.id));
    const usarBotoes = GATILHOS.has(event.input) && env.PILOT_INTERACTIVE_BUTTONS !== "0";
    let result = usarBotoes
      ? await enviarGateway(env, event.contact, { type: "buttons" }, idem + ":buttons")
      : await enviarGateway(
          env,
          event.contact,
          { type: "text", text: responseText },
          idem + ":text",
        );
    if (result.outcome === "unsupported") {
      result = await enviarGateway(
        env,
        event.contact,
        { type: "text", text: responseText },
        idem + ":text",
      );
    }
    await env.DB.prepare(
      "UPDATE pilot_events SET outcome = ?, provider_message_id = ? WHERE instance = ? AND event_id = ?",
    )
      .bind(result.outcome, result.id, env.INSTANCE_NAME, event.id)
      .run();

    if (result.outcome === "sent") {
      await env.DB.prepare(
        "INSERT INTO pilot_sessions (instance, contact, expires_at) VALUES (?, ?, ?) ON CONFLICT(instance, contact) DO UPDATE SET expires_at = excluded.expires_at",
      )
        .bind(env.INSTANCE_NAME, event.contact, now + SEGUNDOS_SESSAO)
        .run();
    }
    // Nunca entregar detalhes da requisição externa no webhook.
    return responder(200, { ok: true, outcome: result.outcome });
  },
  async scheduled(_controller, env) {
    const until = Math.floor(Date.now() / 1000) - DIAS_RETENCAO * 86400;
    await env.DB.prepare("DELETE FROM pilot_events WHERE created_at < ?").bind(until).run();
    await env.DB.prepare("DELETE FROM pilot_sessions WHERE expires_at < ?").bind(until).run();
  },
};
