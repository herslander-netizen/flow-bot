/**
 * Ponta a ponta contra Postgres real (DATABASE_URL): aviso da Evolution → realidade do sistema → resposta enviada
 * pela Evolution. Evolution e sistema são servidores HTTP falsos locais; nada sai da máquina.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";

import { PerfilDeRealidade, realidadeDeExemplo } from "@flow-bot/contracts";
import { FlowBot, migrar } from "@flow-bot/store-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adaptadorDeSaida,
  carregarConfig,
  ConfigInvalida,
  criarServidor,
  filtrarRealidade,
  motivoDeUrlInsegura,
  realidadeDoSistema,
} from "../src/index.js";

const URL_DO_BANCO = process.env["DATABASE_URL"];
const ler = (c: string) =>
  JSON.parse(readFileSync(new URL(`../../../${c}`, import.meta.url), "utf8"));
const SEGREDO = "s".repeat(40);

function subir(handler: Parameters<typeof createServer>[1]): Promise<{ s: Server; url: string }> {
  return new Promise((ok) => {
    const s = createServer(handler);
    s.listen(0, "127.0.0.1", () =>
      ok({ s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` }),
    );
  });
}

async function corpo(req: import("node:http").IncomingMessage) {
  let t = "";
  for await (const p of req) t += p;
  return t ? JSON.parse(t) : null;
}

describe("configuração e segurança", () => {
  const env = {
    DATABASE_URL: "postgres://x",
    EVOLUTION_URL: "https://evo",
    EVOLUTION_API_KEY: "k",
    EVOLUTION_WEBHOOK_SECRET: SEGREDO,
    TOKEN_STUDIO: "t",
    TOKEN_RETOMADA_STUDIO: "retomar-studio",
  };
  const ws = {
    workspaces: [{ id: "studio", instance: "flow-studio", flowId: "f", tokenEnv: "TOKEN_STUDIO", resumeTokenEnv: "TOKEN_RETOMADA_STUDIO" }],
  };

  it("carrega credenciais independentes para retomada", () => {
    const cfg = carregarConfig(env, ws);
    expect(cfg.tokens.get("studio")).toBe("t");
    expect(cfg.resumeTokens.get("studio")).toBe("retomar-studio");
  });
  it("recusa segredo curto, variável ausente e instância repetida", () => {
    expect(() => carregarConfig({ ...env, EVOLUTION_WEBHOOK_SECRET: "curto" }, ws)).toThrow(
      ConfigInvalida,
    );
    expect(() => carregarConfig({ ...env, TOKEN_STUDIO: "" }, ws)).toThrow("TOKEN_STUDIO");
    expect(() =>
      carregarConfig(env, { workspaces: [ws.workspaces[0], { ...ws.workspaces[0], id: "outro" }] }),
    ).toThrow("Instância repetida");
  });
  it("filtra a realidade recebida", () => {
    expect(
      filtrarRealidade({
        "reality.isOpen": true,
        "reality.services": ["a", 2],
        "reality.ok": ["a"],
        senha: "x",
        "reality.obj": { a: 1 },
      }),
    ).toEqual({ "reality.isOpen": true, "reality.ok": ["a"] });
  });
  it("webhook de fluxo só para HTTPS público", async () => {
    const dns = (ips: string[]) => async () => ips;
    expect(await motivoDeUrlInsegura("http://exemplo.com", dns(["93.184.216.34"]))).toBe(
      "so_https",
    );
    expect(await motivoDeUrlInsegura("https://localhost/x")).toBe("endereco_interno");
    expect(await motivoDeUrlInsegura("https://10.0.0.5/x")).toBe("endereco_interno");
    expect(await motivoDeUrlInsegura("https://169.254.169.254/latest")).toBe("endereco_interno");
    expect(await motivoDeUrlInsegura("https://interno.exemplo", dns(["192.168.0.10"]))).toBe(
      "endereco_interno",
    );
    expect(await motivoDeUrlInsegura("https://api.exemplo", dns(["93.184.216.34"]))).toBeNull();
  });
});

describe.skipIf(!URL_DO_BANCO)("serviço de ponta a ponta", () => {
  let pool: pg.Pool;
  const enviados: { instancia: string; numero: string; texto: string; apikey: string }[] = [];
  const encaminhados: unknown[] = [];
  let evolution: { s: Server; url: string };
  let sistema: { s: Server; url: string };
  let servico: { s: Server; url: string };
  let bot: FlowBot;
  let aberto = true;
  const ws = `ws-${randomUUID()}`;
  const perfil = PerfilDeRealidade.parse(ler("presets/flow/perfil.json"));

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_DO_BANCO, max: 6 });
    await migrar(pool);
    evolution = await subir(async (req, res) => {
      const b = await corpo(req);
      enviados.push({
        instancia: decodeURIComponent(req.url?.split("/").pop() ?? ""),
        numero: b.number,
        texto: b.text,
        apikey: String(req.headers["apikey"]),
      });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ key: { id: `out-${enviados.length}` } }));
    });
    sistema = await subir(async (req, res) => {
      if (req.headers["authorization"] !== "Bearer token-do-sistema") {
        res.writeHead(401).end();
        return;
      }
      if (req.method === "POST") {
        encaminhados.push(await corpo(req));
        res.writeHead(204).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ...realidadeDeExemplo(perfil), "reality.isOpen": aberto }));
    });
    const cfg = carregarConfig(
      {
        DATABASE_URL: URL_DO_BANCO,
        EVOLUTION_URL: evolution.url,
        EVOLUTION_API_KEY: "chave-evolution",
        EVOLUTION_WEBHOOK_SECRET: SEGREDO,
        TOKEN_SISTEMA: "token-do-sistema",
      },
      {
        workspaces: [
          {
            id: ws,
            instance: "flow-studio",
            flowId: "flow-atendimento",
            realityUrl: `${sistema.url}/flow-bot/realidade`,
            handoffUrl: `${sistema.url}/flow-bot/equipe`,
            tokenEnv: "TOKEN_SISTEMA",
          },
        ],
      },
    );
    // Relógio controlado: o fluxo do Flow responde com 1–3 s de atraso ("digitando"); o teste avança o tempo.
    bot = new FlowBot({
      pool,
      perfis: [perfil],
      realidade: realidadeDoSistema(cfg),
      agora: () => new Date(relogio),
    });
    await bot.publicar(ws, ler("presets/flow/atendimento.json"));
    const adaptador = adaptadorDeSaida(cfg);
    servico = await new Promise((ok) => {
      const s = criarServidor({ cfg, bot, pool, adaptador });
      s.listen(0, "127.0.0.1", () =>
        ok({ s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` }),
      );
    });
    // Para os testes esperarem a entrega, o adaptador é usado também diretamente.
    entregar = () => {
      relogio += 5000;
      return bot.entregarPendentes(adaptador, { workspaceId: ws });
    };
  });
  let entregar: () => Promise<number>;
  let relogio = Date.now();

  afterAll(async () => {
    await Promise.all(
      [servico, evolution, sistema].map(({ s }) => new Promise((ok) => s.close(ok))),
    );
    await pool.end();
  });

  let n = 0;
  const avisar = (
    texto: string,
    opcoes: { segredo?: string; fromMe?: boolean; id?: string; telefone?: string } = {},
  ) =>
    fetch(`${servico.url}/webhooks/evolution`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": opcoes.segredo ?? SEGREDO,
      },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "flow-studio",
        data: {
          key: {
            remoteJid: `${opcoes.telefone ?? "5582999990000"}@s.whatsapp.net`,
            fromMe: opcoes.fromMe ?? false,
            id: opcoes.id ?? `in-${++n}`,
          },
          pushName: "Ana Souza",
          message: { conversation: texto },
        },
      }),
    });

  it("recusa aviso sem o segredo", async () => {
    expect((await avisar("oi", { segredo: "errado" })).status).toBe(401);
  });

  it("responde pela Evolution com a realidade do sistema", async () => {
    const r = await avisar("quanto custa?");
    expect(r.status).toBe(200);
    await entregar();
    const ultimo = enviados.at(-1);
    expect(ultimo).toMatchObject({
      instancia: "flow-studio",
      numero: "5582999990000",
      apikey: "chave-evolution",
    });
    expect(ultimo?.texto).toContain("• Corte — R$ 45,00");
  });

  it("a mesma mensagem reenviada pela Evolution não gera outra resposta", async () => {
    const antes = enviados.length;
    await avisar("onde fica?", { id: "repetida" });
    await avisar("onde fica?", { id: "repetida" });
    await entregar();
    expect(enviados.length - antes).toBe(1);
  });

  it("mensagem do próprio número não é respondida (sem loop)", async () => {
    const antes = enviados.length;
    const r = await avisar("Estamos abertos", { fromMe: true });
    expect(await r.json()).toMatchObject({ ignorado: "enviada_pelo_proprio_numero" });
    await entregar();
    expect(enviados.length).toBe(antes);
  });

  it("a realidade muda a resposta e o encaminhamento avisa o sistema", async () => {
    aberto = false;
    await avisar("vocês estão abertos?");
    await entregar();
    expect(enviados.at(-1)?.texto).toBe("No momento estamos fechados. Abrimos amanhã às 9h.");
    await avisar("quero falar com um atendente");
    await entregar();
    expect(encaminhados.at(-1)).toEqual({
      workspaceId: ws,
      conversationKey: "5582999990000",
      note: "Cliente pediu atendimento da equipe",
    });
  });

  it("menu sai como lista numerada", async () => {
    // Conversa isolada: o teste de handoff anterior mantém a sessão sob atendimento humano.
    await avisar("bom dia", { telefone: "5582888880000" });
    await entregar();
    expect(enviados.at(-1)?.texto).toBe(
      "Como posso ajudar?\n1. Agendar\n2. Serviços e preços\n3. Horário e endereço\n4. Falar com a equipe",
    );
  });

  it("health", async () => {
    expect(await (await fetch(`${servico.url}/health`)).json()).toEqual({ ok: true });
  });
});
