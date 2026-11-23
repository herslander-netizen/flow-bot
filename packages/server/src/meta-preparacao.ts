/**
 * Contratos preparatórios do canal Meta Cloud API.
 *
 * NÃO possui fetch(), segredo, endpoint, fila ou função de envio.
 * Um futuro canal Meta deve reutilizar estes controles, sem permitir o envio
 * até que haja implementação, homologação e autorização financeira específicas.
 */
export type CanalWhatsApp = "evolution_alvo" | "meta_cloud";
export type CategoriaMeta = "marketing" | "utility" | "authentication";

export type IntencaoMeta = {
  workspaceId: string;
  telefone: string;
  phoneNumberId: string;
  categoria: CategoriaMeta;
  template: string;
  idioma: string;
  idempotencyKey: string;
};

export type EvidenciaDeConsentimento = {
  workspaceId: string;
  telefone: string;
  categoria: CategoriaMeta;
  origem: string;
  autorizadoEm: string;
  revogadoEm?: string;
};

export type TemplateMeta = {
  workspaceId: string;
  nome: string;
  idioma: string;
  categoria: CategoriaMeta;
  aprovado: boolean;
};

export type ContextoMeta = {
  consentimento?: EvidenciaDeConsentimento;
  template?: TemplateMeta;
  optOut: boolean;
  limiteFinanceiroAprovado: boolean;
  numeroHabilitadoNaMeta: boolean;
};

export type AvaliacaoMeta = {
  elegivelParaPreparar: boolean;
  motivos: string[];
};

const DDI = /^[1-9][0-9]{9,14}$/;
const CHAVE = /^[A-Za-z0-9_.:-]{8,128}$/;
const TEMPLATE = /^[a-z][a-z0-9_]{0,511}$/;
const IDIOMA = /^[a-z]{2,3}(?:_[A-Z]{2})?$/;

/**
 * Checagem pura, sem fazer solicitações nem registrar dados pessoais.
 * Elegível para preparação NÃO equivale a permissão de envio.
 */
export function avaliarPreparacaoMeta(
  intencao: IntencaoMeta,
  contexto: ContextoMeta,
): AvaliacaoMeta {
  const motivos: string[] = [];
  if (!intencao.workspaceId || !intencao.workspaceId.trim()) motivos.push("workspace_invalido");
  if (!DDI.test(intencao.telefone)) motivos.push("telefone_invalido");
  if (!/^\d{1,30}$/.test(intencao.phoneNumberId)) motivos.push("identificador_meta_invalido");
  if (!CHAVE.test(intencao.idempotencyKey)) motivos.push("idempotencia_invalida");
  if (!TEMPLATE.test(intencao.template) || !IDIOMA.test(intencao.idioma))
    motivos.push("template_invalido");
  if (!["marketing", "utility", "authentication"].includes(intencao.categoria))
    motivos.push("categoria_invalida");

  if (contexto.optOut) motivos.push("opt_out");
  if (!contexto.numeroHabilitadoNaMeta) motivos.push("numero_meta_nao_habilitado");
  if (!contexto.limiteFinanceiroAprovado) motivos.push("sem_limite_financeiro_aprovado");

  const consentimento = contexto.consentimento;
  if (
    !consentimento ||
    consentimento.workspaceId !== intencao.workspaceId ||
    consentimento.telefone !== intencao.telefone ||
    consentimento.categoria !== intencao.categoria ||
    !consentimento.origem.trim() ||
    !Number.isFinite(Date.parse(consentimento.autorizadoEm)) ||
    Boolean(consentimento.revogadoEm)
  )
    motivos.push("consentimento_ausente_ou_invalido");

  const template = contexto.template;
  if (
    !template ||
    template.workspaceId !== intencao.workspaceId ||
    template.nome !== intencao.template ||
    template.idioma !== intencao.idioma ||
    template.categoria !== intencao.categoria ||
    !template.aprovado
  )
    motivos.push("template_nao_aprovado");

  return { elegivelParaPreparar: motivos.length === 0, motivos };
}

export class MetaNaoHabilitada extends Error {
  constructor() {
    super("Meta Cloud API reservada para fase futura; nenhum envio está implementado.");
    this.name = "MetaNaoHabilitada";
  }
}

/**
 * Bloqueio deliberado: mesmo com todas as credenciais/consentimentos, enviar
 * requer um novo adaptador homologado. Alterar env não habilita disparos.
 */
export async function enviarViaMetaNaoDisponivel(): Promise<never> {
  throw new MetaNaoHabilitada();
}
