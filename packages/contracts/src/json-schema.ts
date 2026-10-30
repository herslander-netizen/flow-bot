/**
 * JSON Schema formal do documento `flow-bot/v0`, gerado do mesmo schema zod que o validador usa (uma fonte só).
 * Cada nó ganha um ramo com a configuração do seu tipo, para editores e ferramentas de IA conhecerem o catálogo.
 */
import { z } from "zod";

import { CATALOGO, TIPOS_DE_NO, type EspecDeNo } from "./catalog.js";
import {
  Aresta,
  DeclaracaoDeVariavel,
  FusoIana,
  Id,
  PadroesDoFluxo,
  SCHEMA_VERSION,
} from "./flow.js";

export function esquemaJsonDoFluxo(): Record<string, unknown> {
  const nos = TIPOS_DE_NO.map((tipo) =>
    z
      .object({
        id: Id,
        type: z.literal(tipo),
        config: (CATALOGO[tipo] as EspecDeNo).config,
        detached: z.boolean().optional(),
      })
      .strict(),
  );
  const documento = z
    .object({
      schemaVersion: z.literal(SCHEMA_VERSION),
      flow: z
        .object({
          id: Id,
          name: z.string().min(1).max(120),
          timezone: FusoIana.describe("Fuso horário IANA, ex.: America/Sao_Paulo"),
          status: z.enum(["draft", "published"]),
          entryNodeId: Id,
        })
        .strict(),
      limits: z.object({ maxStepsPerEvent: z.number().int().min(1).max(200) }).strict(),
      defaults: PadroesDoFluxo.optional(),
      variables: z.array(DeclaracaoDeVariavel).max(100).optional(),
      nodes: z
        .array(z.union(nos as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]))
        .min(1)
        .max(500),
      edges: z.array(Aresta).max(2000),
    })
    .strict();
  return {
    $id: "https://github.com/herslander-netizen/flow-bot/schema/flow-bot-v0.schema.json",
    title: "Flow Bot — documento de fluxo v0",
    description:
      "Estrutura do fluxo. Regras semânticas (alcance, ciclos, portas, variáveis, RegEx segura) são conferidas por validarFluxo().",
    ...z.toJSONSchema(documento, { target: "draft-2020-12", unrepresentable: "any" }),
  };
}
