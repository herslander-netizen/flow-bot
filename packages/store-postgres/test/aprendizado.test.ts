/**
 * Aprendizado e retenção contra Postgres real (DATABASE_URL), com o atendimento do Flow (`presets/flow`).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

import { PerfilDeRealidade, realidadeDeExemplo } from "@flow-bot/contracts";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FlowBot, migrar } from "../src/index.js";

const URL_DO_BANCO = process.env["DATABASE_URL"];
const ler = (c: string) =>
  JSON.parse(readFileSync(new URL(`../../../${c}`, import.meta.url), "utf8"));
const perfil = PerfilDeRealidade.parse(ler("presets/flow/perfil.json"));
const atendimento = ler("presets/flow/atendimento.json");

describe.skipIf(!URL_DO_BANCO)("aprendizado e retenção", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_DO_BANCO, max: 4 });
    await migrar(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  async function cenario(opcoes: { segredo?: string | null } = {}) {
    let agora = new Date("2026-11-02T12:00:00Z").getTime();
    const ws = `ws-${randomUUID()}`;
    const bot = new FlowBot({
      pool,
      agora: () => new Date(agora),
      perfis: [perfil],
      realidade: async () => realidadeDeExemplo(perfil),
      ...(opcoes.segredo === null
        ? {}
        : { segredoDoAprendizado: opcoes.segredo ?? "segredo-de-teste" }),
    });
    await bot.publicar(ws, atendimento);
    let n = 0;
    return {
      ws,
      bot,
      avancarDias(d: number) {
        agora += d * 86_400_000;
      },
      dizer(text: string, pessoa: string, contact?: { firstName?: string; name?: string }) {
        return bot.receberMensagem({
          workspaceId: ws,
          conversationKey: pessoa,
          flowId: "flow-atendimento",
          eventKey: `wa:${++n}`,
          text,
          ...(contact ? { contact } : {}),
        });
      },
    };
  }

  it("frase sem assunto só aparece depois de 3 pessoas diferentes", async () => {
    const c = await cenario();
    for (let i = 0; i < 3; i++) await c.dizer("Vocês atendem domingo?", "pessoa-1");
    await c.dizer("vocês atendem DOMINGO", "pessoa-2");
    expect(await c.bot.perguntasSemResposta(c.ws)).toEqual([]);
    await c.dizer("Vocês atendem domingo?!", "pessoa-3");
    const r = await c.bot.perguntasSemResposta(c.ws);
    expect(r.map((x) => [x.kind, x.phrase, x.contacts])).toEqual([
      ["sem_assunto", "voces atendem domingo", 3],
    ]);
  });

  it("não guarda telefone, e-mail nem o nome do contato", async () => {
    const c = await cenario();
    for (const [i, nome] of ["Ana", "Bia", "Caio"].entries())
      await c.dizer(`sou ${nome}, me liga no 82 9999${i}-000${i} ou ${nome}@exemplo.com`, `p${i}`, {
        firstName: nome,
      });
    const frases = await pool.query(
      "SELECT phrase FROM flow_bot.learning_phrases WHERE workspace_id = $1",
      [c.ws],
    );
    expect(frases.rows).toEqual([{ phrase: "sou [nome] me liga no [telefone] ou [email]" }]);
    const marcas = await pool.query(
      "SELECT contact_hash FROM flow_bot.learning_phrase_contacts WHERE workspace_id = $1",
      [c.ws],
    );
    for (const { contact_hash } of marcas.rows) expect(contact_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sem segredo não registra frases, só contadores", async () => {
    const c = await cenario({ segredo: null });
    for (const p of ["a", "b", "c"]) await c.dizer("vocês atendem domingo?", p);
    expect(await c.bot.perguntasSemResposta(c.ws)).toEqual([]);
    const cont = await c.bot.contadores(c.ws);
    expect(cont).toContainEqual(
      expect.objectContaining({ metric: "gatilho", key: "inicio", total: 3 }),
    );
  });

  it("resposta inválida no menu vira frase de aprendizado", async () => {
    const c = await cenario();
    for (const p of ["a", "b", "c"]) {
      await c.dizer("oi", p);
      await c.dizer("quero o 5", p);
    }
    const r = await c.bot.perguntasSemResposta(c.ws);
    expect(r).toContainEqual(
      expect.objectContaining({ kind: "resposta_invalida", phrase: "quero o 5", contacts: 3 }),
    );
  });

  it("conta assuntos, caminhos e encaminhamentos", async () => {
    const c = await cenario();
    await c.dizer("quanto custa?", "a");
    await c.dizer("qual o valor?", "b");
    await c.dizer("quero falar com um atendente", "c");
    const cont = await c.bot.contadores(c.ws);
    const valor = (m: string, k: string) => cont.find((x) => x.metric === m && x.key === k)?.total;
    expect(valor("gatilho", "quer-precos")).toBe(2);
    expect(valor("gatilho", "quer-equipe")).toBe(1);
    expect(valor("caminho", "equipe-disponivel:true")).toBe(1);
    expect(valor("encaminhamento", "chamando-equipe")).toBe(1);
    expect(valor("motivo", "concluida")).toBe(2);
  });

  it("depois de 90 dias apaga as mensagens e mantém o aprendizado", async () => {
    const c = await cenario();
    for (const p of ["a", "b", "c"]) await c.dizer("vocês atendem domingo?", p);
    c.avancarDias(60);
    await c.dizer("quanto custa?", "recente");
    c.avancarDias(31); // as primeiras têm 91 dias; a recente, 31
    const apagados = await c.bot.limparAntigos();
    expect(apagados["inbound_events"]).toBeGreaterThanOrEqual(3);
    const sobra = async (tabela: string) =>
      (
        await pool.query(
          `SELECT count(*)::int AS n FROM flow_bot.${tabela} WHERE workspace_id = $1`,
          [c.ws],
        )
      ).rows[0].n;
    expect(await sobra("inbound_events")).toBe(1);
    expect(await sobra("executions")).toBe(1);
    expect(await sobra("conversations")).toBe(1);
    expect(await sobra("learning_phrase_contacts")).toBe(0);
    // O aprendizado continua.
    expect((await c.bot.perguntasSemResposta(c.ws)).map((x) => x.phrase)).toEqual([
      "voces atendem domingo",
    ]);
    expect((await c.bot.contadores(c.ws)).length).toBeGreaterThan(0);
  });

  it("o relatório de um workspace não mostra o de outro", async () => {
    const a = await cenario();
    const b = await cenario();
    for (const p of ["a", "b", "c"]) await a.dizer("tem estacionamento?", p);
    expect(await b.bot.perguntasSemResposta(b.ws)).toEqual([]);
    expect(await a.bot.perguntasSemResposta(a.ws)).toHaveLength(1);
  });
});
