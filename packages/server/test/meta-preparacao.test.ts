import { describe, expect, it } from "vitest";

import {
  avaliarPreparacaoMeta,
  enviarViaMetaNaoDisponivel,
  MetaNaoHabilitada,
  type ContextoMeta,
  type IntencaoMeta,
} from "../src/meta-preparacao.js";

const intencao: IntencaoMeta = {
  workspaceId: "flowbot",
  telefone: "5582999990000",
  phoneNumberId: "12345678901234",
  categoria: "utility",
  template: "lembrete_agendamento",
  idioma: "pt_BR",
  idempotencyKey: "flowbot:agendamento:12345",
};

const contexto: ContextoMeta = {
  consentimento: {
    workspaceId: "flowbot",
    telefone: "5582999990000",
    categoria: "utility",
    autorizadoEm: "2026-11-23T12:00:00.000Z",
    origem: "formulario_do_cliente",
  },
  template: {
    workspaceId: "flowbot",
    nome: "lembrete_agendamento",
    idioma: "pt_BR",
    categoria: "utility",
    aprovado: true,
  },
  optOut: false,
  numeroHabilitadoNaMeta: true,
  limiteFinanceiroAprovado: true,
};

describe("Meta Cloud API: base futura, sem disparos", () => {
  it("valida apenas elegibilidade documental e nunca envia", async () => {
    expect(avaliarPreparacaoMeta(intencao, contexto)).toEqual({
      elegivelParaPreparar: true,
      motivos: [],
    });
    await expect(enviarViaMetaNaoDisponivel()).rejects.toBeInstanceOf(MetaNaoHabilitada);
  });

  it("nega destinatário sem consentimento explícito", () => {
    const r = avaliarPreparacaoMeta(intencao, { ...contexto, consentimento: undefined });
    expect(r.elegivelParaPreparar).toBe(false);
    expect(r.motivos).toContain("consentimento_ausente_ou_invalido");
  });

  it("nega opt-out mesmo com consentimento anterior", () => {
    const r = avaliarPreparacaoMeta(intencao, { ...contexto, optOut: true });
    expect(r.motivos).toContain("opt_out");
  });

  it("impede cruzamento de consentimento entre empresas e categorias", () => {
    const outraEmpresa = avaliarPreparacaoMeta(intencao, {
      ...contexto,
      consentimento: { ...contexto.consentimento!, workspaceId: "outra_empresa" },
    });
    expect(outraEmpresa.motivos).toContain("consentimento_ausente_ou_invalido");
    const outroTipo = avaliarPreparacaoMeta(intencao, {
      ...contexto,
      consentimento: { ...contexto.consentimento!, categoria: "marketing" },
    });
    expect(outroTipo.motivos).toContain("consentimento_ausente_ou_invalido");
  });

  it("nega template não aprovado ou de outra empresa", () => {
    const r = avaliarPreparacaoMeta(intencao, {
      ...contexto,
      template: { ...contexto.template!, aprovado: false, workspaceId: "outro" },
    });
    expect(r.motivos).toContain("template_nao_aprovado");
  });

  it("nega configurações financeiras não aprovadas", () => {
    const r = avaliarPreparacaoMeta(intencao, {
      ...contexto,
      limiteFinanceiroAprovado: false,
    });
    expect(r.motivos).toContain("sem_limite_financeiro_aprovado");
  });

  it("nega número não habilitado e IDs inválidos, sem chamadas externas", () => {
    const r = avaliarPreparacaoMeta(
      { ...intencao, telefone: "abc", idempotencyKey: "curta", phoneNumberId: "invalido" },
      { ...contexto, numeroHabilitadoNaMeta: false },
    );
    expect(r.motivos).toContain("telefone_invalido");
    expect(r.motivos).toContain("identificador_meta_invalido");
    expect(r.motivos).toContain("idempotencia_invalida");
    expect(r.motivos).toContain("numero_meta_nao_habilitado");
  });

  it("não transforma credenciais em autorização para envio", async () => {
    await expect(enviarViaMetaNaoDisponivel()).rejects.toThrow(
      /nenhum envio está implementado/,
    );
  });
});
