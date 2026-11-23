import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { FlowBot } from "@flow-bot/store-postgres";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { carregarConfig } from "../src/config.js";
import { criarServidor } from "../src/servidor.js";

const GLOBAL = "g".repeat(40);
const SEGREDO_A = "a".repeat(40);
const SEGREDO_B = "b".repeat(40);

describe("webhook Evolution — autenticação por instância", () => {
  let server: Server;
  let endereco: string;
  const eventos: { evento: string; dados?: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    const cfg = carregarConfig(
      {
        DATABASE_URL: "postgres://test",
        EVOLUTION_URL: "https://evolution-alvo.exemplo",
        EVOLUTION_PROVIDER: "alvo",
        EVOLUTION_WEBHOOK_SECRET: GLOBAL,
        GATEWAY_A: "gateway-a-teste",
        GATEWAY_B: "gateway-b-teste",
        INBOUND_A: SEGREDO_A,
        INBOUND_B: SEGREDO_B,
      },
      {
        workspaces: [
          {
            id: "tenant-a",
            instance: "instancia-a",
            flowId: "flow-atendimento",
            evolutionTokenEnv: "GATEWAY_A",
            webhookSecretEnv: "INBOUND_A",
          },
          {
            id: "tenant-b",
            instance: "instancia-b",
            flowId: "flow-atendimento",
            evolutionTokenEnv: "GATEWAY_B",
            webhookSecretEnv: "INBOUND_B",
          },
        ],
      },
    );
    // Os eventos CONNECTION_UPDATE não acessam Postgres nem o runtime.
    // Mocks intencionalmente inacessíveis: qualquer execução inesperada falha no teste.
    const bot = {} as FlowBot;
    const pool = {} as pg.Pool;
    server = criarServidor({
      cfg,
      bot,
      pool,
      adaptador: async () => ({ ok: true }),
      registro: (evento, dados) => eventos.push({ evento, ...(dados ? { dados } : {}) }),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    endereco = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((erro) => (erro ? reject(erro) : resolve()));
    });
  });

  async function enviar(
    instancia: string,
    segredo: string,
    tipo = "x-webhook-secret",
  ) {
    return fetch(endereco + "/webhooks/evolution", {
      method: "POST",
      headers: { "content-type": "application/json", [tipo]: segredo },
      body: JSON.stringify({
        event: "connection.update",
        instance: instancia,
        data: { state: "open" },
      }),
    });
  }

  it("aceita apenas o segredo da instância selecionada", async () => {
    expect((await enviar("instancia-a", SEGREDO_A)).status).toBe(200);
    expect((await enviar("instancia-b", SEGREDO_B)).status).toBe(200);
    expect(eventos.filter((e) => e.evento === "conexao")).toHaveLength(2);
  });

  it("um estabelecimento não pode forjar eventos de outro", async () => {
    expect((await enviar("instancia-b", SEGREDO_A)).status).toBe(401);
    expect((await enviar("instancia-a", SEGREDO_B)).status).toBe(401);
  });

  it("nega token global, apikey e instância não cadastrada", async () => {
    expect((await enviar("instancia-a", GLOBAL)).status).toBe(401);
    expect((await enviar("instancia-a", SEGREDO_A, "apikey")).status).toBe(401);
    expect((await enviar("outra-instancia", SEGREDO_A)).status).toBe(401);
  });

  it("recusa webhook sem segredo de entrada", async () => {
    const resposta = await fetch(endereco + "/webhooks/evolution", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "connection.update",
        instance: "instancia-a",
        data: { state: "open" },
      }),
    });
    expect(resposta.status).toBe(401);
  });
});
