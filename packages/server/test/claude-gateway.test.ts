import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import process from "node:process";

import type { FlowBot } from "@flow-bot/store-postgres";
import { migrar } from "@flow-bot/store-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  criarPropostaComClaude,
  reservarPedidoClaude,
  revisarPropostaDosAgentes,
  validarEntradaDaOficina,
} from "../src/claude-gateway.js";
import { carregarConfig } from "../src/config.js";
import { criarServidor } from "../src/servidor.js";

const flow = {
  schemaVersion: "flow-bot/v0",
  flow: {
    id: "modelo-exemplo",
    name: "Fluxo de teste",
    timezone: "America/Sao_Paulo",
    status: "draft",
    entryNodeId: "inicio",
  },
  limits: { maxStepsPerEvent: 20 },
  variables: [],
  nodes: [
    { id: "inicio", type: "trigger.message_received", config: {} },
    { id: "resposta", type: "message.text", config: { text: "Olá, bem-vindo!" } },
    { id: "fim", type: "action.end", config: {} },
  ],
  edges: [
    { id: "e1", from: "inicio", to: "resposta", port: "next" },
    { id: "e2", from: "resposta", to: "fim", port: "next" },
  ],
};
const scenarios = {
  scenarios: [
    {
      name: "Saudação simulada",
      steps: [{ say: "oi", expect: { contains: ["bem-vindo"] } }],
    },
  ],
};
const independentScenarios = {
  scenarios: [
    {
      name: "Saudação independente do operador",
      steps: [{ say: "bom dia", expect: { contains: ["bem-vindo"] } }],
    },
  ],
};
const resultRaw = {
  flow_json: JSON.stringify(flow),
  scenarios_json: JSON.stringify(scenarios),
  gaps: [],
};
const input = {
  workspaceId: "tenant-flowbot",
  requestKey: "flowbot-autoria-2026-0001",
  briefing: "Estúdio de teste. Cumprimente o cliente e informe apenas os serviços aprovados.",
};
const cfg = {
  enabled: true,
  apiKey: "key-exclusiva-de-teste",
  model: "modelo-claude-explicito",
  dailyLimit: 2,
  maxOutputTokens: 4096,
};
const successful = (value: unknown = resultRaw) =>
  new Response(
    JSON.stringify({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(value) }],
      usage: { input_tokens: 200, output_tokens: 1200 },
    }),
    { status: 200 },
  );

describe("Oficina multiagente: Claude produz, validadores controlam", () => {
  it("valida identidade e tamanho do briefing, sem conversas ou tokens arbitrários", () => {
    expect(validarEntradaDaOficina(input)).toMatchObject(input);
    expect(validarEntradaDaOficina({ ...input, workspaceId: "outro @tenant" })).toBeNull();
    expect(validarEntradaDaOficina({ ...input, requestKey: "curta" })).toBeNull();
    expect(validarEntradaDaOficina({ ...input, briefing: "x".repeat(6001) })).toBeNull();
    expect(validarEntradaDaOficina({ ...input, perfil: { invalid: true } })).toBeNull();
  });

  it("agentes validam o grafo e simulam sem canal nem publicação", () => {
    const reviewed = revisarPropostaDosAgentes(
      resultRaw,
      undefined,
      undefined,
      independentScenarios,
    );
    expect(reviewed.status).toBe("ready_for_review");
    expect(reviewed.checkedAgainstIndependentTests).toBe(true);
    expect(reviewed.independentTests).toHaveLength(1);
    expect(reviewed.flow?.flow.status).toBe("draft");
    expect(reviewed.tests).toEqual([{ name: "Saudação simulada", ok: true, failures: [] }]);
    expect(reviewed.approved).toBe(false);
    expect(reviewed.published).toBe(false);
  });

  it("não promove proposta validada apenas com cenários criados pela própria IA", () => {
    const reviewed = revisarPropostaDosAgentes(resultRaw);
    expect(reviewed.tests).toHaveLength(1);
    expect(reviewed.tests[0]?.ok).toBe(true);
    expect(reviewed.status).toBe("requires_revision");
    expect(reviewed.checkedAgainstIndependentTests).toBe(false);
    expect(reviewed.approved).toBe(false);
    expect(reviewed.published).toBe(false);
  });

  it("revisão independente precisa testar resultado verificável", () => {
    const empty = revisarPropostaDosAgentes(resultRaw, undefined, undefined, {
      scenarios: [{ name: "Sem assertivas", steps: [{ say: "oi" }] }],
    });
    expect(empty.status).toBe("requires_revision");
    expect(empty.problems.some((p) => p.path === "reviewerScenarios")).toBe(true);
    const wrong = revisarPropostaDosAgentes(resultRaw, undefined, undefined, {
      scenarios: [
        { name: "Resposta incorreta", steps: [{ say: "oi", expect: { contains: ["R$ 999"] } }] },
      ],
    });
    expect(wrong.checkedAgainstIndependentTests).toBe(false);
    expect(wrong.independentTests[0]?.ok).toBe(false);
    expect(wrong.status).toBe("requires_revision");
  });

  it("rejeita tentativas do modelo de publicar fluxo", () => {
    const published = {
      ...resultRaw,
      flow_json: JSON.stringify({
        ...flow,
        flow: { ...flow.flow, status: "published" },
      }),
    };
    const reviewed = revisarPropostaDosAgentes(published);
    expect(reviewed.status).toBe("requires_revision");
    expect(reviewed.flow).toBeNull();
    expect(reviewed.problems.some((p) => p.path === "flow.status")).toBe(true);
  });

  it("não admite nós de webhook propostos pelo modelo, mesmo sendo válidos na DSL", () => {
    const unsafe = structuredClone(flow) as unknown as {
      nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>;
      edges: Array<{ id: string; from: string; to: string; port: string }>;
    };
    unsafe.nodes[1] = {
      id: "resposta",
      type: "action.webhook",
      config: { url: "https://example.org/call", method: "POST", timeoutMs: 1000 },
    };
    unsafe.edges = [
      { id: "e1", from: "inicio", to: "resposta", port: "next" },
      { id: "e2", from: "resposta", to: "fim", port: "success" },
      { id: "e3", from: "resposta", to: "fim", port: "failure" },
    ];
    const reviewed = revisarPropostaDosAgentes({
      ...resultRaw,
      flow_json: JSON.stringify(unsafe),
    });
    expect(reviewed.status).toBe("requires_revision");
    expect(reviewed.problems.some((p) => p.message.includes("não está autorizado"))).toBe(true);
  });

  it("lacunas e cenários falhos impedem prontidão, mesmo com grafo válido", () => {
    const gap = revisarPropostaDosAgentes({ ...resultRaw, gaps: ["Preço não informado."] });
    expect(gap.status).toBe("requires_revision");
    expect(gap.gaps).toContain("Preço não informado.");
    const failed = revisarPropostaDosAgentes({
      ...resultRaw,
      scenarios_json: JSON.stringify({
        scenarios: [{ name: "Errado", steps: [{ say: "oi", expect: { contains: ["R$ 9999"] } }] }],
      }),
    });
    expect(failed.status).toBe("requires_revision");
    expect(failed.tests[0]?.ok).toBe(false);
  });

  it("avalia a proposta em uma única chamada para o endpoint fixo Anthropic", async () => {
    const mock = vi.fn(async () => successful());
    const out = await criarPropostaComClaude(cfg, input, mock);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.proposal.status).toBe("requires_revision");
      expect(out.proposal.checkedAgainstIndependentTests).toBe(false);
      expect(out.proposal.approved).toBe(false);
    }
    expect(mock).toHaveBeenCalledOnce();
    const [url, opts] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(opts.body));
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.tools).toBeUndefined();
    expect(body.messages[0].content).toContain(input.briefing);
    expect(body.messages[0].content).not.toContain(input.workspaceId);
    expect(body.messages[0].content).not.toContain(input.requestKey);
    expect(opts.redirect).toBe("error");
  });

  it("não chama IA quando desabilitada, nem tenta novamente após timeout", async () => {
    const mock = vi.fn();
    expect(await criarPropostaComClaude({ ...cfg, enabled: false }, input, mock)).toMatchObject({
      ok: false,
      error: "claude_authoring_disabled",
    });
    expect(mock).not.toHaveBeenCalled();
    const timeout = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await criarPropostaComClaude(cfg, input, timeout)).toMatchObject({
      ok: false,
      error: "claude_network_uncertain",
    });
    expect(timeout).toHaveBeenCalledOnce();
  });

  it("respostas truncadas, HTTP 429 e JSON corrompido não entram no runtime", async () => {
    const truncated = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            stop_reason: "max_tokens",
            content: [{ type: "text", text: JSON.stringify(resultRaw) }],
          }),
          { status: 200 },
        ),
    );
    expect(await criarPropostaComClaude(cfg, input, truncated)).toMatchObject({
      ok: false,
      error: "claude_incomplete",
    });
    const limited = vi.fn(async () => new Response("", { status: 429 }));
    expect(await criarPropostaComClaude(cfg, input, limited)).toMatchObject({
      ok: false,
      status: 429,
    });
    const corrupted = vi.fn(async () =>
      successful({ flow_json: "not json", scenarios_json: "no", gaps: [] }),
    );
    const out = await criarPropostaComClaude(cfg, input, corrupted);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.proposal.status).toBe("requires_revision");
  });

  it("servidor de atendimento não expõe endpoint de inferência Claude", async () => {
    const serverCfg = carregarConfig(
      {
        DATABASE_URL: "postgres://offline",
        EVOLUTION_URL: "https://evo.example",
        EVOLUTION_API_KEY: "fake",
        EVOLUTION_WEBHOOK_SECRET: "s".repeat(40),
      },
      { workspaces: [{ id: "x", instance: "x", flowId: "f" }] },
    );
    const server = criarServidor({
      cfg: serverCfg,
      bot: {} as FlowBot,
      pool: {} as pg.Pool,
      adaptador: async () => ({ ok: true }),
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address() as AddressInfo;
      const r = await fetch("http://127.0.0.1:" + addr.port + "/ops/ai/claude/draft", {
        method: "POST",
        body: JSON.stringify(input),
      });
      expect(r.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe.skipIf(!process.env["DATABASE_URL"])("Cota idempotente da oficina no PostgreSQL", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"], max: 3 });
    await migrar(pool);
  });
  afterAll(async () => {
    await pool.end();
  });
  it("impede chave repetida e isola cota por workspace", async () => {
    const ws = "authoring-" + randomUUID();
    expect(await reservarPedidoClaude(pool, ws, "request-00000001", 2)).toBe("reserved");
    expect(await reservarPedidoClaude(pool, ws, "request-00000001", 2)).toBe("duplicate");
    expect(await reservarPedidoClaude(pool, ws, "request-00000002", 2)).toBe("reserved");
    expect(await reservarPedidoClaude(pool, ws, "request-00000003", 2)).toBe("limit");
    expect(await reservarPedidoClaude(pool, ws + "-other", "request-00000001", 1)).toBe("reserved");
  });
});
