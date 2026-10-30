/**
 * Catálogo inicial de nós do Flow Bot (formato `flow-bot/v0`).
 *
 * Cada tipo declara o schema da sua configuração e as portas de saída. O catálogo é a única fonte do que
 * existe: um tipo fora dele é recusado pelo validador. Nenhum nó executa código vindo da configuração.
 */
import { z } from "zod";

/** Texto com placeholders `{{namespace.nome}}`, sem código. */
export const Texto = z.string().min(1).max(4096);

const ValorDeMenu = z.string().min(1).max(40);

/** Modos de correspondência determinística (nenhum usa modelo de linguagem). */
export const ModoDeCorrespondencia = z.enum([
  "exact",
  "contains",
  "starts_with",
  "ends_with",
  /** Curinga simples: `*` = qualquer trecho (ex.: `*obrigad*`). Sem RegEx; o editor pode aceitar `//` como "ou". */
  "pattern",
  "regex",
  "similarity",
]);

export const ConfigDeCorrespondencia = z
  .object({
    mode: ModoDeCorrespondencia,
    values: z.array(z.string().min(1).max(200)).min(1).max(50),
    /** Só para `similarity`: limiar entre 0,5 e 1. */
    threshold: z.number().min(0.5).max(1).optional(),
    /** Termos que anulam a correspondência. */
    exclude: z.array(z.string().min(1).max(200)).max(50).optional(),
  })
  .strict();

/** Porta de saída de um nó. `dynamic` = o nome vem da configuração (ex.: casos do switch). */
export type Porta = { name: string; required: boolean };

export type EspecDeNo = {
  /** Schema da configuração do nó. */
  config: z.ZodType;
  /** Portas fixas. */
  ports: readonly Porta[];
  /** Portas que dependem da configuração (ex.: `case:1`). */
  dynamicPorts?: (config: unknown) => Porta[];
  /** Nó terminal: não precisa de saída. */
  terminal?: boolean;
  /** Suspende a execução (espera resposta ou tempo): um ciclo que passa por ele tem limite. */
  suspends?: boolean;
  /** Só pode iniciar o fluxo (nenhuma aresta pode chegar nele). */
  trigger?: boolean;
};

const next: Porta = { name: "next", required: true };

export const CATALOGO = {
  "trigger.message_received": {
    config: z.object({}).strict(),
    ports: [next],
    trigger: true,
  },
  "trigger.keyword": {
    config: z
      .object({
        match: ConfigDeCorrespondencia,
        /** Menor = avaliado antes entre os gatilhos do workspace. */
        priority: z.number().int().min(0).max(10000),
      })
      .strict(),
    ports: [next],
    trigger: true,
  },
  "message.text": {
    config: z.object({ text: Texto }).strict(),
    ports: [next],
  },
  "message.quick_replies": {
    config: z
      .object({
        prompt: Texto,
        options: z
          .array(z.object({ value: ValorDeMenu, label: z.string().min(1).max(60) }).strict())
          .min(1)
          .max(10),
      })
      .strict(),
    ports: [next],
  },
  "logic.condition": {
    config: z
      .object({
        variable: z.string().min(1).max(80),
        operator: z.enum(["equals", "not_equals", "is_set", "is_empty", "gt", "lt"]),
        value: z.union([z.string().max(200), z.number()]).optional(),
      })
      .strict(),
    ports: [
      { name: "true", required: true },
      { name: "false", required: true },
    ],
  },
  "logic.switch": {
    config: z
      .object({
        variable: z.string().min(1).max(80),
        cases: z.array(ValorDeMenu).min(1).max(20),
      })
      .strict(),
    ports: [{ name: "default", required: true }],
    dynamicPorts: (config) =>
      (config as { cases?: string[] }).cases?.map((c) => ({
        name: `case:${c}`,
        required: false,
      })) ?? [],
  },
  "logic.match": {
    config: z
      .object({
        /** Variável comparada; padrão `message.text`. */
        variable: z.string().min(1).max(80).optional(),
        match: ConfigDeCorrespondencia,
      })
      .strict(),
    ports: [
      { name: "matched", required: true },
      { name: "no_match", required: true },
    ],
  },
  "logic.random": {
    config: z
      .object({
        /** Pesos dos ramos; o sorteio usa semente registrada para ser reprodutível. */
        weights: z.array(z.number().int().min(1).max(100)).min(2).max(10),
      })
      .strict(),
    ports: [],
    dynamicPorts: (config) =>
      ((config as { weights?: number[] }).weights ?? []).map((_, i) => ({
        name: `branch:${i}`,
        required: true,
      })),
  },
  "logic.goto": {
    config: z
      .object({
        target: z.string().min(1).max(80),
        /** Quantas vezes a mesma conversa pode passar por este salto antes de seguir por `exhausted`. */
        maxVisits: z.number().int().min(1).max(20),
      })
      .strict(),
    ports: [{ name: "exhausted", required: true }],
  },
  "state.wait_for_reply": {
    config: z
      .object({
        /** Obrigatório: espera sem prazo deixaria a conversa presa. */
        timeoutSeconds: z.number().int().min(10).max(86400),
        maxAttempts: z.number().int().min(1).max(5).optional(),
        /** Onde guardar a resposta (namespace `session`). */
        saveAs: z.string().min(1).max(80).optional(),
      })
      .strict(),
    ports: [
      { name: "reply", required: true },
      { name: "timeout", required: true },
    ],
    suspends: true,
  },
  "data.capture": {
    config: z
      .object({
        variable: z.string().min(1).max(80),
        kind: z.enum(["text", "number", "email", "phone", "date"]),
        maxLength: z.number().int().min(1).max(500).optional(),
      })
      .strict(),
    ports: [
      { name: "valid", required: true },
      { name: "invalid", required: true },
    ],
  },
  "data.set_variable": {
    config: z
      .object({
        variable: z.string().min(1).max(80),
        value: z.union([z.string().max(1000), z.number(), z.boolean()]),
      })
      .strict(),
    ports: [next],
  },
  "time.delay": {
    config: z.object({ seconds: z.number().int().min(1).max(86400) }).strict(),
    ports: [next],
    suspends: true,
  },
  "action.webhook": {
    config: z
      .object({
        /** Só HTTPS; endereços privados são recusados no runtime (proteção SSRF). */
        url: z
          .string()
          .url()
          .max(2000)
          .refine((u) => u.startsWith("https://"), "O webhook precisa usar HTTPS."),
        method: z.enum(["POST", "PUT"]),
        /** Obrigatório: chamada externa sem prazo pode travar a conversa. */
        timeoutMs: z.number().int().min(100).max(10000),
        retries: z.number().int().min(0).max(5).optional(),
      })
      .strict(),
    ports: [
      { name: "success", required: true },
      { name: "failure", required: true },
    ],
  },
  "action.handoff": {
    config: z.object({ note: z.string().max(500).optional() }).strict(),
    ports: [],
    terminal: true,
  },
  "action.end": {
    config: z.object({}).strict(),
    ports: [],
    terminal: true,
  },
} as const satisfies Record<string, EspecDeNo>;

export type TipoDeNo = keyof typeof CATALOGO;

/** Configuração já validada de um tipo de nó. */
export type ConfigDe<T extends TipoDeNo> = z.infer<(typeof CATALOGO)[T]["config"]>;

export type Correspondencia = z.infer<typeof ConfigDeCorrespondencia>;

export const TIPOS_DE_NO = Object.keys(CATALOGO) as TipoDeNo[];

export function ehTipoConhecido(tipo: string): tipo is TipoDeNo {
  return Object.prototype.hasOwnProperty.call(CATALOGO, tipo);
}

/** Portas de saída válidas de um nó, com a configuração já validada. */
export function portasDoNo(tipo: TipoDeNo, config: unknown): Porta[] {
  const espec: EspecDeNo = CATALOGO[tipo];
  return [...espec.ports, ...(espec.dynamicPorts?.(config) ?? [])];
}
