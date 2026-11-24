import { describe, expect, it } from "vitest";

import { avaliarRascunhoStudio } from "../src/studio-offline.js";

const draft = {
  schemaVersion: "flow-bot/v0",
  flow: {
    id: "studio-piloto",
    name: "Piloto Studio",
    timezone: "America/Sao_Paulo",
    status: "draft",
    entryNodeId: "inicio",
  },
  limits: { maxStepsPerEvent: 20 },
  variables: [],
  nodes: [
    { id: "inicio", type: "trigger.message_received", config: {} },
    { id: "resposta", type: "message.text", config: { text: "Olá!" } },
    { id: "fim", type: "action.end", config: {} },
  ],
  edges: [
    { id: "e1", from: "inicio", to: "resposta", port: "next" },
    { id: "e2", from: "resposta", to: "fim", port: "next" },
  ],
};
const scenarios = {
  scenarios: [
    {
      name: "Saudação",
      steps: [{ say: "oi", expect: { contains: ["Olá!"], status: "completed" } }],
    },
  ],
};

describe("Bot Studio: ponte offline", () => {
  it("valida, compara e simula pelo motor sem publicar", () => {
    const base = { ...draft, flow: { ...draft.flow, name: "Antes" } };
    expect(avaliarRascunhoStudio({ draft, base, scenarios })).toMatchObject({
      ok: true,
      mode: "offline",
      approved: false,
      published: false,
      scenariosPassed: true,
      diff: [{ path: "/flow/name", before: "Antes", after: "Piloto Studio" }],
    });
  });

  it("rejeita grafo quebrado, perfil inválido e publicação", () => {
    expect(avaliarRascunhoStudio({ draft: { ...draft, edges: [] }, scenarios })).toMatchObject({
      ok: false,
      error: "fluxo_invalido",
    });
    expect(avaliarRascunhoStudio({ draft, scenarios, perfil: {} })).toMatchObject({
      ok: false,
      error: "perfil_invalido",
    });
    const published = { ...draft, flow: { ...draft.flow, status: "published" } };
    expect(avaliarRascunhoStudio({ draft: published, scenarios })).toMatchObject({
      ok: false,
      approved: false,
      published: false,
      error: "somente_rascunho",
    });
  });

  it("recusa comparação entre fluxos diferentes e limita cenários", () => {
    const base = { ...draft, flow: { ...draft.flow, id: "outro" } };
    expect(avaliarRascunhoStudio({ draft, base, scenarios })).toMatchObject({
      ok: false,
      error: "base_invalida",
    });
    const tooMany = { scenarios: Array(21).fill(scenarios.scenarios[0]) };
    expect(avaliarRascunhoStudio({ draft, scenarios: tooMany })).toMatchObject({
      ok: false,
      error: "cenarios_invalidos",
    });
  });

  it("não confunde execução do cenário com sucesso ou aprovação", () => {
    const failing = {
      scenarios: [{ name: "Falha", steps: [{ say: "oi", expect: { contains: ["999"] } }] }],
    };
    expect(avaliarRascunhoStudio({ draft, scenarios: failing, approved: true })).toMatchObject({
      ok: true,
      scenariosPassed: false,
      reports: [{ ok: false }],
      approved: false,
      published: false,
    });
  });
});
