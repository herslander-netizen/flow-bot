import { describe, expect, it } from "vitest";

import { casarCuringa, corresponder, normalizar, similaridade } from "../src/index.js";

describe("normalizar", () => {
  it("ignora caixa, acentos, espaços repetidos, emojis e pontuação", () => {
    expect(normalizar("  Olá!!  Que   HORAS abre? 😀 ")).toBe("ola que horas abre");
  });
  it("mantém acentos quando pedido", () => {
    expect(normalizar("Olá", false)).toBe("olá");
  });
});

describe("corresponder", () => {
  const exato = { mode: "exact" as const, values: ["bom dia", "oi"] };

  it("exato normalizado", () => {
    expect(corresponder(exato, "Bom   DIA!!").casou).toBe(true);
    expect(corresponder(exato, "bom dia, tudo bem?").casou).toBe(false);
  });

  it("contém por palavra inteira", () => {
    const m = { mode: "contains" as const, values: ["oi"] };
    expect(corresponder(m, "oi, tudo bem?").casou).toBe(true);
    expect(corresponder(m, "boa noite").casou).toBe(false);
  });

  it("começa e termina com", () => {
    expect(corresponder({ mode: "starts_with", values: ["quero"] }, "Quero agendar").casou).toBe(
      true,
    );
    expect(corresponder({ mode: "ends_with", values: ["obrigado"] }, "muito obrigado!").casou).toBe(
      true,
    );
  });

  it("exceção anula a correspondência", () => {
    const m = { mode: "contains" as const, values: ["horario"], exclude: ["cancelar"] };
    expect(corresponder(m, "qual o horário?").casou).toBe(true);
    const r = corresponder(m, "quero cancelar meu horário");
    expect(r).toMatchObject({ casou: false, motivo: "excecao" });
  });

  it("padrão com curinga, sem RegEx", () => {
    const m = { mode: "pattern" as const, values: ["*obrigad*", "ei*esta"] };
    expect(corresponder(m, "Muito obrigada!").casou).toBe(true);
    expect(corresponder(m, "Ei, como você está?").casou).toBe(true);
    expect(corresponder(m, "valeu").casou).toBe(false);
  });

  it("RegEx devolve as capturas", () => {
    const r = corresponder(
      { mode: "regex", values: ["pedido (\\d{4})"] },
      "Meu PEDIDO 1234 chegou?",
    );
    expect(r).toMatchObject({ casou: true, capturas: ["1234"] });
  });

  it("similaridade respeita o limiar", () => {
    const m = { mode: "similarity" as const, values: ["que horas voces abrem"], threshold: 0.7 };
    expect(corresponder(m, "que horas vcs abrem?").casou).toBe(true);
    expect(corresponder(m, "quanto custa o corte").casou).toBe(false);
  });

  it("similaridade usa o limiar padrão do fluxo", () => {
    const m = { mode: "similarity" as const, values: ["bom dia"] };
    expect(corresponder(m, "bon dia", { limiarPadrao: 0.5 }).casou).toBe(true);
  });
});

describe("auxiliares", () => {
  it("curinga", () => {
    expect(casarCuringa("a*c", "abbbc")).toBe(true);
    expect(casarCuringa("a*c", "abbbd")).toBe(false);
    expect(casarCuringa("*", "")).toBe(true);
  });
  it("similaridade 0–1", () => {
    expect(similaridade("abc", "abc")).toBe(1);
    expect(similaridade("abc", "xyz")).toBe(0);
  });
});
