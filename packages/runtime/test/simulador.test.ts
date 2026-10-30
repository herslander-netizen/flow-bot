import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ArquivoDeCenarios, compilar, simular } from "../src/index.js";

const ler = (caminho: string) =>
  JSON.parse(readFileSync(new URL(`../../../${caminho}`, import.meta.url), "utf8"));

describe("simulador", () => {
  const plano = compilar(ler("examples/boas-vindas-menu.json"));
  const { scenarios } = ArquivoDeCenarios.parse(ler("examples/boas-vindas-menu.cenarios.json"));

  for (const cenario of scenarios) {
    it(`passa: ${cenario.name}`, () => {
      const r = simular(plano, cenario);
      expect(r.passos.flatMap((p) => p.falhas)).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }

  it("aponta a diferença quando a expectativa não bate", () => {
    const r = simular(plano, {
      name: "errado",
      steps: [{ say: "oi", expect: { replies: ["outra coisa"], status: "completed" } }],
    });
    expect(r.ok).toBe(false);
    expect(r.passos[0]?.falhas).toEqual([
      expect.stringContaining("respostas: esperado"),
      "status: esperado completed, veio waiting_input",
    ]);
  });

  it("a espera dispara os prazos vencidos em ordem (com nova tentativa)", () => {
    const r = simular(plano, {
      name: "prazo",
      steps: [{ say: "oi" }, { wait: 299 }, { wait: 1 }, { wait: 300 }],
    });
    expect(r.passos.map((p) => p.motivo)).toEqual([
      "suspensa",
      "nada_venceu",
      "evento_ignorado",
      "concluida",
    ]);
  });

  it("recusa cenário mal formado", () => {
    expect(
      ArquivoDeCenarios.safeParse({ scenarios: [{ name: "x", steps: [{ dizer: "oi" }] }] }).success,
    ).toBe(false);
  });
});
