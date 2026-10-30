import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { esquemaJsonDoFluxo, problemaDoPadrao, TIPOS_DE_NO } from "../src/index.js";

describe("problemaDoPadrao", () => {
  it.each([
    ["(a+)+", "quantificador_aninhado"],
    ["(a*)*b", "quantificador_aninhado"],
    ["((ab)+)+", "quantificador_aninhado"],
    ["(\\w+\\s?)*$", "quantificador_aninhado"],
    ["(a)\\1", "referencia_de_volta"],
    ["(?<=x)y", "lookbehind"],
    ["(?<!x)y", "lookbehind"],
    ["[a-", "nao_compila"],
    ["", "vazio"],
    ["a".repeat(201), "longo_demais"],
  ])("recusa %s (%s)", (padrao, problema) => {
    expect(problemaDoPadrao(padrao)).toBe(problema);
  });

  it.each([
    "^\\d{4}$",
    "^(oi|ola)\\b",
    "[a-z]+@[a-z]+\\.[a-z]{2,}",
    "(ab)+",
    "\\(a+\\)+",
    "[(a+)]+",
  ])("aceita %s", (padrao) => {
    expect(problemaDoPadrao(padrao)).toBeNull();
  });
});

describe("JSON Schema", () => {
  it("o arquivo publicado está igual ao gerado do schema zod", () => {
    const arquivo = JSON.parse(
      readFileSync(new URL("../schema/flow-bot-v0.schema.json", import.meta.url), "utf8"),
    );
    expect(arquivo).toEqual(JSON.parse(JSON.stringify(esquemaJsonDoFluxo())));
  });

  it("descreve todos os tipos do catálogo", () => {
    const texto = JSON.stringify(esquemaJsonDoFluxo());
    for (const tipo of TIPOS_DE_NO) expect(texto).toContain(`"${tipo}"`);
  });
});
