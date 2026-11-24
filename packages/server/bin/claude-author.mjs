#!/usr/bin/env node
// Oficina isolada de autoria: executa SOMENTE quando invocada explicitamente.
// Uso: npm run autor:claude -- briefing.json proposta.json
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import { migrar } from "@flow-bot/store-postgres";
import pg from "pg";

import {
  criarPropostaComClaude,
  reservarPedidoClaude,
  validarEntradaDaOficina,
} from "../dist/claude-gateway.js";

const [inputFile, outputFile] = process.argv.slice(2);
function fail(message) {
  console.error("FlowBot autoria:", message);
  process.exitCode = 1;
}
async function run() {
  if (!inputFile || !outputFile || inputFile === outputFile)
    return fail("uso: npm run autor:claude -- briefing.json proposta.json");
  if (process.env.FLOWBOT_CLAUDE_AUTHORING_ENABLED !== "1")
    return fail(
      "a oficina Claude está desligada. Defina FLOWBOT_CLAUDE_AUTHORING_ENABLED=1 após aprovar orçamento.",
    );
  if (!process.env.ANTHROPIC_API_KEY || !process.env.FLOWBOT_CLAUDE_MODEL)
    return fail("chave da API e modelo devem estar nos segredos do ambiente.");
  if (!process.env.DATABASE_URL)
    return fail("DATABASE_URL do banco isolado do FlowBot é obrigatório para cota/idempotência.");
  const dailyLimit = Number(process.env.FLOWBOT_CLAUDE_DAILY_LIMIT ?? "2");
  const maxOutputTokens = Number(process.env.FLOWBOT_CLAUDE_MAX_OUTPUT_TOKENS ?? "6144");
  if (
    !Number.isInteger(dailyLimit) ||
    dailyLimit < 1 ||
    dailyLimit > 20 ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1024 ||
    maxOutputTokens > 8192
  )
    return fail("limites de chamadas ou tokens inválidos.");
  let inputRaw;
  try {
    inputRaw = JSON.parse(readFileSync(inputFile, "utf8"));
  } catch {
    return fail("não foi possível ler o briefing JSON.");
  }
  const input = validarEntradaDaOficina(inputRaw);
  if (!input) return fail("briefing inválido; revise tamanho, workspace, idempotência e perfil.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    await migrar(pool);
    const reservation = await reservarPedidoClaude(
      pool,
      input.workspaceId,
      input.requestKey,
      dailyLimit,
    );
    if (reservation === "duplicate")
      return fail(
        "pedido já executado ou incerto. Não repetir com nova chave sem verificar o custo.",
      );
    if (reservation === "limit")
      return fail("quota diária de autoria atingida para este estabelecimento.");
    const result = await criarPropostaComClaude(
      {
        enabled: true,
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.FLOWBOT_CLAUDE_MODEL,
        dailyLimit,
        maxOutputTokens,
      },
      input,
    );
    if (!result.ok) return fail(result.error);
    // O arquivo de saída é só uma proposta. Nunca invoca publicar,
    // Evolution, execução de agentes remotos nem banco de fluxo publicado.
    writeFileSync(
      outputFile,
      JSON.stringify(
        {
          workspaceId: input.workspaceId,
          requestKey: input.requestKey,
          ...result.proposal,
        },
        null,
        2,
      ) + "\n",
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        result: result.proposal.status,
        tests: result.proposal.tests.length,
        failures: result.proposal.problems.length,
        approved: false,
        published: false,
        outputFile,
      }),
    );
  } catch {
    // Não imprime stack trace contendo dados do provedor ou dados pessoais.
    fail(
      "falha na oficina, banco ou arquivo de saída. Verifique o ambiente e o status da solicitação.",
    );
  } finally {
    await pool.end();
  }
}
await run();
