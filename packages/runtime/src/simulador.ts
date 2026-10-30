/**
 * Simulador: roda cenários de conversa contra um fluxo, sem canal e sem enviar nada. O relógio é do cenário
 * (`wait` avança o tempo e dispara os prazos vencidos), então o resultado é sempre o mesmo.
 */
import { z } from "zod";

import { processar } from "./motor.js";
import type { Plano } from "./plano.js";
import { novaSessao, type Acao, type Contato, type Sessao } from "./sessao.js";

const Esperado = z
  .object({
    /** Textos enviados neste passo, na ordem e completos. */
    replies: z.array(z.string()).optional(),
    /** Trechos que precisam aparecer em algum texto enviado neste passo. */
    contains: z.array(z.string()).optional(),
    status: z
      .enum([
        "new",
        "running",
        "waiting_input",
        "scheduled",
        "waiting_external",
        "completed",
        "handed_off",
        "failed",
      ])
      .optional(),
    cursor: z.string().nullable().optional(),
    variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    handoff: z.boolean().optional(),
  })
  .strict();

const PassoDoCenario = z.union([
  z.object({ say: z.string().max(4000), expect: Esperado.optional() }).strict(),
  z.object({ wait: z.number().int().min(1).max(604800), expect: Esperado.optional() }).strict(),
  z.object({ webhook: z.boolean(), expect: Esperado.optional() }).strict(),
]);

export const Cenario = z
  .object({
    name: z.string().min(1).max(120),
    contact: z
      .object({ firstName: z.string().optional(), name: z.string().optional() })
      .strict()
      .optional(),
    steps: z.array(PassoDoCenario).min(1).max(200),
  })
  .strict();

export const ArquivoDeCenarios = z.object({ scenarios: z.array(Cenario).min(1).max(500) }).strict();

export type Cenario = z.infer<typeof Cenario>;

export type PassoSimulado = {
  entrada: string;
  saidas: string[];
  status: Sessao["status"];
  motivo: string;
  falhas: string[];
};

export type RelatorioDoCenario = { name: string; ok: boolean; passos: PassoSimulado[] };

/** Prazos disparados em sequência por um único `wait`; corta qualquer cadeia sem fim. */
const MAXIMO_DE_PRAZOS_POR_ESPERA = 50;

function textos(acoes: Acao[]): string[] {
  return acoes.flatMap((a) => {
    if (a.type === "send_text") return [a.text];
    if (a.type === "send_quick_replies")
      return [`${a.text}\n${a.options.map((o) => `[${o.value}] ${o.label}`).join("\n")}`];
    if (a.type === "handoff") return [`(encaminhado para a equipe${a.note ? `: ${a.note}` : ""})`];
    return [];
  });
}

export function simular(plano: Plano, cenario: Cenario): RelatorioDoCenario {
  let sessao = novaSessao(plano.doc.flow.id);
  let agora = 0;
  let n = 0;
  const contato: Contato = cenario.contact ?? {};
  const passos: PassoSimulado[] = cenario.steps.map((p) => {
    const acoes: Acao[] = [];
    let motivo = "";
    let entrada: string;
    if ("say" in p) {
      entrada = `> ${p.say}`;
      agora += 1000;
      const r = processar(plano, sessao, {
        type: "message",
        id: `m${++n}`,
        at: agora,
        text: p.say,
        contact: contato,
      });
      sessao = r.sessao;
      acoes.push(...r.acoes);
      motivo = r.motivo;
    } else if ("wait" in p) {
      entrada = `(espera ${p.wait} s)`;
      const ate = agora + p.wait * 1000;
      for (
        let i = 0;
        i < MAXIMO_DE_PRAZOS_POR_ESPERA && sessao.prazo !== null && sessao.prazo <= ate;
        i++
      ) {
        agora = sessao.prazo;
        const r = processar(plano, sessao, { type: "timer", id: `t${++n}`, at: agora });
        sessao = r.sessao;
        acoes.push(...r.acoes);
        motivo = r.motivo;
      }
      agora = ate;
      motivo ||= "nada_venceu";
    } else {
      entrada = `(webhook ${p.webhook ? "ok" : "falhou"})`;
      agora += 1000;
      const r = processar(plano, sessao, {
        type: "webhook_result",
        id: `w${++n}`,
        at: agora,
        ok: p.webhook,
      });
      sessao = r.sessao;
      acoes.push(...r.acoes);
      motivo = r.motivo;
    }
    const saidas = textos(acoes);
    return {
      entrada,
      saidas,
      status: sessao.status,
      motivo,
      falhas: conferir(p.expect, saidas, acoes, sessao),
    };
  });
  return { name: cenario.name, ok: passos.every((p) => p.falhas.length === 0), passos };
}

function conferir(
  e: z.infer<typeof Esperado> | undefined,
  saidas: string[],
  acoes: Acao[],
  sessao: Sessao,
): string[] {
  if (!e) return [];
  const falhas: string[] = [];
  if (e.replies && JSON.stringify(e.replies) !== JSON.stringify(saidas))
    falhas.push(`respostas: esperado ${JSON.stringify(e.replies)}, veio ${JSON.stringify(saidas)}`);
  for (const trecho of e.contains ?? [])
    if (!saidas.some((s) => s.includes(trecho))) falhas.push(`nenhuma resposta contém "${trecho}"`);
  if (e.status && e.status !== sessao.status)
    falhas.push(`status: esperado ${e.status}, veio ${sessao.status}`);
  if (e.cursor !== undefined && e.cursor !== sessao.cursor)
    falhas.push(`cursor: esperado ${String(e.cursor)}, veio ${String(sessao.cursor)}`);
  for (const [k, v] of Object.entries(e.variables ?? {}))
    if (sessao.variaveis[k] !== v)
      falhas.push(
        `${k}: esperado ${JSON.stringify(v)}, veio ${JSON.stringify(sessao.variaveis[k])}`,
      );
  if (e.handoff !== undefined && e.handoff !== acoes.some((a) => a.type === "handoff"))
    falhas.push(`encaminhamento: esperado ${String(e.handoff)}`);
  return falhas;
}
