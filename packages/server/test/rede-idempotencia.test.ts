import { describe, expect, it } from "vitest";

import { chamarJson } from "../src/rede.js";

describe("chamarJson", () => {
  it("transmite a chave de idempotência de uma ação externa", async () => {
    let requisicao: RequestInit | undefined;
    const buscar: typeof fetch = async (_url, opcoes) => {
      requisicao = opcoes;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const resultado = await chamarJson("https://api.exemplo.com/acao", {
      metodo: "POST",
      corpo: { id: "abc" },
      timeoutMs: 1000,
      idempotencyKey: "webhook:instancia:evento#0",
      fetch: buscar,
    });

    expect(resultado).toEqual({ ok: true, status: 200, json: { ok: true } });
    expect(requisicao?.headers).toMatchObject({
      "content-type": "application/json",
      "idempotency-key": "webhook:instancia:evento#0",
    });
  });
});
