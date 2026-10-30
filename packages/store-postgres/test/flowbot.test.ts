/**
 * Testes contra um Postgres de verdade (DATABASE_URL). Sem banco configurado, a suíte é pulada; na CI ela roda com
 * um serviço Postgres. Cada teste usa um workspace próprio, então rodam sobre o mesmo banco sem se misturar.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FlowBot, migrar, type AdaptadorDeSaida } from "../src/index.js";

const URL_DO_BANCO = process.env["DATABASE_URL"];

const menu = () =>
  JSON.parse(
    readFileSync(new URL("../../../examples/boas-vindas-menu.json", import.meta.url), "utf8"),
  );

describe.skipIf(!URL_DO_BANCO)("FlowBot sobre Postgres", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_DO_BANCO, max: 8 });
    await migrar(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  /** Relógio controlado + workspace exclusivo do teste. */
  function cenario(opcoes: { maxTentativas?: number } = {}) {
    let agora = new Date("2026-11-02T12:00:00Z").getTime();
    const ws = `ws-${randomUUID()}`;
    const bot = new FlowBot({ pool, agora: () => new Date(agora), ...opcoes });
    let n = 0;
    return {
      ws,
      bot,
      avancar(segundos: number) {
        agora += segundos * 1000;
      },
      dizer(text: string, conversa = "c1") {
        return bot.receberMensagem({
          workspaceId: ws,
          conversationKey: conversa,
          flowId: "boas-vindas-menu",
          eventKey: `whatsapp:${++n}`,
          text,
          contact: { firstName: "Ana" },
        });
      },
    };
  }

  /** Adaptador de teste: guarda o que foi "enviado". */
  function caixa(falhar: (n: number) => boolean = () => false) {
    const enviados: { chave: string; texto: string; tipo: string }[] = [];
    let n = 0;
    const adaptador: AdaptadorDeSaida = async ({ chave, acao }) => {
      if (falhar(++n)) return { ok: false, erro: "canal fora do ar" };
      enviados.push({ chave, tipo: acao.type, texto: "text" in acao ? acao.text : "" });
      return { ok: true };
    };
    return { enviados, adaptador };
  }

  it("migrações são idempotentes", async () => {
    expect(await migrar(pool)).toEqual([]);
  });

  it("publica versões imutáveis; o mesmo conteúdo não cria versão nova", async () => {
    const { bot, ws } = cenario();
    expect(await bot.publicar(ws, menu())).toMatchObject({ version: 1, nova: true });
    expect(await bot.publicar(ws, menu())).toMatchObject({ version: 1, nova: false });
    const doc = menu();
    doc.nodes[1].config.text = "Oi! Em que posso ajudar?";
    expect(await bot.publicar(ws, doc)).toMatchObject({ version: 2, nova: true });
    const invalido = menu();
    invalido.nodes[1].type = "nao.existe";
    await expect(bot.publicar(ws, invalido)).rejects.toThrow("Fluxo inválido");
  });

  it("mensagem gera respostas na caixa de saída e um prazo durável", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    const r = await c.dizer("oi");
    expect(r).toMatchObject({ duplicado: false, status: "waiting_input" });
    const { enviados, adaptador } = caixa();
    expect(await c.bot.entregarPendentes(adaptador, { workspaceId: c.ws })).toBe(2);
    expect(enviados.map((e) => e.texto)).toEqual([
      "Olá, Ana! Como podemos ajudar?",
      "Escolha uma opção:",
    ]);
    const jobs = await pool.query("SELECT status FROM flow_bot.jobs WHERE workspace_id = $1", [
      c.ws,
    ]);
    expect(jobs.rows).toEqual([{ status: "pending" }]);
  });

  it("o mesmo evento duas vezes é processado uma vez só", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    const evento = {
      workspaceId: c.ws,
      conversationKey: "c1",
      flowId: "boas-vindas-menu",
      eventKey: "whatsapp:repetido",
      text: "oi",
    };
    const [a, b] = await Promise.all([
      c.bot.receberMensagem(evento),
      c.bot.receberMensagem(evento),
    ]);
    expect([a.duplicado, b.duplicado].sort()).toEqual([false, true]);
    const saidas = await pool.query(
      "SELECT count(*)::int AS n FROM flow_bot.outbound WHERE workspace_id = $1",
      [c.ws],
    );
    expect(saidas.rows[0].n).toBe(2);
  });

  it("prazos vencem pela fila, inclusive depois de reiniciar o processo", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    c.avancar(299);
    expect(await c.bot.processarVencidos({ workspaceId: c.ws })).toBe(0);
    c.avancar(1);
    // "Reinício": outra instância, outro pool, mesmo banco.
    const outroPool = new pg.Pool({ connectionString: URL_DO_BANCO, max: 2 });
    try {
      const agora = new Date("2026-11-02T12:05:00Z");
      const outro = new FlowBot({ pool: outroPool, agora: () => agora });
      expect(await outro.processarVencidos({ workspaceId: c.ws })).toBe(1); // 1º vencimento: nova tentativa (maxAttempts 2)
      expect((await outro.sessao(c.ws, "c1"))?.session.status).toBe("waiting_input");
    } finally {
      await outroPool.end();
    }
    c.avancar(300);
    expect(await c.bot.processarVencidos({ workspaceId: c.ws })).toBe(1);
    const s = await c.bot.sessao(c.ws, "c1");
    expect(s?.session.status).toBe("completed");
    const { enviados, adaptador } = caixa();
    await c.bot.entregarPendentes(adaptador, { workspaceId: c.ws });
    expect(enviados.map((e) => e.texto)).toContain("Quando quiser, é só escrever de novo.");
  });

  it("resposta cancela o prazo pendente", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    await c.dizer("2");
    const jobs = await pool.query("SELECT status FROM flow_bot.jobs WHERE workspace_id = $1", [
      c.ws,
    ]);
    expect(jobs.rows).toEqual([{ status: "cancelled" }]);
    c.avancar(900);
    expect(await c.bot.processarVencidos({ workspaceId: c.ws })).toBe(0);
  });

  it("falha do canal: novas tentativas com espera crescente, na ordem, e no fim desiste", async () => {
    const c = cenario({ maxTentativas: 3 });
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    const sempreFalha = caixa(() => true);
    const entregar = () => c.bot.entregarPendentes(sempreFalha.adaptador, { workspaceId: c.ws });
    expect(await entregar()).toBe(1); // só a 1ª resposta: a 2ª espera a vez
    expect(await entregar()).toBe(0); // ainda esperando 5 s
    c.avancar(5);
    expect(await entregar()).toBe(1);
    c.avancar(10);
    expect(await entregar()).toBe(2); // 3ª tentativa da 1ª falha de vez; a 2ª tenta logo em seguida
    const r = await pool.query(
      "SELECT status, attempts FROM flow_bot.outbound WHERE workspace_id = $1 ORDER BY id",
      [c.ws],
    );
    expect(r.rows).toEqual([
      { status: "failed", attempts: 3 },
      { status: "pending", attempts: 1 },
    ]);
  });

  it("respostas da mesma conversa saem sempre na ordem", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    const instavel = caixa((n) => n === 1); // a 1ª tentativa da 1ª resposta falha
    await c.bot.entregarPendentes(instavel.adaptador, { workspaceId: c.ws });
    expect(instavel.enviados).toEqual([]); // a 2ª não passa na frente
    c.avancar(5);
    await c.bot.entregarPendentes(instavel.adaptador, { workspaceId: c.ws });
    expect(instavel.enviados.map((e) => e.texto)).toEqual([
      "Olá, Ana! Como podemos ajudar?",
      "Escolha uma opção:",
    ]);
  });

  it("falha passageira: a entrega sai na tentativa seguinte, com a mesma chave", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    const instavel = caixa((n) => n === 1);
    await c.bot.entregarPendentes(instavel.adaptador, { workspaceId: c.ws });
    c.avancar(5);
    await c.bot.entregarPendentes(instavel.adaptador, { workspaceId: c.ws });
    expect(instavel.enviados.map((e) => e.chave).sort()).toEqual(["whatsapp:1#0", "whatsapp:1#1"]);
  });

  it("cancela respostas e prazos pendentes da conversa", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    expect(await c.bot.cancelarPendentes(c.ws, "c1")).toEqual({ saidas: 2, prazos: 1 });
    const { enviados, adaptador } = caixa();
    await c.bot.entregarPendentes(adaptador, { workspaceId: c.ws });
    expect(enviados).toEqual([]);
  });

  it("mensagens simultâneas da mesma conversa são processadas uma de cada vez", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    await Promise.all([c.dizer("banana"), c.dizer("laranja")]);
    const s = await c.bot.sessao(c.ws, "c1");
    expect(s?.revision).toBe(3);
    // As duas respostas inválidas contaram no salto (sem atualização perdida).
    expect(s?.session.visitas).toEqual({ voltar: 2 });
  });

  it("workspaces não se misturam", async () => {
    const a = cenario();
    const b = cenario();
    await a.bot.publicar(a.ws, menu());
    await a.dizer("oi", "mesma-chave");
    expect(await b.bot.sessao(b.ws, "mesma-chave")).toBeNull();
    // Sem fluxo publicado no workspace B, a mensagem é recusada (nada vaza do A).
    await expect(b.dizer("oi", "mesma-chave")).rejects.toThrow("sem versão publicada");
    expect(await b.bot.historico(b.ws, "mesma-chave")).toEqual([]);
  });

  it("conversa em andamento segue na versão em que começou", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    const v2 = menu();
    v2.nodes.find((n: { id: string }) => n.id === "servicos").config.text = "Serviços (versão 2).";
    await c.bot.publicar(c.ws, v2);
    await c.dizer("2");
    let { enviados, adaptador } = caixa();
    await c.bot.entregarPendentes(adaptador, { workspaceId: c.ws });
    expect(enviados.at(-1)?.texto).toBe("Nossos serviços estão na página, com preços.");
    // Conversa terminou: a próxima já usa a versão 2.
    await c.dizer("oi");
    await c.dizer("2");
    ({ enviados, adaptador } = caixa());
    await c.bot.entregarPendentes(adaptador, { workspaceId: c.ws });
    expect(enviados.at(-1)?.texto).toBe("Serviços (versão 2).");
    expect((await c.bot.sessao(c.ws, "c1"))?.flow_version).toBe(2);
  });

  it("guarda o histórico de decisões", async () => {
    const c = cenario();
    await c.bot.publicar(c.ws, menu());
    await c.dizer("oi");
    await c.dizer("3");
    const h = await c.bot.historico(c.ws, "c1");
    expect(h.map((e) => [e.event_key, e.status, e.motivo])).toEqual([
      ["whatsapp:1", "waiting_input", "suspensa"],
      ["whatsapp:2", "handed_off", "encaminhada"],
    ]);
  });

  it("webhook: o resultado da entrega volta para a conversa", async () => {
    const c = cenario();
    const doc = {
      schemaVersion: "flow-bot/v0",
      flow: {
        id: "boas-vindas-menu",
        name: "Gancho",
        timezone: "UTC",
        status: "published",
        entryNodeId: "inicio",
      },
      limits: { maxStepsPerEvent: 20 },
      nodes: [
        { id: "inicio", type: "trigger.message_received", config: {} },
        {
          id: "gancho",
          type: "action.webhook",
          config: { url: "https://exemplo.com/x", method: "POST", timeoutMs: 2000 },
        },
        { id: "ok", type: "message.text", config: { text: "Pedido registrado." } },
        { id: "falhou", type: "message.text", config: { text: "Não deu, tente mais tarde." } },
        { id: "fim", type: "action.end", config: {} },
      ],
      edges: [
        { id: "1", from: "inicio", to: "gancho", port: "next" },
        { id: "2", from: "gancho", to: "ok", port: "success" },
        { id: "3", from: "gancho", to: "falhou", port: "failure" },
        { id: "4", from: "ok", to: "fim", port: "next" },
        { id: "5", from: "falhou", to: "fim", port: "next" },
      ],
    };
    await c.bot.publicar(c.ws, doc);
    await c.dizer("quero");
    const { enviados, adaptador } = caixa((n) => n === 1); // o webhook falha
    await c.bot.entregarPendentes(adaptador, { workspaceId: c.ws });
    await c.bot.entregarPendentes(adaptador, { workspaceId: c.ws });
    expect(enviados.map((e) => e.texto)).toEqual(["Não deu, tente mais tarde."]);
    expect((await c.bot.sessao(c.ws, "c1"))?.session.status).toBe("completed");
  });
});
