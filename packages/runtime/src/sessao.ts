/**
 * Estado de uma conversa e o que entra e sai de cada processamento. Tudo é dado serializável (JSON), para a camada
 * de persistência (Fase 3) gravar e retomar sem perder nada.
 */
export type Valor = string | number | boolean;

export type StatusDaSessao =
  | "new"
  | "running"
  | "waiting_input"
  | "scheduled"
  | "waiting_external"
  | "completed"
  | "handed_off"
  | "failed";

export type Sessao = {
  flowId: string;
  status: StatusDaSessao;
  /** Nó em que a sessão está parada (espera, atraso ou webhook). */
  cursor: string | null;
  /** Instante (ms) em que a espera ou o atraso vence. */
  prazo: number | null;
  /** Tentativas já usadas na espera atual. */
  tentativas: number;
  variaveis: Record<string, Valor>;
  /** Passagens por cada `logic.goto` nesta conversa. */
  visitas: Record<string, number>;
  /** Último disparo (ms) de cada gatilho, para a pausa contra repetição. */
  ultimoDisparo: Record<string, number>;
  mensagens: number;
  /** Motivo de `failed`. */
  erro?: string;
};

export type Contato = { firstName?: string | undefined; name?: string | undefined };

export type Evento =
  | { type: "message"; id: string; at: number; text: string; contact?: Contato }
  /** O prazo da sessão venceu (espera ou atraso). */
  | { type: "timer"; id: string; at: number }
  | { type: "webhook_result"; id: string; at: number; ok: boolean };

export type Acao =
  | { type: "send_text"; nodeId: string; text: string; delayMs: number }
  | {
      type: "send_quick_replies";
      nodeId: string;
      text: string;
      options: { value: string; label: string }[];
      delayMs: number;
    }
  /** Pedido para a camada de fora acordar a sessão em `at`. */
  | { type: "schedule"; nodeId: string; at: number; reason: "timeout" | "delay" }
  | { type: "webhook"; nodeId: string; url: string; method: "POST" | "PUT"; timeoutMs: number }
  | { type: "handoff"; nodeId: string; note?: string };

export type Passo = {
  nodeId: string;
  type: string;
  /** Porta por onde saiu (se saiu). */
  port?: string;
  detalhe?: string;
};

export type Resultado = {
  sessao: Sessao;
  acoes: Acao[];
  passos: Passo[];
  /** Por que o evento terminou assim: `suspensa`, `concluida`, `nenhum_gatilho`, `limite_de_passos`… */
  motivo: string;
};

export function novaSessao(flowId: string): Sessao {
  return {
    flowId,
    status: "new",
    cursor: null,
    prazo: null,
    tentativas: 0,
    variaveis: {},
    visitas: {},
    ultimoDisparo: {},
    mensagens: 0,
  };
}
