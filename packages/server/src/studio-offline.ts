import { isDeepStrictEqual } from "node:util";

import { PerfilDeRealidade, realidadeDeExemplo, validarFluxo } from "@flow-bot/contracts";
import { ArquivoDeCenarios, compilar, simular } from "@flow-bot/runtime";

type Mudanca = { path: string; before: unknown; after: unknown };

function objeto(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapar(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** JSON Pointer; arrays remain ordered because order may affect execution. */
function comparar(before: unknown, after: unknown, path = ""): Mudanca[] {
  if (isDeepStrictEqual(before, after)) return [];
  if (objeto(before) && objeto(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) =>
      comparar(
        Object.hasOwn(before, key) ? before[key] : undefined,
        Object.hasOwn(after, key) ? after[key] : undefined,
        path + "/" + escapar(key),
      ),
    );
  }
  return [{ path, before: before ?? null, after: after ?? null }];
}

/**
 * Offline bridge for Bot Studio. No persistence, identity authorization, channel,
 * provider or publisher. The caller must supply authenticated workspace context
 * before exposing this function over HTTP.
 */
export function avaliarRascunhoStudio(input: unknown) {
  const flags = { approved: false, published: false, mode: "offline" } as const;
  if (!objeto(input)) return { ...flags, ok: false, error: "entrada_invalida" };
  const perfil =
    input["perfil"] === undefined ? null : PerfilDeRealidade.safeParse(input["perfil"]);
  if (perfil && !perfil.success) return { ...flags, ok: false, error: "perfil_invalido" };
  const options = perfil?.success ? { perfis: [perfil.data] } : {};
  const result = validarFluxo(input["draft"], options);
  if (!result.ok)
    return { ...flags, ok: false, error: "fluxo_invalido", problems: result.problems };
  if (result.flow.flow.status !== "draft")
    return { ...flags, ok: false, error: "somente_rascunho" };

  let diff: Mudanca[] | null = null;
  if (input["base"] !== undefined) {
    const base = validarFluxo(input["base"], options);
    if (!base.ok || base.flow.flow.id !== result.flow.flow.id)
      return { ...flags, ok: false, error: "base_invalida" };
    diff = comparar(base.flow, result.flow);
  }

  const scenarios = ArquivoDeCenarios.safeParse(input["scenarios"]);
  if (
    !scenarios.success ||
    scenarios.data.scenarios.length > 20 ||
    scenarios.data.scenarios.some((scenario) => scenario.steps.length > 20)
  )
    return { ...flags, ok: false, error: "cenarios_invalidos" };
  try {
    const plan = compilar(result.flow, options);
    const realidade = perfil?.success ? realidadeDeExemplo(perfil.data) : {};
    const reports = scenarios.data.scenarios.map((scenario) =>
      simular(plan, scenario, { realidade }),
    );
    return {
      ...flags,
      ok: true,
      problems: [],
      diff,
      reports,
      scenariosPassed: reports.every((report) => report.ok),
    };
  } catch {
    return { ...flags, ok: false, error: "simulacao_falhou" };
  }
}
