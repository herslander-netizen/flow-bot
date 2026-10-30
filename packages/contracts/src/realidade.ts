/**
 * Perfil de realidade: o que é verdade agora no sistema que hospeda o Flow Bot (nome do negócio, se está aberto,
 * serviços e preços, próximo horário livre…). O fluxo lê esses fatos pelo namespace `reality.*` e nunca os inventa;
 * o sistema hospedeiro entrega um retrato atualizado a cada evento.
 *
 * Cada sistema publica o seu perfil (ex.: `flow/v1`). Trocar de sistema = trocar de perfil, com o mesmo motor.
 */
import { z } from "zod";

export const NomeDeRealidade = z
  .string()
  .regex(/^reality\.[A-Za-z][A-Za-z0-9_]{0,59}$/, "Fatos da realidade começam com reality.");

export const TipoDeFato = z.enum(["string", "number", "boolean", "list"]);

export const PerfilDeRealidade = z
  .object({
    /** Identificador com versão, ex.: `flow/v1`. */
    id: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*\/v[0-9]+$/, "Use o formato sistema/vN, ex.: flow/v1."),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    facts: z
      .array(
        z
          .object({
            name: NomeDeRealidade,
            type: TipoDeFato,
            description: z.string().min(1).max(300),
            /** Exemplo para editores, autoria por IA e simulador. */
            example: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export type PerfilDeRealidade = z.infer<typeof PerfilDeRealidade>;

/** Valor de um fato no retrato entregue pelo hospedeiro. */
export type ValorDeFato = string | number | boolean | string[];
export type Realidade = Record<string, ValorDeFato>;

/** Retrato de exemplo do perfil (útil no simulador e na autoria). */
export function realidadeDeExemplo(perfil: PerfilDeRealidade): Realidade {
  return Object.fromEntries(perfil.facts.map((f) => [f.name, f.example]));
}
