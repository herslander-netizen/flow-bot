import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validarFluxo, type CodigoDoProblema } from "../src/index.js";

const pasta = new URL("../fixtures/", import.meta.url);
const ler = (arquivo: string) => JSON.parse(readFileSync(new URL(arquivo, pasta), "utf8"));
const base = () => ler("valid/boas-vindas-menu.json");

type Documento = ReturnType<typeof base>;

function codigos(doc: unknown): CodigoDoProblema[] {
  const r = validarFluxo(doc);
  return r.ok ? [] : r.problems.map((p) => p.code);
}

function comNo(doc: Documento, id: string, fn: (no: Documento) => void) {
  fn(doc.nodes.find((n: { id: string }) => n.id === id));
  return doc;
}

describe("fluxos válidos", () => {
  for (const arquivo of readdirSync(new URL("valid/", pasta))) {
    it(`aceita ${arquivo}`, () => {
      const r = validarFluxo(ler(`valid/${arquivo}`));
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }
});

describe("estrutura", () => {
  it("exige schemaVersion conhecido", () => {
    const doc = base();
    doc.schemaVersion = "flow-bot/v9";
    expect(codigos(doc)).toEqual(["estrutura"]);
  });

  it("recusa fuso horário inválido e campos extras", () => {
    const doc = base();
    doc.flow.timezone = "Brasil/Hora";
    doc.extra = true;
    const r = validarFluxo(doc);
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.path)).toEqual(expect.arrayContaining(["flow.timezone", ""]));
  });
});

describe("nós desconhecidos e configuração", () => {
  it("aponta o tipo desconhecido com o caminho do nó", () => {
    const doc = comNo(base(), "ola", (n) => (n.type = "message.audio_magico"));
    const r = validarFluxo(doc);
    expect(r.ok).toBe(false);
    expect(r.problems).toContainEqual(
      expect.objectContaining({ code: "no_desconhecido", nodeId: "ola", path: "nodes[1].type" }),
    );
  });

  it("aponta o campo inválido da configuração", () => {
    const doc = comNo(base(), "espera", (n) => (n.config.timeoutSeconds = 1));
    const r = validarFluxo(doc);
    expect(r.problems).toContainEqual(
      expect.objectContaining({
        code: "config_invalida",
        nodeId: "espera",
        path: "nodes[3].config.timeoutSeconds",
      }),
    );
  });
});

describe("IDs duplicados", () => {
  it("recusa nó com id repetido", () => {
    const doc = base();
    doc.nodes.push({ id: "ola", type: "action.end", config: {} });
    expect(codigos(doc)).toContain("id_duplicado");
  });

  it("recusa aresta com id repetido", () => {
    const doc = base();
    doc.edges[1].id = "e1";
    expect(codigos(doc)).toContain("id_duplicado");
  });
});

describe("conexões inválidas", () => {
  it("origem e destino precisam existir", () => {
    const doc = base();
    doc.edges.push({ id: "x1", from: "fantasma", to: "fim", port: "next" });
    doc.edges.push({ id: "x2", from: "fim", to: "nada", port: "next" });
    expect(codigos(doc)).toEqual(
      expect.arrayContaining(["aresta_origem_inexistente", "aresta_destino_inexistente"]),
    );
  });

  it("a porta precisa existir no tipo do nó (inclusive terminal)", () => {
    const doc = base();
    doc.edges.find((e: { id: string }) => e.id === "e4").port = "talvez";
    doc.edges.push({ id: "x3", from: "fim", to: "ola", port: "next" });
    const r = validarFluxo(doc);
    const invalidas = r.problems.filter((p) => p.code === "porta_invalida").map((p) => p.edgeId);
    expect(invalidas).toEqual(expect.arrayContaining(["e4", "x3"]));
  });

  it("uma porta tem um destino só", () => {
    const doc = base();
    doc.edges.push({ id: "x4", from: "ola", to: "fim", port: "next" });
    expect(codigos(doc)).toContain("porta_repetida");
  });

  it("gatilho não recebe aresta", () => {
    const doc = base();
    doc.edges.push({ id: "x5", from: "agendar", to: "inicio", port: "next" });
    expect(codigos(doc)).toContain("aresta_para_gatilho");
  });

  it("saídas obrigatórias precisam de destino", () => {
    const doc = base();
    doc.edges = doc.edges.filter((e: { id: string }) => e.id !== "e9");
    expect(codigos(doc)).toContain("saida_obrigatoria_ausente");
  });

  it("o salto precisa apontar para um nó existente", () => {
    const doc = comNo(base(), "voltar", (n) => (n.config.target = "lugar-nenhum"));
    expect(codigos(doc)).toContain("goto_destino_inexistente");
  });

  it("o nó de entrada precisa existir", () => {
    const doc = base();
    doc.flow.entryNodeId = "comeco";
    expect(codigos(doc)).toContain("entrada_inexistente");
  });

  it("nó solto precisa ser marcado como detached", () => {
    const doc = base();
    doc.nodes.push({ id: "perdido", type: "action.end", config: {} });
    expect(codigos(doc)).toContain("no_inalcancavel");
    doc.nodes[doc.nodes.length - 1].detached = true;
    expect(codigos(doc)).not.toContain("no_inalcancavel");
  });
});

describe("variáveis", () => {
  it("variável session não declarada é erro", () => {
    const doc = comNo(base(), "ola", (n) => (n.config.text = "Seu código: {{session.codigo}}"));
    const r = validarFluxo(doc);
    expect(r.problems).toContainEqual(
      expect.objectContaining({
        code: "variavel_nao_declarada",
        nodeId: "ola",
        path: "nodes[1].config.text",
      }),
    );
  });

  it("variável do sistema inexistente é erro", () => {
    const doc = comNo(base(), "ola", (n) => (n.config.text = "Oi {{contact.cpf}}"));
    expect(codigos(doc)).toContain("variavel_nao_declarada");
  });

  it("nome fora dos namespaces é inválido", () => {
    const doc = comNo(base(), "ola", (n) => (n.config.text = "Oi {{process.env.TOKEN}}"));
    expect(codigos(doc)).toContain("variavel_invalida");
  });

  it("o fluxo só grava em session", () => {
    const doc = comNo(base(), "espera", (n) => (n.config.saveAs = "contact.name"));
    expect(codigos(doc)).toContain("variavel_invalida");
  });

  it("declaração repetida é erro", () => {
    const doc = base();
    doc.variables.push({ name: "session.escolha", type: "string" });
    expect(codigos(doc)).toContain("variavel_duplicada");
  });
});

describe("loops sem limite", () => {
  it("ciclo entre mensagens sem espera nem limite é recusado", () => {
    const doc = base();
    // agendar → servicos → agendar, sem suspender nem limitar.
    doc.edges.find((e: { id: string }) => e.id === "e12").to = "servicos";
    doc.edges.find((e: { id: string }) => e.id === "e13").to = "agendar";
    const r = validarFluxo(doc);
    expect(r.problems).toContainEqual(expect.objectContaining({ code: "loop_sem_limite" }));
  });

  it("ciclo com espera (que tem prazo) é aceito", () => {
    expect(codigos(base())).not.toContain("loop_sem_limite");
  });

  it("nó que aponta para si mesmo sem limite é recusado", () => {
    const doc = base();
    doc.edges.find((e: { id: string }) => e.id === "e12").to = "agendar";
    expect(codigos(doc)).toContain("loop_sem_limite");
  });
});

describe("timeouts ausentes", () => {
  it("espera sem prazo é recusada no schema", () => {
    const doc = comNo(base(), "espera", (n) => delete n.config.timeoutSeconds);
    expect(codigos(doc)).toContain("config_invalida");
  });

  it("espera sem destino para o fim do prazo é recusada", () => {
    const doc = base();
    doc.edges = doc.edges.filter((e: { id: string }) => e.id !== "e5");
    expect(codigos(doc)).toContain("espera_sem_tratamento_de_timeout");
  });

  it("webhook sem timeout é recusado", () => {
    const doc = base();
    doc.nodes.push({
      id: "chamar",
      type: "action.webhook",
      config: { url: "https://exemplo.com/gancho", method: "POST" },
      detached: true,
    });
    expect(codigos(doc)).toContain("config_invalida");
  });

  it("webhook só em HTTPS", () => {
    const doc = base();
    doc.nodes.push({
      id: "chamar",
      type: "action.webhook",
      config: { url: "http://exemplo.com/gancho", method: "POST", timeoutMs: 2000 },
      detached: true,
    });
    expect(codigos(doc)).toContain("config_invalida");
  });
});

describe("correspondência", () => {
  const doc = () => ler("valid/palavra-chave-horario.json");

  it("RegEx insegura é recusada", () => {
    const d = doc();
    d.nodes[0].config.match = { mode: "regex", values: ["(a+)+$"] };
    expect(codigos(d)).toContain("regex_insegura");
  });

  it("RegEx simples é aceita", () => {
    const d = doc();
    d.nodes[0].config.match = { mode: "regex", values: ["^\\d{4}$", "^(oi|ola)\\b"] };
    expect(codigos(d)).toEqual([]);
  });

  it("padrão só com curinga é recusado (o catch-all é explícito)", () => {
    const d = doc();
    d.nodes[0].config.match = { mode: "pattern", values: ["*"] };
    expect(codigos(d)).toContain("curinga_total");
  });

  it("padrão com curinga e texto é aceito", () => {
    const d = doc();
    d.nodes[0].config.match = { mode: "pattern", values: ["*obrigad*", "oi*tudo bem*"] };
    expect(codigos(d)).toEqual([]);
  });

  it("limiar padrão do fluxo vale para a similaridade", () => {
    const d = doc();
    d.defaults = { similarityThreshold: 0.6 };
    d.nodes[0].config.match = { mode: "similarity", values: ["que horas abre"] };
    expect(codigos(d)).toEqual([]);
  });

  it("atraso mínimo maior que o máximo é recusado", () => {
    const d = doc();
    d.defaults = { delaySeconds: { min: 10, max: 2 } };
    expect(codigos(d)).toContain("atraso_invalido");
  });

  it("similaridade exige limiar", () => {
    const d = doc();
    d.nodes[0].config.match = { mode: "similarity", values: ["que horas abre"] };
    expect(codigos(d)).toContain("limiar_ausente");
  });
});
