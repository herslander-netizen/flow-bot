/**
 * `processar`: um evento entra, a sessão avança até suspender (espera, atraso, webhook), terminar ou bater no teto
 * de passos. Função pura: sem relógio (o tempo vem no evento), sem E/S (as ações saem como dados) e sem sorteio solto
 * (a semente é o id do evento).
 */
import type { ConfigDe, Correspondencia } from "@flow-bot/contracts";

import { corresponder } from "./correspondencia.js";
import type { NoDoPlano, Plano } from "./plano.js";
import type { Acao, Evento, Passo, Resultado, Sessao, Valor } from "./sessao.js";
import { escolherPorPeso, sorteioComSemente, type Sorteio } from "./sorteio.js";
import { preencher, valorDaVariavel, type Contexto } from "./variaveis.js";

/** Teto absoluto por evento, acima do que o fluxo declarar: nenhum fluxo roda sem fim. */
export const TETO_ABSOLUTO_DE_PASSOS = 200;

type Execucao = {
  plano: Plano;
  sessao: Sessao;
  evento: Evento;
  ctx: Contexto;
  acoes: Acao[];
  passos: Passo[];
  sorteio: Sorteio;
};

/** Configuração do nó já validada pelo catálogo (o plano só nasce de fluxo válido). */
function cfg<T extends NoDoPlano["type"]>(no: NoDoPlano): ConfigDe<T> {
  return no.config as ConfigDe<T>;
}

function clonar(s: Sessao): Sessao {
  return {
    ...s,
    variaveis: { ...s.variaveis },
    visitas: { ...s.visitas },
    ultimoDisparo: { ...s.ultimoDisparo },
  };
}

function atraso(x: Execucao): number {
  const d = x.plano.defaults.delaySeconds;
  if (!d) return 0;
  return Math.round((d.min + x.sorteio() * (d.max - d.min)) * 1000);
}

function opcoesDeComparacao(plano: Plano) {
  return {
    ignorarAcentos: plano.defaults.ignoreAccents ?? true,
    ...(plano.defaults.similarityThreshold !== undefined
      ? { limiarPadrao: plano.defaults.similarityThreshold }
      : {}),
  };
}

export function processar(
  plano: Plano,
  sessaoAtual: Sessao,
  evento: Evento,
  opcoes: { maxPassos?: number } = {},
): Resultado {
  const sessao = clonar(sessaoAtual);
  delete sessao.erro;
  const texto = evento.type === "message" ? evento.text : "";
  if (evento.type === "message") sessao.mensagens++;
  const x: Execucao = {
    plano,
    sessao,
    evento,
    ctx: {
      sessao,
      contato: evento.type === "message" ? (evento.contact ?? {}) : {},
      textoDaMensagem: texto,
    },
    acoes: [],
    passos: [],
    sorteio: sorteioComSemente(`${plano.doc.flow.id}:${evento.id}`),
  };
  const limite = Math.min(
    opcoes.maxPassos ?? plano.maxPassos,
    plano.maxPassos,
    TETO_ABSOLUTO_DE_PASSOS,
  );
  const fim = (motivo: string): Resultado => ({ sessao, acoes: x.acoes, passos: x.passos, motivo });

  // 1. Sessão parada num nó: o evento retoma de lá.
  if (sessao.cursor) {
    const no = plano.nos.get(sessao.cursor);
    if (!no) {
      sessao.status = "failed";
      sessao.erro = "cursor_inexistente";
      return fim("cursor_inexistente");
    }
    const retomada = retomar(x, no);
    if (retomada === "ignorado") return fim("evento_ignorado");
    if (retomada !== null) return executar(x, retomada.de, retomada.porta, limite);
  }

  // 2. Sem sessão parada: só mensagem dispara um fluxo.
  if (evento.type !== "message") return fim("evento_ignorado");
  const gatilho = escolherGatilho(x);
  if (!gatilho) return fim("nenhum_gatilho");
  sessao.ultimoDisparo[gatilho.no.id] = evento.at;
  sessao.status = "running";
  x.passos.push({
    nodeId: gatilho.no.id,
    type: gatilho.no.type,
    port: "next",
    detalhe: gatilho.detalhe,
  });
  return executar(x, gatilho.no.id, "next", limite);
}

/** Decide como o evento retoma a sessão parada; `null` = segue para os gatilhos. */
function retomar(x: Execucao, no: NoDoPlano): { de: string; porta: string } | "ignorado" | null {
  const { sessao, evento } = x;
  if (no.type === "state.wait_for_reply") {
    const c = cfg<"state.wait_for_reply">(no);
    const venceu = sessao.prazo !== null && evento.at >= sessao.prazo;
    if (evento.type === "message" && !venceu) {
      if (c.saveAs) sessao.variaveis[c.saveAs] = evento.text.trim();
      limparEspera(sessao);
      x.passos.push({ nodeId: no.id, type: no.type, port: "reply" });
      return { de: no.id, porta: "reply" };
    }
    if (!venceu) return "ignorado";
    // Prazo vencido (por timer ou por mensagem atrasada): nova tentativa ou a porta "timeout".
    const tentativas = sessao.tentativas + 1;
    if (tentativas < (c.maxAttempts ?? 1)) {
      sessao.tentativas = tentativas;
      sessao.prazo = evento.at + c.timeoutSeconds * 1000;
      x.acoes.push({ type: "schedule", nodeId: no.id, at: sessao.prazo, reason: "timeout" });
      x.passos.push({ nodeId: no.id, type: no.type, detalhe: `nova_tentativa:${tentativas + 1}` });
      return "ignorado";
    }
    limparEspera(sessao);
    x.passos.push({ nodeId: no.id, type: no.type, port: "timeout" });
    return { de: no.id, porta: "timeout" };
  }
  if (no.type === "time.delay") {
    if (sessao.prazo !== null && evento.at >= sessao.prazo) {
      limparEspera(sessao);
      x.passos.push({ nodeId: no.id, type: no.type, port: "next" });
      return { de: no.id, porta: "next" };
    }
    // Mensagem durante o atraso não dispara outro fluxo: a sessão continua aguardando.
    return "ignorado";
  }
  if (no.type === "action.webhook") {
    if (evento.type !== "webhook_result") return "ignorado";
    limparEspera(sessao);
    const porta = evento.ok ? "success" : "failure";
    x.passos.push({ nodeId: no.id, type: no.type, port: porta });
    return { de: no.id, porta };
  }
  return null;
}

function limparEspera(s: Sessao) {
  s.cursor = null;
  s.prazo = null;
  s.tentativas = 0;
  s.status = "running";
}

function escolherGatilho(x: Execucao): { no: NoDoPlano; detalhe: string } | null {
  const { plano, sessao, evento } = x;
  if (evento.type !== "message") return null;
  const pausa = (plano.defaults.repeatPauseSeconds ?? 0) * 1000;
  const emPausa = (id: string) => {
    const ultimo = sessao.ultimoDisparo[id];
    return pausa > 0 && ultimo !== undefined && evento.at - ultimo < pausa;
  };
  for (const no of plano.palavrasChave) {
    const c = cfg<"trigger.keyword">(no);
    const r = corresponder(c.match, evento.text, opcoesDeComparacao(plano));
    if (!r.casou) continue;
    if (emPausa(no.id)) {
      x.passos.push({ nodeId: no.id, type: no.type, detalhe: "em_pausa" });
      continue;
    }
    guardarCapturas(sessao, r.capturas);
    return { no, detalhe: r.motivo + (r.termo ? `:${r.termo}` : "") };
  }
  const todos = plano.qualquerMensagem;
  if (todos && !emPausa(todos.id)) return { no: todos, detalhe: "qualquer_mensagem" };
  return null;
}

function guardarCapturas(sessao: Sessao, capturas: string[] | undefined) {
  capturas?.forEach((c, i) => {
    sessao.variaveis[`session.capture${i + 1}`] = c;
  });
}

/** Segue do nó `de` pela `porta` até suspender, terminar ou bater no teto de passos. */
function executar(x: Execucao, de: string, porta: string, limite: number): Resultado {
  const { plano, sessao } = x;
  const fim = (motivo: string): Resultado => ({ sessao, acoes: x.acoes, passos: x.passos, motivo });
  let atual = plano.saidas.get(de)?.get(porta);
  let passos = 0;
  while (atual !== undefined) {
    if (++passos > limite) {
      sessao.status = "failed";
      sessao.erro = "limite_de_passos";
      sessao.cursor = null;
      return fim("limite_de_passos");
    }
    const no = plano.nos.get(atual);
    if (!no) {
      sessao.status = "failed";
      sessao.erro = "no_inexistente";
      return fim("no_inexistente");
    }
    const saida = passo(x, no);
    if ("parar" in saida) return fim(saida.parar);
    x.passos.push({
      nodeId: no.id,
      type: no.type,
      port: saida.porta,
      ...(saida.detalhe ? { detalhe: saida.detalhe } : {}),
    });
    if (saida.salto) {
      atual = saida.salto;
      continue;
    }
    atual = plano.saidas.get(no.id)?.get(saida.porta);
    if (atual === undefined) {
      sessao.status = "failed";
      sessao.erro = "saida_sem_destino";
      return fim("saida_sem_destino");
    }
  }
  sessao.status = "failed";
  sessao.erro = "saida_sem_destino";
  return fim("saida_sem_destino");
}

type Saida = { parar: string } | { porta: string; salto?: string; detalhe?: string };

function passo(x: Execucao, no: NoDoPlano): Saida {
  const { plano, sessao, evento, ctx } = x;
  switch (no.type) {
    case "trigger.message_received":
    case "trigger.keyword":
      return { porta: "next" };
    case "message.text": {
      const c = cfg<"message.text">(no);
      x.acoes.push({
        type: "send_text",
        nodeId: no.id,
        text: preencher(c.text, plano, ctx),
        delayMs: atraso(x),
      });
      return { porta: "next" };
    }
    case "message.quick_replies": {
      const c = cfg<"message.quick_replies">(no);
      x.acoes.push({
        type: "send_quick_replies",
        nodeId: no.id,
        text: preencher(c.prompt, plano, ctx),
        options: c.options.map((o) => ({ value: o.value, label: preencher(o.label, plano, ctx) })),
        delayMs: atraso(x),
      });
      return { porta: "next" };
    }
    case "logic.condition": {
      const c = cfg<"logic.condition">(no);
      const ok = avaliarCondicao(valorDaVariavel(c.variable, plano, ctx), c.operator, c.value);
      return { porta: ok ? "true" : "false" };
    }
    case "logic.switch": {
      const c = cfg<"logic.switch">(no);
      const v = String(valorDaVariavel(c.variable, plano, ctx) ?? "").trim();
      const caso = c.cases.find(
        (k) => k.toLocaleLowerCase("pt-BR") === v.toLocaleLowerCase("pt-BR"),
      );
      return { porta: caso !== undefined ? `case:${caso}` : "default" };
    }
    case "logic.match": {
      const c = cfg<"logic.match">(no);
      const alvo = String(valorDaVariavel(c.variable ?? "message.text", plano, ctx) ?? "");
      const r = corresponder(c.match as Correspondencia, alvo, opcoesDeComparacao(plano));
      if (r.casou) guardarCapturas(sessao, r.capturas);
      return { porta: r.casou ? "matched" : "no_match", detalhe: r.motivo };
    }
    case "logic.random": {
      const c = cfg<"logic.random">(no);
      const i = escolherPorPeso(c.weights, x.sorteio);
      return { porta: `branch:${i}` };
    }
    case "logic.goto": {
      const c = cfg<"logic.goto">(no);
      const visitas = (sessao.visitas[no.id] ?? 0) + 1;
      sessao.visitas[no.id] = visitas;
      if (visitas > c.maxVisits) return { porta: "exhausted", detalhe: `visitas:${visitas}` };
      return { porta: "goto", salto: c.target, detalhe: `visitas:${visitas}` };
    }
    case "state.wait_for_reply": {
      const c = cfg<"state.wait_for_reply">(no);
      suspender(sessao, no.id, "waiting_input", evento.at + c.timeoutSeconds * 1000);
      x.acoes.push({
        type: "schedule",
        nodeId: no.id,
        at: evento.at + c.timeoutSeconds * 1000,
        reason: "timeout",
      });
      x.passos.push({ nodeId: no.id, type: no.type, detalhe: "aguardando_resposta" });
      return { parar: "suspensa" };
    }
    case "time.delay": {
      const c = cfg<"time.delay">(no);
      suspender(sessao, no.id, "scheduled", evento.at + c.seconds * 1000);
      x.acoes.push({
        type: "schedule",
        nodeId: no.id,
        at: evento.at + c.seconds * 1000,
        reason: "delay",
      });
      x.passos.push({ nodeId: no.id, type: no.type, detalhe: "aguardando_tempo" });
      return { parar: "suspensa" };
    }
    case "data.capture": {
      const c = cfg<"data.capture">(no);
      const valor = capturar(ctx.textoDaMensagem, c.kind, c.maxLength);
      if (valor === null) return { porta: "invalid" };
      sessao.variaveis[c.variable] = valor;
      return { porta: "valid" };
    }
    case "data.set_variable": {
      const c = cfg<"data.set_variable">(no);
      sessao.variaveis[c.variable] =
        typeof c.value === "string" ? preencher(c.value, plano, ctx) : c.value;
      return { porta: "next" };
    }
    case "action.webhook": {
      const c = cfg<"action.webhook">(no);
      suspender(sessao, no.id, "waiting_external", null);
      x.acoes.push({
        type: "webhook",
        nodeId: no.id,
        url: c.url,
        method: c.method,
        timeoutMs: c.timeoutMs,
      });
      x.passos.push({ nodeId: no.id, type: no.type, detalhe: "aguardando_webhook" });
      return { parar: "suspensa" };
    }
    case "action.handoff": {
      const c = cfg<"action.handoff">(no);
      x.acoes.push({ type: "handoff", nodeId: no.id, ...(c.note ? { note: c.note } : {}) });
      encerrar(sessao, "handed_off");
      x.passos.push({ nodeId: no.id, type: no.type });
      return { parar: "encaminhada" };
    }
    case "action.end":
      encerrar(sessao, "completed");
      x.passos.push({ nodeId: no.id, type: no.type });
      return { parar: "concluida" };
  }
}

function suspender(s: Sessao, cursor: string, status: Sessao["status"], prazo: number | null) {
  s.cursor = cursor;
  s.status = status;
  s.prazo = prazo;
}

function encerrar(s: Sessao, status: "completed" | "handed_off") {
  s.cursor = null;
  s.prazo = null;
  s.tentativas = 0;
  s.status = status;
  // Saltos contam por conversa: uma conversa nova começa do zero.
  s.visitas = {};
}

function avaliarCondicao(
  v: Valor | undefined,
  operador: ConfigDe<"logic.condition">["operator"],
  esperado: string | number | undefined,
): boolean {
  const vazio = v === undefined || String(v).trim() === "";
  switch (operador) {
    case "is_set":
      return !vazio;
    case "is_empty":
      return vazio;
    case "equals":
      return !vazio && String(v) === String(esperado ?? "");
    case "not_equals":
      return String(v ?? "") !== String(esperado ?? "");
    case "gt":
    case "lt": {
      const a = Number(v);
      const b = Number(esperado);
      if (vazio || Number.isNaN(a) || Number.isNaN(b)) return false;
      return operador === "gt" ? a > b : a < b;
    }
  }
}

function capturar(
  texto: string,
  tipo: ConfigDe<"data.capture">["kind"],
  maximo: number | undefined,
): Valor | null {
  const t = texto.trim();
  if (!t || (maximo !== undefined && t.length > maximo)) return null;
  switch (tipo) {
    case "text":
      return t;
    case "number": {
      if (!/^-?\d+(?:[.,]\d+)?$/.test(t)) return null;
      return Number(t.replace(",", "."));
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t.toLowerCase() : null;
    case "phone": {
      const digitos = t.replace(/\D/g, "");
      return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
    }
    case "date": {
      const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
      const [a, m, d] = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
      if (!a || !m || !d) return null;
      const data = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
      const ok =
        data.getUTCFullYear() === Number(a) &&
        data.getUTCMonth() === Number(m) - 1 &&
        data.getUTCDate() === Number(d);
      return ok ? `${a}-${m}-${d}` : null;
    }
  }
}
