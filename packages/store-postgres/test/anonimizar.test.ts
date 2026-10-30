import { describe, expect, it } from "vitest";

import { anonimizar } from "../src/anonimizar.js";

describe("anonimizar", () => {
  it.each([
    ["Meu número é (82) 99999-0000", "meu numero e [telefone]"],
    ["liga no +55 82 99999 0000 por favor", "liga no [telefone] por favor"],
    ["manda no ana.souza@exemplo.com", "manda no [email]"],
    ["meu cpf 123.456.789-09", "meu cpf [documento]"],
    ["vi no https://site.exemplo/promo?x=1", "vi no [link]"],
    ["paguei R$ 45,00 ontem", "paguei [valor] ontem"],
    ["pedido 123456 chegou?", "pedido [numero] chegou"],
    ["Vocês atendem DOMINGO?!", "voces atendem domingo"],
  ])("%s", (entrada, saida) => {
    expect(anonimizar(entrada)).toBe(saida);
  });

  it("troca o nome do próprio contato", () => {
    expect(anonimizar("Oi, aqui é a Ana Souza", { name: "Ana Souza" })).toBe(
      "oi aqui e a [nome] [nome]",
    );
    // "Ana" dentro de outra palavra não é trocado.
    expect(anonimizar("banana", { firstName: "Ana" })).toBe("banana");
  });

  it("descarta o que não sobra texto útil", () => {
    expect(anonimizar("82999990000")).toBeNull();
    expect(anonimizar("👍")).toBeNull();
    expect(anonimizar("   ")).toBeNull();
  });

  it("limita o tamanho sem cortar palavra", () => {
    const r = anonimizar("palavra ".repeat(40)) ?? "";
    expect(r.length).toBeLessThanOrEqual(120);
    expect(r.endsWith("palavra")).toBe(true);
  });
});
