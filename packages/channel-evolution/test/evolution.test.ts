import { describe, expect, it, vi } from "vitest";

import {
  configurarWebhook,
  enviarTexto,
  lerAvisoDaEvolution,
  textoParaOCliente,
} from "../src/index.js";

const aviso = (data: Record<string, unknown>, event = "messages.upsert") => ({
  event,
  instance: "flow-studio",
  data,
});
const mensagem = (extra: Record<string, unknown> = {}, key: Record<string, unknown> = {}) =>
  aviso({
    key: { remoteJid: "5582999990000@s.whatsapp.net", fromMe: false, id: "ABC123", ...key },
    pushName: "Ana Souza",
    message: { conversation: "Oi, quanto custa?" },
    ...extra,
  });

describe("lerAvisoDaEvolution", () => {
  it("mensagem de texto de uma pessoa vira evento", () => {
    expect(lerAvisoDaEvolution(mensagem())).toEqual({
      tipo: "mensagem",
      instancia: "flow-studio",
      id: "ABC123",
      telefone: "5582999990000",
      nome: "Ana Souza",
      texto: "Oi, quanto custa?",
    });
  });

  it("aceita texto estendido, legenda e evento em maiúsculas", () => {
    expect(
      lerAvisoDaEvolution(mensagem({ message: { extendedTextMessage: { text: "oi" } } })),
    ).toMatchObject({
      texto: "oi",
    });
    expect(
      lerAvisoDaEvolution(mensagem({ message: { imageMessage: { caption: "e esse?" } } })),
    ).toMatchObject({
      texto: "e esse?",
    });
    expect(lerAvisoDaEvolution({ ...mensagem(), event: "MESSAGES_UPSERT" })).toMatchObject({
      tipo: "mensagem",
    });
  });

  it.each([
    [mensagem({}, { fromMe: true }), "enviada_pelo_proprio_numero"],
    [mensagem({}, { remoteJid: "123456@g.us" }), "nao_e_conversa_individual"],
    [mensagem({}, { remoteJid: "status@broadcast" }), "nao_e_conversa_individual"],
    [mensagem({ message: { audioMessage: {} } }), "sem_texto"],
    [mensagem({}, { id: undefined }), "sem_telefone_ou_id"],
    [aviso({}, "presence.update"), "evento:presence.update"],
    [{ event: "messages.upsert", data: {} }, "sem_instancia"],
    ["lixo", "sem_instancia"],
  ])("ignora %#", (corpo, motivo) => {
    expect(lerAvisoDaEvolution(corpo)).toEqual({ tipo: "ignorado", motivo });
  });

  it("conexão", () => {
    expect(lerAvisoDaEvolution(aviso({ state: "open" }, "connection.update"))).toEqual({
      tipo: "conexao",
      instancia: "flow-studio",
      estado: "open",
    });
  });
});

describe("saída", () => {
  it("menu vira lista numerada; encaminhamento não vai para o cliente", () => {
    expect(
      textoParaOCliente({
        type: "send_quick_replies",
        nodeId: "m",
        text: "Como posso ajudar?",
        options: [
          { value: "1", label: "Agendar" },
          { value: "2", label: "Preços" },
        ],
        delayMs: 0,
      }),
    ).toBe("Como posso ajudar?\n1. Agendar\n2. Preços");
    expect(textoParaOCliente({ type: "handoff", nodeId: "h" })).toBeNull();
  });

  it("envia pela API da Evolution com a chave no cabeçalho", async () => {
    const f = vi.fn(
      async () => new Response(JSON.stringify({ key: { id: "MSG1" } }), { status: 201 }),
    );
    const r = await enviarTexto(
      { url: "https://evo.exemplo/", apiKey: "k", fetch: f },
      "flow studio",
      "+55 82 99999-0000",
      "Oi",
    );
    expect(r).toEqual({ ok: true, id: "MSG1" });
    expect(f).toHaveBeenCalledWith(
      "https://evo.exemplo/message/sendText/flow%20studio",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json", apikey: "k" },
        body: JSON.stringify({ number: "5582999990000", text: "Oi" }),
      }),
    );
  });

  it("erro HTTP e falha de rede viram falha (para nova tentativa)", async () => {
    const http = vi.fn(async () => new Response("instância desconectada", { status: 400 }));
    expect(
      await enviarTexto({ url: "https://evo", apiKey: "k", fetch: http }, "i", "1", "x"),
    ).toEqual({
      ok: false,
      erro: "evolution_http_400: instância desconectada",
    });
    const rede = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const r = await enviarTexto({ url: "https://evo", apiKey: "k", fetch: rede }, "i", "1", "x");
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("evolution_rede");
  });
});

describe("configurarWebhook", () => {
  it("registra o webhook com o segredo no cabeçalho", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 201 }));
    expect(
      await configurarWebhook(
        { url: "https://evo", apiKey: "k", fetch: f },
        "flow-studio",
        "https://bot/webhooks/evolution",
        "s",
      ),
    ).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://evo/webhook/set/flow-studio");
    expect(JSON.parse(String(init.body))).toEqual({
      webhook: {
        enabled: true,
        url: "https://bot/webhooks/evolution",
        byEvents: false,
        base64: false,
        headers: { "x-webhook-secret": "s" },
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    });
  });
});
