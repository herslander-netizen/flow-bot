#!/usr/bin/env node
/**
 * Revisor offline de proposta de fluxo. Nunca chama Claude, Evolution, banco
 * ou publicador. Requer cenários INDEPENDENTES definidos pelo operador.
 *
 * Uso: npm run autor:revisar -- proposta.json revisao.json relatorio.json workspaceId [perfil.json]
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { revisarPropostaDosAgentes } from "../dist/claude-gateway.js";

const [propostaPath, revisaoPath, relatorioPath, expectedWorkspace, perfilPath] = process.argv.slice(2);
const MAX_BYTES = 2 * 1024 * 1024;

function fail(code, reason) {
  console.error("FlowBot revisão:", reason);
  process.exitCode = code;
}

function readJson(path) {
  if (statSync(path).size > MAX_BYTES) throw new Error("arquivo_grande");
  return JSON.parse(readFileSync(path, "utf8"));
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function main() {
  if (!propostaPath || !revisaoPath || !relatorioPath || !expectedWorkspace)
    return fail(1, "uso: autor:revisar proposta.json revisao.json relatorio.json workspaceId [perfil.json]");
  const paths = [propostaPath, revisaoPath, relatorioPath, ...(perfilPath ? [perfilPath] : [])].map(resolve);
  if (new Set(paths).size !== paths.length)
    return fail(1, "arquivos de origem e relatório precisam ser distintos.");
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(expectedWorkspace))
    return fail(1, "workspace inválido.");

  let original;
  let regression;
  let perfil;
  try {
    original = readJson(propostaPath);
    regression = readJson(revisaoPath);
    if (perfilPath) perfil = readJson(perfilPath);
  } catch {
    return fail(1, "não foi possível ler a proposta, os cenários independentes ou o perfil.");
  }

  // Identidade verificada antes da avaliação; flags do arquivo são ignoradas.
  if (!object(original) || original.workspaceId !== expectedWorkspace)
    return fail(1, "proposta pertence a outro workspace ou não possui identificação.");
  if (!object(regression) || !Array.isArray(regression.scenarios))
    return fail(1, "arquivo de cenários independentes inválido.");
  const flow = original.flow ?? null;
  const scenarios = original.scenarios ?? null;
  const gaps = original.gaps;
  const raw = {
    flow_json: JSON.stringify(flow),
    scenarios_json: JSON.stringify(scenarios),
    gaps,
  };
  const reviewed = revisarPropostaDosAgentes(raw, perfil, undefined, regression);
  // Hash identifica EXATAMENTE o conteúdo revisado para auditoria posterior,
  // não é assinatura, autorização nem credencial de publicação.
  const digest = createHash("sha256")
    .update(JSON.stringify({ workspaceId: expectedWorkspace, flow, scenarios, gaps, regression, perfil: perfil ?? null }))
    .digest("hex");
  const output = {
    workspaceId: expectedWorkspace,
    sourceSha256: digest,
    ...reviewed,
    approved: false,
    published: false,
  };
  try {
    writeFileSync(relatorioPath, JSON.stringify(output, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch {
    return fail(1, "não foi possível gravar o relatório sem sobrescrever arquivo.");
  }
  console.log(JSON.stringify({
    workspaceId: expectedWorkspace,
    sourceSha256: digest,
    status: reviewed.status,
    testsFromClaude: reviewed.tests.length,
    independentTests: reviewed.independentTests.length,
    problems: reviewed.problems.length,
    approved: false,
    published: false,
  }));
  if (reviewed.status !== "ready_for_review")
    process.exitCode = 2;
}

main();
