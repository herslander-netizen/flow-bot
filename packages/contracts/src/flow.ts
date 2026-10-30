/**
 * Documento de fluxo `flow-bot/v0`: o contrato entre editor, autoria por IA, simulador e runtime.
 *
 * O schema estrutural aceita qualquer `type` de nó; o tipo e a configuração são conferidos depois contra o
 * catálogo (`validate.ts`), para o erro apontar o nó e o campo exatos.
 */
import { z } from "zod";

export const SCHEMA_VERSION = "flow-bot/v0" as const;

/** Identificador estável: letras, números, `-` e `_`. */
export const Id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, "Use só letras, números, - e _.");

/** Fuso IANA aceito pelo próprio motor de datas (ex.: America/Sao_Paulo). */
export const FusoIana = z.string().refine((fuso) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}, "Fuso horário IANA inválido.");

/** Variáveis declaradas pelo fluxo vivem no namespace `session`. */
export const NomeDeVariavel = z
  .string()
  .regex(/^session\.[A-Za-z][A-Za-z0-9_]{0,59}$/, "Variáveis do fluxo começam com session.");

export const DeclaracaoDeVariavel = z
  .object({
    name: NomeDeVariavel,
    type: z.enum(["string", "number", "boolean", "date"]),
    /** Valor usado quando a variável ainda não foi preenchida. */
    default: z.union([z.string().max(1000), z.number(), z.boolean()]).optional(),
  })
  .strict();

export const PadroesDoFluxo = z
  .object({
    /** Comparação sem acento (padrão: true). Caixa e espaços repetidos são sempre ignorados. */
    ignoreAccents: z.boolean().optional(),
    /** Limiar padrão da similaridade (0,5–1). */
    similarityThreshold: z.number().min(0.5).max(1).optional(),
    /** Atraso padrão das respostas, sorteado entre min e max segundos. */
    delaySeconds: z
      .object({ min: z.number().int().min(0).max(300), max: z.number().int().min(0).max(300) })
      .strict()
      .optional(),
    /** Não repetir o mesmo gatilho para o mesmo contato dentro deste prazo (0 = sem pausa). */
    repeatPauseSeconds: z.number().int().min(0).max(604800).optional(),
  })
  .strict();

export const No = z
  .object({
    id: Id,
    type: z.string().min(1).max(80),
    config: z.record(z.string(), z.unknown()),
    /** Marca um nó propositalmente solto (ex.: alvo só de `logic.goto`). */
    detached: z.boolean().optional(),
  })
  .strict();

export const Aresta = z
  .object({
    id: Id,
    from: Id,
    to: Id,
    port: z.string().min(1).max(60),
  })
  .strict();

export const DocumentoDeFluxo = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    flow: z
      .object({
        id: Id,
        name: z.string().min(1).max(120),
        timezone: FusoIana,
        status: z.enum(["draft", "published"]),
        entryNodeId: Id,
      })
      .strict(),
    limits: z
      .object({
        /** Teto de nós executados por mensagem recebida: corta qualquer loop que escape do validador. */
        maxStepsPerEvent: z.number().int().min(1).max(200),
      })
      .strict(),
    /** Perfil de realidade que o fluxo usa (ex.: `flow/v1`); obrigatório se o fluxo citar `reality.*`. */
    reality: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*\/v[0-9]+$/, "Use o formato sistema/vN, ex.: flow/v1.")
      .optional(),
    /** Padrões do fluxo; cada nó pode sobrescrever o que fizer sentido para ele. */
    defaults: PadroesDoFluxo.optional(),
    variables: z.array(DeclaracaoDeVariavel).max(100).default([]),
    nodes: z.array(No).min(1).max(500),
    edges: z.array(Aresta).max(2000),
  })
  .strict();

export type DocumentoDeFluxo = z.infer<typeof DocumentoDeFluxo>;
export type No = z.infer<typeof No>;
export type Aresta = z.infer<typeof Aresta>;
