import { describe, expect, it, vi } from "vitest";
import {
  consultarConexaoGatewayAlvo,
  enviarTextoViaGatewayAlvo,
} from "../src/gateway-alvo.js";

const TOKEN = "token-privado-de-projeto-apenas-ficticio";
const CHAVE = "chave-estavel-123456";
const cfg = { url: "https://evolution.exemplo/", token: TOKEN };

describe("gateway Evolution Alvo", () => {
  it("usa Bearer, URL de projeto e Idempotency-Key obrigatória", async () => {
    const fetchFake = vi.fn(async () =>
      new Response(JSON.stringify({ status: "accepted", request: CHAVE, key: { id: "MSG-1" } }), {
        status: 202,
      }),
    );
    const result = await enviarTextoViaGatewayAlvo(
      { ...cfg, fetch: fetchFake },
      "+55 (82) 99999-0000",
      "Olá, atendimento de teste",
      CHAVE,
    );
    expect(result).toEqual({ ok: true, id: "MSG-1" });
    expect(fetchFake).toHaveBeenCalledOnce();
    const [url, options] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://evolution.exemplo/v1/messages/text");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      authorization: "Bearer " + TOKEN,
      "Idempotency-Key": CHAVE,
    });
    expect(JSON.parse(String(options.body))).toEqual({
      number: "5582999990000",
      text: "Olá, atendimento de teste",
    });
    expect(options.redirect).toBe("error");
  });

  it("aceita replay aceito com status 200, sem presumir entrega", async () => {
    const result = await enviarTextoViaGatewayAlvo(
      {
        ...cfg,
        fetch: vi.fn(async () =>
          new Response(JSON.stringify({ status: "accepted", request: CHAVE }), { status: 200 }),
        ),
      },
      "5582999990000",
      "Oi",
      CHAVE,
    );
    expect(result).toEqual({ ok: true });
  });

  it("marca resposta desconhecida e timeouts como incertos, nunca gera nova chave", async () => {
    const unknown = await enviarTextoViaGatewayAlvo(
      {
        ...cfg,
        fetch: vi.fn(async () =>
          new Response(JSON.stringify({ status: "unknown" }), { status: 409 }),
        ),
      },
      "5582999990000",
      "Oi",
      CHAVE,
    );
    expect(unknown).toEqual({ ok: false, incerto: true, erro: "gateway_envio_incerto" });

    const timeout = await enviarTextoViaGatewayAlvo(
      { ...cfg, fetch: vi.fn(async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) },
      "5582999990000",
      "Oi",
      CHAVE,
    );
    expect(timeout).toEqual({ ok: false, incerto: true, erro: "gateway_timeout_incerto" });
    expect(JSON.stringify(timeout)).not.toContain(TOKEN);
  });

  it("falha fechada com URLs não-HTTPS, token vazio, chave inválida e contato inválido", async () => {
    const never = vi.fn();
    expect((await enviarTextoViaGatewayAlvo({ ...cfg, url: "http://exemplo", fetch: never }, "5582999990000", "Oi", CHAVE)).ok).toBe(false);
    expect((await enviarTextoViaGatewayAlvo({ ...cfg, token: "", fetch: never }, "5582999990000", "Oi", CHAVE)).ok).toBe(false);
    expect((await enviarTextoViaGatewayAlvo({ ...cfg, fetch: never }, "5582999990000", "Oi", "curta")).ok).toBe(false);
    expect((await enviarTextoViaGatewayAlvo({ ...cfg, fetch: never }, "invalido", "Oi", CHAVE)).ok).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  it("trata conexão despareada e erro 401 sem expor segredos", async () => {
    const disconnected = await enviarTextoViaGatewayAlvo(
      { ...cfg, fetch: vi.fn(async () => new Response('{"error":"desconectado"}', { status: 409 })) },
      "5582999990000", "Oi", CHAVE,
    );
    expect(disconnected.erro).toBe("gateway_conflito_ou_desconectado");
    const auth = await enviarTextoViaGatewayAlvo(
      { ...cfg, fetch: vi.fn(async () => new Response("sem acesso", { status: 401 })) },
      "5582999990000", "Oi", CHAVE,
    );
    expect(auth).toEqual({ ok: false, erro: "gateway_http_401" });
    expect(JSON.stringify(auth)).not.toContain(TOKEN);
  });

  it("consulta status de conexão apenas no escopo do token", async () => {
    const fetchFake = vi.fn(async () =>
      new Response(JSON.stringify({ project: "flowbot", state: "unconfigured" }), { status: 200 }),
    );
    const status = await consultarConexaoGatewayAlvo({ ...cfg, fetch: fetchFake });
    expect(status).toEqual({ ok: true, state: "unconfigured" });
    const [url, options] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://evolution.exemplo/v1/connection");
    expect(options.headers).toMatchObject({ authorization: "Bearer " + TOKEN });
  });
});
