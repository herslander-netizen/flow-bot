import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  compilar,
  FluxoInvalido,
  novaSessao,
  processar,
  type Evento,
  type Sessao,
} from "../src/index.js";

const fixture = (nome: string) =>
  JSON.parse(
    readFileSync(new URL(`../../contracts/fixtures/valid/${nome}`, import.meta.url), "utf8"),
  );

function conversa(doc: unknown) {
  const plano = compilar(doc);
  let sessao: Sessao = novaSessao(plano.doc.flow.id);
  let n = 0;
  return {
    plano,
    get sessao() {
      return sessao;
    },
    enviar(evento: Omit<Evento, "id"> & { id?: string }) {
      const r = processar(plano, sessao, { id: `e${++n}`, ...evento } as Evento);
      sessao = r.sessao;
      return r;
    },
    dizer(text: string, at = n * 1000) {
      return this.enviar({ type: "message", at, text, contact: { firstName: "Ana" } });
    },
  };
}

const textos = (acoes: { type: string; text?: string }[]) =>
  acoes.filter((a) => a.text !== undefined).map((a) => a.text);

describe("compilar", () => {
  it("recusa fluxo inválido com os problemas", () => {
    const doc = fixture("boas-vindas-menu.json");
    doc.nodes[1].type = "nao.existe";
    expect(() => compilar(doc)).toThrow(FluxoInvalido);
  });
});

describe("menu de boas-vindas", () => {
  it("saúda, mostra o menu e espera", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    const r = c.dizer("oi");
    expect(textos(r.acoes)).toEqual(["Olá, Ana! Como podemos ajudar?", "Escolha uma opção:"]);
    expect(r.acoes).toContainEqual(
      expect.objectContaining({ type: "schedule", reason: "timeout" }),
    );
    expect(c.sessao).toMatchObject({ status: "waiting_input", cursor: "espera" });
    expect(r.motivo).toBe("suspensa");
  });

  it("a resposta vai pelo caso certo e grava a variável", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    c.dizer("oi");
    const r = c.dizer("2");
    expect(textos(r.acoes)).toEqual(["Nossos serviços estão na página, com preços."]);
    expect(c.sessao.variaveis["session.escolha"]).toBe("2");
    expect(c.sessao.status).toBe("completed");
  });

  it("opção 3 encaminha para a equipe", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    c.dizer("oi");
    const r = c.dizer("3");
    expect(r.acoes).toContainEqual(
      expect.objectContaining({ type: "handoff", note: "Pediu atendimento" }),
    );
    expect(c.sessao.status).toBe("handed_off");
  });

  it("não volta a responder enquanto a conversa está com a equipe", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    c.dizer("oi");
    c.dizer("3");
    const mensagensAntes = c.sessao.mensagens;
    const r = c.dizer("Olá, ainda preciso de ajuda", 10_000);
    expect(r.motivo).toBe("atendimento_humano");
    expect(r.acoes).toEqual([]);
    expect(c.sessao.status).toBe("handed_off");
    expect(c.sessao.mensagens).toBe(mensagensAntes);
  });

  it("resposta inválida volta ao menu até o limite do salto e depois encaminha", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    c.dizer("oi");
    // maxVisits 2: duas voltas ao menu; na terceira resposta inválida, "exhausted" → equipe.
    expect(textos(c.dizer("banana").acoes)).toContain("Escolha uma opção:");
    expect(textos(c.dizer("banana").acoes)).toContain("Escolha uma opção:");
    const r = c.dizer("banana");
    expect(r.acoes).toContainEqual(expect.objectContaining({ type: "handoff" }));
    expect(c.sessao.status).toBe("handed_off");
  });

  it("sem resposta, o prazo leva pela porta timeout (com nova tentativa antes)", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    c.dizer("oi", 0);
    const prazo1 = c.sessao.prazo ?? 0;
    expect(prazo1).toBe(300_000);
    // maxAttempts 2: o primeiro vencimento rearma a espera.
    const r1 = c.enviar({ type: "timer", at: prazo1 });
    expect(r1.motivo).toBe("evento_ignorado");
    expect(c.sessao.prazo).toBe(600_000);
    const r2 = c.enviar({ type: "timer", at: 600_000 });
    expect(textos(r2.acoes)).toEqual(["Quando quiser, é só escrever de novo."]);
    expect(c.sessao.status).toBe("completed");
  });

  it("timer antes do prazo não faz nada", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    c.dizer("oi", 0);
    const r = c.enviar({ type: "timer", at: 10_000 });
    expect(r.motivo).toBe("evento_ignorado");
    expect(c.sessao.cursor).toBe("espera");
  });

  it("a mesma entrada gera sempre a mesma saída", () => {
    const a = conversa(fixture("boas-vindas-menu.json"));
    const b = conversa(fixture("boas-vindas-menu.json"));
    expect(a.dizer("oi")).toEqual(b.dizer("oi"));
  });

  it("não altera a sessão recebida", () => {
    const c = conversa(fixture("boas-vindas-menu.json"));
    c.dizer("oi");
    const antes = structuredClone(c.sessao);
    processar(c.plano, c.sessao, { type: "message", id: "x", at: 5000, text: "1" });
    expect(c.sessao).toEqual(antes);
  });
});

describe("gatilho por palavra-chave", () => {
  it("responde quando casa e ignora quando não casa", () => {
    const c = conversa(fixture("palavra-chave-horario.json"));
    expect(textos(c.dizer("Qual o horário de funcionamento?").acoes)).toEqual([
      "Abrimos de terça a sábado, das 9h às 19h.",
    ]);
    const r = c.dizer("quero cancelar o horario");
    expect(r.motivo).toBe("nenhum_gatilho");
    expect(r.acoes).toEqual([]);
  });

  it("pausa contra repetição", () => {
    const doc = fixture("palavra-chave-horario.json");
    doc.defaults = { repeatPauseSeconds: 60 };
    const c = conversa(doc);
    expect(c.dizer("horario?", 0).acoes).toHaveLength(1);
    expect(c.dizer("horario?", 30_000).motivo).toBe("nenhum_gatilho");
    expect(c.dizer("horario?", 61_000).acoes).toHaveLength(1);
  });

  it("prioridade: o gatilho de menor número vence", () => {
    const doc = fixture("palavra-chave-horario.json");
    doc.nodes.push(
      {
        id: "precos",
        type: "trigger.keyword",
        config: { priority: 1, match: { mode: "contains", values: ["horario", "preco"] } },
      },
      { id: "msg-precos", type: "message.text", config: { text: "Tabela de preços na página." } },
    );
    doc.edges.push(
      { id: "p1", from: "precos", to: "msg-precos", port: "next" },
      { id: "p2", from: "msg-precos", to: "fim", port: "next" },
    );
    const c = conversa(doc);
    expect(textos(c.dizer("horario").acoes)).toEqual(["Tabela de preços na página."]);
  });

  it("atraso padrão é sorteado no intervalo e reprodutível", () => {
    const doc = fixture("palavra-chave-horario.json");
    doc.defaults = { delaySeconds: { min: 2, max: 5 } };
    const r = conversa(doc).dizer("horario");
    const envio = r.acoes.find((a) => a.type === "send_text");
    expect(envio && "delayMs" in envio ? envio.delayMs : -1).toBeGreaterThanOrEqual(2000);
    expect(envio && "delayMs" in envio ? envio.delayMs : -1).toBeLessThanOrEqual(5000);
    expect(conversa(doc).dizer("horario")).toEqual(r);
  });
});

describe("proteção contra execução infinita", () => {
  /** Fluxo válido em que um salto volta para trás muitas vezes sem suspender. */
  function fluxoComSalto(maxVisits: number, maxSteps: number) {
    return {
      schemaVersion: "flow-bot/v0",
      flow: { id: "giro", name: "Giro", timezone: "UTC", status: "draft", entryNodeId: "inicio" },
      limits: { maxStepsPerEvent: maxSteps },
      nodes: [
        { id: "inicio", type: "trigger.message_received", config: {} },
        { id: "a", type: "message.text", config: { text: "a" } },
        { id: "volta", type: "logic.goto", config: { target: "a", maxVisits } },
        { id: "fim", type: "action.end", config: {} },
      ],
      edges: [
        { id: "e1", from: "inicio", to: "a", port: "next" },
        { id: "e2", from: "a", to: "volta", port: "next" },
        { id: "e3", from: "volta", to: "fim", port: "exhausted" },
      ],
    };
  }

  it("o salto respeita maxVisits", () => {
    const c = conversa(fluxoComSalto(3, 50));
    const r = c.dizer("x");
    expect(textos(r.acoes)).toEqual(["a", "a", "a", "a"]);
    expect(c.sessao.status).toBe("completed");
  });

  it("o teto de passos do fluxo corta a execução e marca falha", () => {
    const c = conversa(fluxoComSalto(20, 10));
    const r = c.dizer("x");
    expect(r.motivo).toBe("limite_de_passos");
    expect(c.sessao).toMatchObject({ status: "failed", erro: "limite_de_passos", cursor: null });
  });

  it("o teto também vale quando quem chama pede menos", () => {
    const plano = compilar(fluxoComSalto(20, 200));
    const r = processar(
      plano,
      novaSessao("giro"),
      { type: "message", id: "1", at: 0, text: "x" },
      { maxPassos: 5 },
    );
    expect(r.motivo).toBe("limite_de_passos");
  });

  it("depois de uma falha a conversa pode recomeçar", () => {
    const c = conversa(fluxoComSalto(20, 10));
    c.dizer("x");
    const r = c.dizer("y");
    expect(r.motivo).toBe("limite_de_passos");
    expect(c.sessao.mensagens).toBe(2);
  });
});

describe("nós de dados, condição, atraso e webhook", () => {
  const base = (nodes: unknown[], edges: unknown[], variables: unknown[] = []) => ({
    schemaVersion: "flow-bot/v0",
    flow: {
      id: "dados",
      name: "Dados",
      timezone: "America/Sao_Paulo",
      status: "draft",
      entryNodeId: "inicio",
    },
    limits: { maxStepsPerEvent: 50 },
    variables,
    nodes: [{ id: "inicio", type: "trigger.message_received", config: {} }, ...nodes],
    edges,
  });

  it("captura e-mail válido e recusa inválido", () => {
    const doc = base(
      [
        { id: "cap", type: "data.capture", config: { variable: "session.email", kind: "email" } },
        { id: "ok", type: "message.text", config: { text: "Recebi {{session.email}}" } },
        { id: "ruim", type: "message.text", config: { text: "E-mail inválido" } },
        { id: "fim", type: "action.end", config: {} },
      ],
      [
        { id: "1", from: "inicio", to: "cap", port: "next" },
        { id: "2", from: "cap", to: "ok", port: "valid" },
        { id: "3", from: "cap", to: "ruim", port: "invalid" },
        { id: "4", from: "ok", to: "fim", port: "next" },
        { id: "5", from: "ruim", to: "fim", port: "next" },
      ],
      [{ name: "session.email", type: "string" }],
    );
    expect(textos(conversa(doc).dizer("Ana@Exemplo.com").acoes)).toEqual([
      "Recebi ana@exemplo.com",
    ]);
    expect(textos(conversa(doc).dizer("ana@").acoes)).toEqual(["E-mail inválido"]);
  });

  it("condição numérica e atraso que retoma no prazo", () => {
    const doc = base(
      [
        { id: "num", type: "data.capture", config: { variable: "session.qtd", kind: "number" } },
        {
          id: "cond",
          type: "logic.condition",
          config: { variable: "session.qtd", operator: "gt", value: 3 },
        },
        { id: "espera", type: "time.delay", config: { seconds: 10 } },
        { id: "muitos", type: "message.text", config: { text: "Grupo grande" } },
        { id: "poucos", type: "message.text", config: { text: "Grupo pequeno" } },
        { id: "fim", type: "action.end", config: {} },
      ],
      [
        { id: "1", from: "inicio", to: "num", port: "next" },
        { id: "2", from: "num", to: "cond", port: "valid" },
        { id: "3", from: "num", to: "fim", port: "invalid" },
        { id: "4", from: "cond", to: "espera", port: "true" },
        { id: "5", from: "cond", to: "poucos", port: "false" },
        { id: "6", from: "espera", to: "muitos", port: "next" },
        { id: "7", from: "muitos", to: "fim", port: "next" },
        { id: "8", from: "poucos", to: "fim", port: "next" },
      ],
      [{ name: "session.qtd", type: "number" }],
    );
    expect(textos(conversa(doc).dizer("2").acoes)).toEqual(["Grupo pequeno"]);
    const c = conversa(doc);
    const r = c.dizer("5", 0);
    expect(r.acoes).toEqual([{ type: "schedule", nodeId: "espera", at: 10_000, reason: "delay" }]);
    expect(c.sessao.status).toBe("scheduled");
    expect(c.dizer("oi?", 5000).motivo).toBe("evento_ignorado");
    expect(textos(c.enviar({ type: "timer", at: 10_000 }).acoes)).toEqual(["Grupo grande"]);
  });

  it("webhook suspende e segue pelo resultado", () => {
    const doc = base(
      [
        {
          id: "gancho",
          type: "action.webhook",
          config: { url: "https://exemplo.com/x", method: "POST", timeoutMs: 2000 },
        },
        { id: "ok", type: "message.text", config: { text: "Feito" } },
        { id: "erro", type: "action.handoff", config: {} },
        { id: "fim", type: "action.end", config: {} },
      ],
      [
        { id: "1", from: "inicio", to: "gancho", port: "next" },
        { id: "2", from: "gancho", to: "ok", port: "success" },
        { id: "3", from: "gancho", to: "erro", port: "failure" },
        { id: "4", from: "ok", to: "fim", port: "next" },
      ],
    );
    const c = conversa(doc);
    const r = c.dizer("x");
    expect(r.acoes).toContainEqual(
      expect.objectContaining({ type: "webhook", url: "https://exemplo.com/x" }),
    );
    expect(c.sessao.status).toBe("waiting_external");
    expect(textos(c.enviar({ type: "webhook_result", at: 2000, ok: true }).acoes)).toEqual([
      "Feito",
    ]);
  });
});
