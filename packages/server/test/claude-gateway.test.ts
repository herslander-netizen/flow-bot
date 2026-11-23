import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";

import { migrar } from "@flow-bot/store-postgres";
import type { FlowBot } from "@flow-bot/store-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  gerarRascunhoClaude,
  reservarPedidoClaude,
  validarSolicitacaoClaude,
} from "../src/claude-gateway.js";
import { carregarConfig } from "../src/config.js";
import { criarServidor } from "../src/servidor.js";

const operador = "o".repeat(40);
const evento = {
  workspaceId: "tenant-claude",
  conversationKey: "5582999990000",
  requestKey: "claude-pedido-0000001",
  message: "Quanto custa?",
  facts: { "reality.businessName": "Estúdio A", "reality.prices": "Corte: R$ 40" },
};
const cfg = {
  enabled: true,
  apiKey: "test-only-key",
  model: "claude-haiku-4-5-20251001",
  dailyLimit: 2,
  maxOutputTokens: 256,
};
function claudeFake(reply = { draft: "O corte custa R$ 40.", needsHuman: false }) {
  return new Response(
    JSON.stringify({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(reply) }],
      usage: { input_tokens: 43, output_tokens: 21 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Gateway Claude - validação e saída", () => {
  it("aceita apenas fatos limitados e mensagem curta", () => {
    expect(validarSolicitacaoClaude(evento)).toMatchObject(evento);
    expect(validarSolicitacaoClaude({ ...evento, message: "a".repeat(2001) })).toBeNull();
    expect(validarSolicitacaoClaude({ ...evento, facts: { secret: "vazamento" } })).toBeNull();
    expect(validarSolicitacaoClaude({ ...evento, facts: {} })).toBeNull();
    expect(validarSolicitacaoClaude({ ...evento, conversationKey: "grupo@g.us" })).toBeNull();
  });

  it("não chama o fornecedor quando o Claude está desligado", async () => {
    const fake = vi.fn();
    const r = await gerarRascunhoClaude({ ...cfg, enabled: false }, evento, fake);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(fake).not.toHaveBeenCalled();
  });

  it("envia só dados mínimos à API e não inclui telefone ou chave idempotente", async () => {
    const fake = vi.fn(async () => claudeFake());
    const r = await gerarRascunhoClaude(cfg, evento, fake);
    expect(r).toMatchObject({
      ok: true,
      draft: "O corte custa R$ 40.",
      needsHuman: false,
      usage: { inputTokens: 43, outputTokens: 21 },
    });
    expect(fake).toHaveBeenCalledOnce();
    const [url, request] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = request.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(cfg.apiKey);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = String(request.body);
    expect(body).toContain("Estúdio A");
    expect(body).not.toContain(evento.conversationKey);
    expect(body).not.toContain(evento.requestKey);
    expect(JSON.parse(body).max_tokens).toBe(256);
    expect(request.redirect).toBe("error");
  });

  it("descarta resposta truncada e JSON não validado", async () => {
    const truncated = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            stop_reason: "max_tokens",
            content: [
              { type: "text", text: JSON.stringify({ draft: "truncado", needsHuman: false }) },
            ],
          }),
          { status: 200 },
        ),
    );
    expect(await gerarRascunhoClaude(cfg, evento, truncated)).toMatchObject({
      ok: false,
      error: "claude_resposta_incompleta",
    });
    const invalid = vi.fn(async () => claudeFake({ draft: "x".repeat(601), needsHuman: false }));
    expect(await gerarRascunhoClaude(cfg, evento, invalid)).toMatchObject({
      ok: false,
      error: "claude_rascunho_invalido",
    });
  });

  it("não faz retry nem expõe credenciais em respostas 401, 429 ou rede", async () => {
    const fake = vi.fn(async () => new Response("Chave inválida", { status: 401 }));
    const fail = await gerarRascunhoClaude(cfg, evento, fake);
    expect(fail).toMatchObject({ ok: false, error: "claude_credencial_invalida" });
    expect(JSON.stringify(fail)).not.toContain(cfg.apiKey);
    expect(fake).toHaveBeenCalledOnce();
    const rate = vi.fn(async () => new Response("", { status: 429 }));
    expect(await gerarRascunhoClaude(cfg, evento, rate)).toMatchObject({
      ok: false,
      status: 429,
    });
    const network = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await gerarRascunhoClaude(cfg, evento, network)).toMatchObject({
      ok: false,
      error: "claude_rede_inconclusiva",
    });
    expect(network).toHaveBeenCalledOnce();
  });

  it("não aceita habilitar a integração sem chave e modelo explícitos", () => {
    const base = {
      DATABASE_URL: "postgres://teste",
      EVOLUTION_URL: "https://evolution.exemplo",
      EVOLUTION_API_KEY: "evo",
      EVOLUTION_WEBHOOK_SECRET: "s".repeat(40),
      OPERADOR: operador,
      FLOWBOT_CLAUDE_ENABLED: "1",
    };
    const workspaces = {
      workspaces: [
        {
          id: "tenant-claude",
          instance: "instancia",
          flowId: "flow",
          operatorTokenEnv: "OPERADOR",
          claudeEnabled: true,
        },
      ],
    };
    expect(() => carregarConfig(base, workspaces)).toThrow("ANTHROPIC_API_KEY");
    const ready = carregarConfig(
      {
        ...base,
        ANTHROPIC_API_KEY: "test-key",
        FLOWBOT_CLAUDE_MODEL: cfg.model,
      },
      workspaces,
    );
    expect(ready.claude.enabled).toBe(true);
    expect(ready.workspaces[0]?.claudeEnabled).toBe(true);
    expect(() =>
      carregarConfig(
        {
          ...base,
          ANTHROPIC_API_KEY: "test-key",
          FLOWBOT_CLAUDE_MODEL: cfg.model,
          FLOWBOT_CLAUDE_DAILY_LIMIT: "9999",
        },
        workspaces,
      ),
    ).toThrow("Limites Claude");
  });
});

describe.skipIf(!process.env["DATABASE_URL"])("Gateway Claude - cota persistente", () => {
  let pool: pg.Pool;
  let server: Server;
  let address: string;
  let chamadas = 0;
  let envWorkspace: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"], max: 4 });
    await migrar(pool);
    envWorkspace = "claude-" + randomUUID();
    const serverCfg = carregarConfig(
      {
        DATABASE_URL: process.env["DATABASE_URL"],
        EVOLUTION_URL: "https://evolution.exemplo",
        EVOLUTION_API_KEY: "evo",
        EVOLUTION_WEBHOOK_SECRET: "s".repeat(40),
        OPERADOR: operador,
        ANTHROPIC_API_KEY: "test-key",
        FLOWBOT_CLAUDE_MODEL: cfg.model,
        FLOWBOT_CLAUDE_ENABLED: "1",
        FLOWBOT_CLAUDE_DAILY_LIMIT: "2",
      },
      {
        workspaces: [
          {
            id: envWorkspace,
            instance: "instancia-" + envWorkspace,
            flowId: "flow",
            operatorTokenEnv: "OPERADOR",
            claudeEnabled: true,
          },
        ],
      },
    );
    server = criarServidor({
      cfg: serverCfg,
      bot: {} as FlowBot,
      pool,
      adaptador: async () => {
        throw new Error("Claude não pode enviar WhatsApp");
      },
      claudeFetch: vi.fn(async () => {
        chamadas++;
        return claudeFake();
      }),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    address = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await pool.end();
  });

  async function solicitar(key: string, token = operador, workspace = envWorkspace) {
    return fetch(address + "/ops/ai/claude/draft", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({
        ...evento,
        workspaceId: workspace,
        requestKey: key,
      }),
    });
  }

  it("não autoriza outro token, workspace ou segredo de webhook", async () => {
    expect((await solicitar("auth-0000000000001", "incorreto")).status).toBe(401);
    expect((await solicitar("auth-0000000000002", "s".repeat(40))).status).toBe(401);
    expect((await solicitar("auth-0000000000003", operador, "outro")).status).toBe(401);
    expect(chamadas).toBe(0);
  });

  it("entrega rascunho apenas pelo operador, nunca mensagem WhatsApp", async () => {
    const r = await solicitar("pedido-claude-00000001");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      ok: true,
      draft: "O corte custa R$ 40.",
      needsHuman: false,
    });
    expect(chamadas).toBe(1);
  });

  it("idempotência evita cobrança repetida; cota bloqueia o terceiro pedido", async () => {
    const repeated = await solicitar("pedido-claude-00000001");
    expect(repeated.status).toBe(409);
    expect(chamadas).toBe(1);
    expect((await solicitar("pedido-claude-00000002")).status).toBe(200);
    expect((await solicitar("pedido-claude-00000003")).status).toBe(429);
    expect(chamadas).toBe(2);
  });

  it("a quota é isolada por workspace no PostgreSQL", async () => {
    const another = envWorkspace + "-second";
    expect(await reservarPedidoClaude(pool, another, "another-key-0000001", 1)).toBe("reserved");
    expect(await reservarPedidoClaude(pool, another, "another-key-0000001", 1)).toBe("duplicate");
    expect(await reservarPedidoClaude(pool, another, "another-key-0000002", 1)).toBe("limit");
  });
});
