/**
 * Plano executável: o documento validado com índices prontos (nó por id, destino por porta, gatilhos em ordem).
 * Só nasce de um documento que passou em `validarFluxo`, então o motor não precisa reconferir a estrutura.
 */
import {
  validarFluxo,
  type DocumentoDeFluxo,
  type Problema,
  type TipoDeNo,
} from "@flow-bot/contracts";

export type NoDoPlano = { id: string; type: TipoDeNo; config: Record<string, unknown> };

export type Plano = {
  doc: DocumentoDeFluxo;
  nos: Map<string, NoDoPlano>;
  /** `from` → porta → `to`. */
  saidas: Map<string, Map<string, string>>;
  /** `trigger.keyword` em ordem de prioridade (menor primeiro; empate pelo id). */
  palavrasChave: NoDoPlano[];
  /** `trigger.message_received` (catch-all explícito), se houver. */
  qualquerMensagem: NoDoPlano | null;
  defaults: NonNullable<DocumentoDeFluxo["defaults"]>;
  maxPassos: number;
};

export class FluxoInvalido extends Error {
  constructor(readonly problemas: Problema[]) {
    super(`Fluxo inválido: ${problemas.map((p) => `${p.code} em ${p.path}`).join("; ")}`);
  }
}

export function compilar(entrada: unknown): Plano {
  const r = validarFluxo(entrada);
  if (!r.ok) throw new FluxoInvalido(r.problems);
  const doc = r.flow;
  const nos = new Map<string, NoDoPlano>(
    doc.nodes.map((n) => [n.id, { id: n.id, type: n.type as TipoDeNo, config: n.config }]),
  );
  const saidas = new Map<string, Map<string, string>>();
  for (const e of doc.edges) {
    const porNo = saidas.get(e.from) ?? new Map<string, string>();
    porNo.set(e.port, e.to);
    saidas.set(e.from, porNo);
  }
  const lista = [...nos.values()];
  const palavrasChave = lista
    .filter((n) => n.type === "trigger.keyword")
    .sort(
      (a, b) =>
        Number(a.config["priority"]) - Number(b.config["priority"]) || a.id.localeCompare(b.id),
    );
  const qualquerMensagem =
    lista
      .filter((n) => n.type === "trigger.message_received")
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
  return {
    doc,
    nos,
    saidas,
    palavrasChave,
    qualquerMensagem,
    defaults: doc.defaults ?? {},
    maxPassos: doc.limits.maxStepsPerEvent,
  };
}
