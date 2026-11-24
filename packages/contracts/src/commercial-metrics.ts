import { z } from "zod";

/**
 * Contrato independente do canal: somente IDs e valores em centavos.
 * Não inclui nome, telefone, mensagem, IP ou credenciais.
 */
const Base = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
});

export const EventoComercial = z.discriminatedUnion("kind", [
  Base.extend({
    kind: z.literal("lead_created"),
    leadId: z.string().uuid(),
    source: z.enum(["instagram_bio", "whatsapp", "site", "referral", "other"]),
    campaignId: z.string().min(1).max(120).optional(),
  }).strict(),
  Base.extend({
    kind: z.literal("sale_confirmed"),
    saleId: z.string().uuid(),
    leadId: z.string().uuid(),
    amountCents: z.number().int().min(0),
    customerType: z.enum(["new", "returning", "unknown"]),
    evidence: z.enum(["verified", "manual"]),
    campaignId: z.string().min(1).max(120).optional(),
  }).strict(),
  Base.extend({
    kind: z.literal("ad_spend"),
    spendId: z.string().uuid(),
    campaignId: z.string().min(1).max(120),
    amountCents: z.number().int().min(0),
  }).strict(),
]);

export type EventoComercial = z.infer<typeof EventoComercial>;

export interface IndicadoresComerciais {
  workspaceId: string;
  leads: number;
  leadsBySource: Record<string, number>;
  sales: number;
  newCustomers: number;
  returningSales: number;
  unknownCustomerTypeSales: number;
  revenueCents: number;
  verifiedRevenueCents: number;
  manualRevenueCents: number;
  adSpendCents: number;
  ticketAverageCents: number | null;
  conversionRate: number | null;
  paidCostPerLeadCents: number | null;
  paidCustomerAcquisitionCostCents: number | null;
  paidRoas: number | null;
  repeatPurchaseShare: number | null;
  attributedSales: number;
  warnings: string[];
}

/**
 * Calcula indicadores somente para um workspace, sem juntar dados de clientes.
 * Quando falta denominador ou atribuição, usa null, nunca um número fictício.
 * As entradas devem ser eventos persistidos e aprovados pela fonte autorizada.
 */
export function calcularIndicadoresComerciais(
  workspaceId: string,
  input: readonly EventoComercial[],
): IndicadoresComerciais {
  const ids = new Set<string>();
  const leads = new Map<string, Extract<EventoComercial, { kind: "lead_created" }>>();
  const sales = new Map<string, Extract<EventoComercial, { kind: "sale_confirmed" }>>();
  const spend = new Map<string, Extract<EventoComercial, { kind: "ad_spend" }>>();
  const warnings: string[] = [];
  for (const raw of input) {
    const event = EventoComercial.parse(raw);
    if (event.workspaceId !== workspaceId) continue;
    if (ids.has(event.eventId)) continue;
    ids.add(event.eventId);
    if (event.kind === "lead_created" && !leads.has(event.leadId))
      leads.set(event.leadId, event);
    if (event.kind === "sale_confirmed" && !sales.has(event.saleId))
      sales.set(event.saleId, event);
    if (event.kind === "ad_spend" && !spend.has(event.spendId))
      spend.set(event.spendId, event);
  }

  const leadList = [...leads.values()];
  const saleList = [...sales.values()];
  const spendList = [...spend.values()];
  const leadsBySource: Record<string, number> = {};
  for (const lead of leadList)
    leadsBySource[lead.source] = (leadsBySource[lead.source] ?? 0) + 1;

  const revenueCents = saleList.reduce((sum, sale) => sum + sale.amountCents, 0);
  const verifiedRevenueCents = saleList
    .filter((sale) => sale.evidence === "verified")
    .reduce((sum, sale) => sum + sale.amountCents, 0);
  const adSpendCents = spendList.reduce((sum, item) => sum + item.amountCents, 0);
  const campaigns = new Set(spendList.map((item) => item.campaignId));
  const attributedLeads = leadList.filter((lead) => lead.campaignId && campaigns.has(lead.campaignId));
  const attributedSales = saleList.filter((sale) => sale.campaignId && campaigns.has(sale.campaignId));
  const acquired = new Set(
    attributedSales.filter((sale) => sale.customerType === "new").map((sale) => sale.leadId),
  );
  const newCustomers = new Set(
    saleList.filter((sale) => sale.customerType === "new").map((sale) => sale.leadId),
  ).size;
  const returningSales = saleList.filter((sale) => sale.customerType === "returning").length;
  const unknownCustomerTypeSales = saleList.filter((sale) => sale.customerType === "unknown").length;
  if (saleList.some((sale) => sale.evidence === "manual"))
    warnings.push("Faturamento inclui vendas informadas manualmente, sem comprovação automática.");
  if (saleList.some((sale) => !sale.campaignId))
    warnings.push("Há vendas sem campanha atribuída; não interpretar ROAS como retorno de todas as vendas.");
  if (!leadList.length) warnings.push("Sem eventos de captação para calcular conversão.");
  if (adSpendCents === 0) warnings.push("Sem investimento publicitário registrado para calcular CPL, CAC e ROAS.");
  if (unknownCustomerTypeSales) warnings.push("Algumas vendas não informam se o cliente é novo ou recorrente.");

  const paidRevenue = attributedSales.reduce((sum, sale) => sum + sale.amountCents, 0);
  const knownCustomerSales = saleList.length - unknownCustomerTypeSales;
  return {
    workspaceId,
    leads: leadList.length,
    leadsBySource,
    sales: saleList.length,
    newCustomers,
    returningSales,
    unknownCustomerTypeSales,
    revenueCents,
    verifiedRevenueCents,
    manualRevenueCents: revenueCents - verifiedRevenueCents,
    adSpendCents,
    ticketAverageCents: saleList.length ? Math.round(revenueCents / saleList.length) : null,
    conversionRate: leadList.length
      ? new Set(saleList.map((sale) => sale.leadId).filter((leadId) => leads.has(leadId))).size / leadList.length
      : null,
    paidCostPerLeadCents:
      adSpendCents > 0 && attributedLeads.length ? Math.round(adSpendCents / attributedLeads.length) : null,
    paidCustomerAcquisitionCostCents:
      adSpendCents > 0 && acquired.size ? Math.round(adSpendCents / acquired.size) : null,
    paidRoas:
      adSpendCents > 0 && attributedSales.length ? paidRevenue / adSpendCents : null,
    repeatPurchaseShare: knownCustomerSales ? returningSales / knownCustomerSales : null,
    attributedSales: attributedSales.length,
    warnings,
  };
}
