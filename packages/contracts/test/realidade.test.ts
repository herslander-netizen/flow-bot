import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  esquemaJsonDoPerfil,
  PerfilDeRealidade,
  realidadeDeExemplo,
  validarFluxo,
  type CodigoDoProblema,
} from "../src/index.js";

const perfil = PerfilDeRealidade.parse({
  id: "teste/v1",
  name: "Teste",
  facts: [
    {
      name: "reality.businessName",
      type: "string",
      description: "Nome",
      example: "Studio Exemplo",
    },
    { name: "reality.isOpen", type: "boolean", description: "Aberto agora", example: true },
  ],
});

const base = () =>
  JSON.parse(
    readFileSync(new URL("../fixtures/valid/palavra-chave-horario.json", import.meta.url), "utf8"),
  );

function codigos(doc: unknown, perfis = [perfil]): CodigoDoProblema[] {
  const r = validarFluxo(doc, { perfis });
  return r.ok ? [] : r.problems.map((p) => p.code);
}

describe("perfil de realidade", () => {
  it("valida o formato do id e dos fatos", () => {
    expect(PerfilDeRealidade.safeParse({ ...perfil, id: "Flow v1" }).success).toBe(false);
    expect(
      PerfilDeRealidade.safeParse({
        ...perfil,
        facts: [{ name: "negocio", type: "string", description: "x", example: "x" }],
      }).success,
    ).toBe(false);
  });

  it("gera o retrato de exemplo", () => {
    expect(realidadeDeExemplo(perfil)).toEqual({
      "reality.businessName": "Studio Exemplo",
      "reality.isOpen": true,
    });
  });

  it("tem JSON Schema publicado e atualizado", () => {
    const arquivo = JSON.parse(
      readFileSync(new URL("../schema/reality-profile-v1.schema.json", import.meta.url), "utf8"),
    );
    expect(arquivo).toEqual(JSON.parse(JSON.stringify(esquemaJsonDoPerfil())));
  });
});

describe("fluxo que usa a realidade", () => {
  it("aceita fatos do perfil declarado", () => {
    const doc = base();
    doc.reality = "teste/v1";
    doc.nodes[1].config.text = "{{reality.businessName}} abre às 9h.";
    expect(codigos(doc)).toEqual([]);
  });

  it("exige declarar o perfil", () => {
    const doc = base();
    doc.nodes[1].config.text = "{{reality.businessName}}";
    expect(codigos(doc)).toContain("realidade_sem_perfil");
  });

  it("recusa fato que o perfil não tem", () => {
    const doc = base();
    doc.reality = "teste/v1";
    doc.nodes[1].config.text = "{{reality.cpfDoDono}}";
    expect(codigos(doc)).toContain("fato_desconhecido");
  });

  it("recusa perfil desconhecido quando os perfis são informados", () => {
    const doc = base();
    doc.reality = "outro/v1";
    expect(codigos(doc)).toContain("perfil_desconhecido");
  });

  it("sem a lista de perfis, só exige a declaração (os fatos são conferidos depois)", () => {
    const doc = base();
    doc.reality = "outro/v9";
    doc.nodes[1].config.text = "{{reality.qualquerCoisa}}";
    expect(validarFluxo(doc).ok).toBe(true);
  });

  it("a realidade é só leitura", () => {
    const doc = base();
    doc.reality = "teste/v1";
    doc.nodes.push({
      id: "grava",
      type: "data.set_variable",
      config: { variable: "reality.isOpen", value: false },
      detached: true,
    });
    expect(codigos(doc)).toContain("variavel_invalida");
  });

  it("condição pode ler um fato booleano", () => {
    const doc = base();
    doc.reality = "teste/v1";
    doc.nodes.push({
      id: "aberto",
      type: "logic.condition",
      config: { variable: "reality.isOpen", operator: "is_true" },
      detached: true,
    });
    doc.nodes.push({ id: "fim2", type: "action.end", config: {}, detached: true });
    doc.edges.push(
      { id: "a1", from: "aberto", to: "fim2", port: "true" },
      { id: "a2", from: "aberto", to: "fim2", port: "false" },
    );
    expect(codigos(doc)).toEqual([]);
  });
});
