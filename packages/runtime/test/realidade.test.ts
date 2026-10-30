import { PerfilDeRealidade, realidadeDeExemplo } from "@flow-bot/contracts";
import { describe, expect, it } from "vitest";

import { compilar, novaSessao, processar, simular } from "../src/index.js";

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
    { name: "reality.isOpen", type: "boolean", description: "Aberto", example: true },
    {
      name: "reality.services",
      type: "list",
      description: "Serviços",
      example: ["Corte — R$ 45,00"],
    },
  ],
});

const fluxo = {
  schemaVersion: "flow-bot/v0",
  reality: "teste/v1",
  flow: {
    id: "real",
    name: "Real",
    timezone: "America/Sao_Paulo",
    status: "draft",
    entryNodeId: "inicio",
  },
  limits: { maxStepsPerEvent: 20 },
  nodes: [
    { id: "inicio", type: "trigger.message_received", config: {} },
    {
      id: "aberto",
      type: "logic.condition",
      config: { variable: "reality.isOpen", operator: "is_true" },
    },
    {
      id: "lista",
      type: "message.text",
      config: { text: "{{reality.businessName}} — serviços:{{reality.services}}" },
    },
    {
      id: "fechado",
      type: "message.text",
      config: { text: "{{reality.businessName}} está fechado agora." },
    },
    { id: "fim", type: "action.end", config: {} },
  ],
  edges: [
    { id: "1", from: "inicio", to: "aberto", port: "next" },
    { id: "2", from: "aberto", to: "lista", port: "true" },
    { id: "3", from: "aberto", to: "fechado", port: "false" },
    { id: "4", from: "lista", to: "fim", port: "next" },
    { id: "5", from: "fechado", to: "fim", port: "next" },
  ],
};

const texto = (r: ReturnType<typeof processar>) =>
  r.acoes.flatMap((a) => (a.type === "send_text" ? [a.text] : []));

describe("realidade no motor", () => {
  const plano = compilar(fluxo, { perfis: [perfil] });
  const evento = { type: "message" as const, id: "1", at: 0, text: "oi" };

  it("lê fatos, lista vira uma linha por item e condição lê o booleano", () => {
    const r = processar(plano, novaSessao("real"), evento, {
      realidade: {
        "reality.businessName": "Studio Exemplo",
        "reality.isOpen": true,
        "reality.services": ["Corte — R$ 45,00", "Escova — R$ 60,00"],
      },
    });
    expect(texto(r)).toEqual([
      "Studio Exemplo — serviços:\n• Corte — R$ 45,00\n• Escova — R$ 60,00",
    ]);
    expect(r.realidadeAusente).toEqual([]);
  });

  it("o mesmo fluxo responde diferente quando a realidade muda", () => {
    const r = processar(plano, novaSessao("real"), evento, {
      realidade: { "reality.businessName": "Studio Exemplo", "reality.isOpen": false },
    });
    expect(texto(r)).toEqual(["Studio Exemplo está fechado agora."]);
  });

  it("fato não entregue fica registrado no resultado", () => {
    const r = processar(plano, novaSessao("real"), evento, {
      realidade: { "reality.isOpen": true },
    });
    expect(r.realidadeAusente).toEqual(["reality.businessName", "reality.services"]);
  });

  it("compilar confere os fatos contra o perfil", () => {
    const errado = structuredClone(fluxo);
    errado.nodes[2]!.config = { text: "{{reality.inexistente}}" };
    expect(() => compilar(errado, { perfis: [perfil] })).toThrow("fato_desconhecido");
  });
});

describe("realidade no simulador", () => {
  const plano = compilar(fluxo, { perfis: [perfil] });

  it("parte do exemplo do perfil e aceita mudanças por cenário e por passo", () => {
    const r = simular(
      plano,
      {
        name: "abre e fecha",
        steps: [
          { say: "oi", expect: { contains: ["• Corte — R$ 45,00"] } },
          {
            say: "oi",
            reality: { "reality.isOpen": false },
            expect: { replies: ["Studio Exemplo está fechado agora."] },
          },
        ],
      },
      { realidade: realidadeDeExemplo(perfil) },
    );
    expect(r.passos.flatMap((p) => p.falhas)).toEqual([]);
  });

  it("fato ausente reprova o cenário", () => {
    const r = simular(plano, { name: "sem realidade", steps: [{ say: "oi" }] });
    expect(r.ok).toBe(false);
    expect(r.passos[0]?.falhas).toContain("fato da realidade ausente: reality.isOpen");
  });
});
