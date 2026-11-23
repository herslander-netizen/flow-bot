import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { adaptadorDeSaida } from "../src/ligacoes.js";
import { carregarConfig, ConfigInvalida } from "../src/config.js";

const s = "s".repeat(40);
const workspaceA = {
  id: "tenant-a",
  instance: "alvo-tenant-a",
  flowId: "atendimento",
  evolutionTokenEnv: "EVO_TOKEN_A",
  webhookSecretEnv: "WEBHOOK_A",
};
const workspaceB = {
  id: "tenant-b",
  instance: "alvo-tenant-b",
  flowId: "atendimento",
  evolutionTokenEnv: "EVO_TOKEN_B",
  webhookSecretEnv: "WEBHOOK_B",
};
const ambiente = {
  DATABASE_URL: "postgres://test",
  EVOLUTION_URL: "https://evolution-alvo.exemplo",
  EVOLUTION_PROVIDER: "alvo",
  EVOLUTION_WEBHOOK_SECRET: s,
  EVO_TOKEN_A: "token-de-a-separado",
  EVO_TOKEN_B: "token-de-b-separado",
  WEBHOOK_A: "a".repeat(40),
  WEBHOOK_B: "b".repeat(40),
};

describe("saída por projeto na Evolution Alvo", () => {
  it("carrega tokens privados por workspace sem necessitar apikey global", () => {
    const cfg = carregarConfig(ambiente, { workspaces: [workspaceA, workspaceB] });
    expect(cfg.evolution.provider).toBe("alvo");
    expect(cfg.tokensEvolution.get("tenant-a")).toBe("token-de-a-separado");
    expect(cfg.tokensEvolution.get("tenant-b")).toBe("token-de-b-separado");
    expect(cfg.evolution.apiKey).toBe("");
    expect(cfg.webhookSecrets.get("tenant-a")).toBe(ambiente.WEBHOOK_A);
    expect(cfg.webhookSecrets.get("tenant-b")).toBe(ambiente.WEBHOOK_B);
  });

  it("recusa segredo ausente, configuração sem token e token compartilhado entre tenants", () => {
    expect(() =>
      carregarConfig({ ...ambiente, EVO_TOKEN_A: "" }, { workspaces: [workspaceA] }),
    ).toThrow(ConfigInvalida);
    expect(() =>
      carregarConfig(ambiente, { workspaces: [{ ...workspaceA, evolutionTokenEnv: undefined }] }),
    ).toThrow("requer evolutionTokenEnv");
    expect(() =>
      carregarConfig(
        { ...ambiente, EVO_TOKEN_B: ambiente.EVO_TOKEN_A },
        { workspaces: [workspaceA, workspaceB] },
      ),
    ).toThrow("exclusivo");
    expect(() =>
      carregarConfig({ ...ambiente, EVOLUTION_PROVIDER: "invalido" }, { workspaces: [workspaceA] }),
    ).toThrow("EVOLUTION_PROVIDER");
  });

  it("exige segredo inbound por instância e rejeita compartilhamento entre empresas", () => {
    expect(() =>
      carregarConfig(ambiente, {
        workspaces: [{ ...workspaceA, webhookSecretEnv: undefined }],
      }),
    ).toThrow("requer webhookSecretEnv");
    expect(() =>
      carregarConfig(
        { ...ambiente, WEBHOOK_A: "curto" },
        { workspaces: [workspaceA] },
      ),
    ).toThrow("exige 32 caracteres");
    expect(() =>
      carregarConfig(
        { ...ambiente, WEBHOOK_B: ambiente.WEBHOOK_A },
        { workspaces: [workspaceA, workspaceB] },
      ),
    ).toThrow("segredo próprio");
    expect(() =>
      carregarConfig(
        { ...ambiente, WEBHOOK_A: ambiente.EVO_TOKEN_A },
        { workspaces: [workspaceA] },
      ),
    ).toThrow("exige 32 caracteres");
  });

  it("isola credenciais e gera idempotência imutável por workspace + ação", async () => {
    const invocacoes: { token: string; idem: string; body: unknown }[] = [];
    const fake = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      invocacoes.push({
        token: headers.authorization,
        idem: headers["Idempotency-Key"],
        body: JSON.parse(String(init?.body)),
      });
      return new Response(
        JSON.stringify({ status: "accepted", request: headers["Idempotency-Key"] }),
        { status: 202 },
      );
    });
    const cfg = carregarConfig(ambiente, { workspaces: [workspaceA, workspaceB] });
    const entregar = adaptadorDeSaida(cfg, { fetch: fake });
    const mensagem = {
      type: "send_text" as const,
      text: "Resposta teste",
      nodeId: "n1",
      delayMs: 0,
    };
    const a1 = await entregar({
      workspaceId: "tenant-a",
      conversationKey: "5582999990000",
      chave: "outbound-123",
      acao: mensagem,
    });
    const a2 = await entregar({
      workspaceId: "tenant-a",
      conversationKey: "5582999990000",
      chave: "outbound-123",
      acao: mensagem,
    });
    const b = await entregar({
      workspaceId: "tenant-b",
      conversationKey: "5582999990000",
      chave: "outbound-123",
      acao: mensagem,
    });
    expect(a1.ok).toBe(true);
    expect(a2.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(fake).toHaveBeenCalledTimes(3);
    expect(invocacoes[0]?.token).toBe("Bearer token-de-a-separado");
    expect(invocacoes[2]?.token).toBe("Bearer token-de-b-separado");
    expect(invocacoes[0]?.idem).toBe(invocacoes[1]?.idem);
    expect(invocacoes[0]?.idem).not.toBe(invocacoes[2]?.idem);
    expect(invocacoes[0]?.idem).toBe(
      createHash("sha256")
        .update(JSON.stringify(["tenant-a", "outbound-123"]))
        .digest("hex"),
    );
    expect(invocacoes[0]?.body).toEqual({ number: "5582999990000", text: "Resposta teste" });
  });

  it("não envia quando workspace não está cadastrado", async () => {
    const fake = vi.fn();
    const entregar = adaptadorDeSaida(carregarConfig(ambiente, { workspaces: [workspaceA] }), {
      fetch: fake,
    });
    const result = await entregar({
      workspaceId: "outro",
      conversationKey: "5582999990000",
      chave: "chave-123456789",
      acao: { type: "send_text", text: "Oi", nodeId: "n1", delayMs: 0 },
    });
    expect(result).toEqual({ ok: false, erro: "workspace_sem_configuracao" });
    expect(fake).not.toHaveBeenCalled();
  });
});
