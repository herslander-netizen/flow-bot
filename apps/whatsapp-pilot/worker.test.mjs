import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./worker.mjs";

const inst = "flowbot-test-instance";
const secret = "w".repeat(48);
const token = "token-ficticio-e-isolado";
const contato = "5582999990000";

function dbFake() {
  const events = new Map();
  const sessions = new Map();
  return {
    events,
    sessions,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.startsWith("SELECT 1 AS blocked")) {
                const [instance, phone] = args;
                return [...events.values()].some(
                  (e) =>
                    e.instance === instance &&
                    e.contact === phone &&
                    ["unknown", "processing"].includes(e.outcome),
                )
                  ? { blocked: 1 }
                  : null;
              }
              if (sql.startsWith("SELECT expires_at")) {
                return sessions.get(args[0] + ":" + args[1]) ?? null;
              }
              if (sql.startsWith("SELECT count(*)")) {
                return {
                  total: [...events.values()].filter(
                    (e) =>
                      e.instance === args[0] && e.contact === args[1] && e.created_at >= args[2],
                  ).length,
                };
              }
              throw new Error("query não simulada: " + sql);
            },
            async run() {
              if (sql.startsWith("INSERT OR IGNORE")) {
                const [instance, id, phone, at] = args;
                const key = instance + ":" + id;
                if (events.has(key)) return { meta: { changes: 0 } };
                events.set(key, {
                  instance,
                  id,
                  contact: phone,
                  outcome: "processing",
                  created_at: at,
                });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("UPDATE pilot_events")) {
                if (sql.includes("rate_limited")) {
                  const e = events.get(args[0] + ":" + args[1]);
                  e.outcome = "rate_limited";
                  return { meta: { changes: 1 } };
                }
                const e = events.get(args[2] + ":" + args[3]);
                e.outcome = args[0];
                e.provider_message_id = args[1];
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("INSERT INTO pilot_sessions")) {
                sessions.set(args[0] + ":" + args[1], { expires_at: args[2] });
                return { meta: { changes: 1 } };
              }
              throw new Error("update não simulado: " + sql);
            },
          };
        },
      };
    },
  };
}
function env(db = dbFake(), extras = {}) {
  return {
    DB: db,
    INSTANCE_NAME: inst,
    PILOT_ENABLED: "1",
    WEBHOOK_SECRET: secret,
    EVOLUTION_ALVO_TOKEN: token,
    ...extras,
  };
}
function chamada(
  text,
  { id = "inbound-1", fromMe = false, instance = inst, headers = {}, buttonId = null } = {},
) {
  return new Request("https://flowbot-test.example/webhooks/evolution", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": secret,
      ...headers,
    },
    body: JSON.stringify({
      event: "messages.upsert",
      instance,
      data: {
        key: { id, fromMe, remoteJid: contato + "@s.whatsapp.net" },
        message: buttonId
          ? { buttonsResponseMessage: { selectedButtonId: buttonId } }
          : { conversation: text },
      },
    }),
  });
}
async function resposta(r) {
  return { status: r.status, body: await r.json() };
}

afterEach(() => vi.unstubAllGlobals());

describe("piloto Cloudflare FlowBot", () => {
  it("começa desativado e não expõe credenciais em /health", async () => {
    const e = env(dbFake(), { PILOT_ENABLED: "0" });
    const r = await resposta(await worker.fetch(new Request("https://test/health"), e));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, configured: true, enabled: false });
    expect(JSON.stringify(r.body)).not.toContain(secret);
    expect(JSON.stringify(r.body)).not.toContain(token);
    expect((await worker.fetch(chamada("teste flowbot"), e)).status).toBe(503);
  });

  it("rejeita webhook sem segredo, com segredo incorreto ou com instância diferente", async () => {
    const db = dbFake();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const e = env(db);
    expect(
      (
        await worker.fetch(
          chamada("teste flowbot", { headers: { "x-webhook-secret": "errado" } }),
          e,
        )
      ).status,
    ).toBe(401);
    const wrong = await resposta(
      await worker.fetch(chamada("teste flowbot", { instance: "outra" }), e),
    );
    expect(wrong.body).toMatchObject({ ignored: true });
    expect(db.events.size).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("ignora ecos fromMe, grupos e frases fora do teste", async () => {
    const db = dbFake();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const e = env(db);
    expect(
      (await resposta(await worker.fetch(chamada("teste flowbot", { fromMe: true }), e))).body
        .ignored,
    ).toBe(true);
    expect((await resposta(await worker.fetch(chamada("Olá"), e))).body.ignored).toBe(true);
    expect(db.events.size).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("responde somente uma vez a uma saudação, depois às opções 1 e 2", async () => {
    const db = dbFake();
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts) => {
        calls.push({ url, headers: opts.headers, data: JSON.parse(opts.body) });
        return new Response(
          JSON.stringify({ status: "accepted", key: { id: "out-" + calls.length } }),
          { status: 202 },
        );
      }),
    );
    const e = env(db);
    const first = await resposta(await worker.fetch(chamada("teste flowbot"), e));
    expect(first.body).toMatchObject({ ok: true, outcome: "sent" });
    const repeat = await resposta(await worker.fetch(chamada("teste flowbot"), e));
    expect(repeat.body).toMatchObject({ ok: true, duplicate: true });
    const second = await resposta(
      await worker.fetch(chamada(null, { id: "inbound-2", buttonId: "1" }), e),
    );
    expect(second.body.outcome).toBe("sent");
    expect(calls).toHaveLength(2);
    expect(calls[0].headers.authorization).toBe("Bearer " + token);
    expect(calls[0].headers["Idempotency-Key"]).toMatch(/^flowbot:[0-9a-f]{64}:buttons$/);
    expect(calls[0].url).toContain("/v1/messages/buttons");
    expect(calls[0].data.buttons).toHaveLength(2);
    expect(calls[0].data.buttons[1]).toMatchObject({ id: "2" });
    expect(calls[0].data.number).toBe(contato);
    expect(calls[1].data.text).toContain("automatizar conversas");
    expect(calls[1].url).toContain("/v1/messages/text");
  });

  it("rejeição definitiva dos botões envia menu de texto com outra chave idempotente", async () => {
    const db = dbFake();
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        calls.push({ url, headers: options.headers, data: JSON.parse(options.body) });
        return url.endsWith("/buttons")
          ? new Response(JSON.stringify({ error: "unsupported" }), { status: 422 })
          : new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
      }),
    );
    const r = await resposta(await worker.fetch(chamada("teste flowbot"), env(db)));
    expect(r.body.outcome).toBe("sent");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/buttons");
    expect(calls[1].url).toContain("/text");
    expect(calls[1].data.text).toContain("Digite:");
    expect(calls[0].headers["Idempotency-Key"]).not.toBe(calls[1].headers["Idempotency-Key"]);
  });

  it("menu texto permite alternativa manual quando o WhatsApp não exibe botões", async () => {
    const db = dbFake();
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts) => {
        calls.push({ url, data: JSON.parse(opts.body) });
        return new Response(JSON.stringify({ status: "accepted" }), { status: 202 });
      }),
    );
    const r = await resposta(await worker.fetch(chamada("menu texto"), env(db)));
    expect(r.body.outcome).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/text");
    expect(calls[0].data.text).toContain("Conhecer o FlowBot");
  });

  it("botões aceitos não disparam um segundo menu por precaução", async () => {
    const db = dbFake();
    const f = vi.fn(
      async () => new Response(JSON.stringify({ status: "accepted" }), { status: 202 }),
    );
    vi.stubGlobal("fetch", f);
    const r = await resposta(await worker.fetch(chamada("teste flowbot"), env(db)));
    expect(r.body.outcome).toBe("sent");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("resultado unknown bloqueia outros envios da conversa", async () => {
    const db = dbFake();
    const f = vi.fn(
      async () => new Response(JSON.stringify({ status: "unknown" }), { status: 409 }),
    );
    vi.stubGlobal("fetch", f);
    const e = env(db);
    const first = await resposta(await worker.fetch(chamada("teste flowbot"), e));
    expect(first.body.outcome).toBe("unknown");
    const next = await resposta(
      await worker.fetch(chamada("teste flowbot", { id: "inbound-2" }), e),
    );
    expect(next.body.blocked).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("não envia duas mensagens quando o gateway responde 401", async () => {
    const db = dbFake();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 })),
    );
    const r = await resposta(await worker.fetch(chamada("teste flowbot"), env(db)));
    expect(r.body.outcome).toBe("failed");
    expect([...db.events.values()][0].outcome).toBe("failed");
  });
});
