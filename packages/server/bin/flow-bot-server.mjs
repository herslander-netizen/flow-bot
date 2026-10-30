#!/usr/bin/env node
// Flow Bot — serviço de automação do WhatsApp (Evolution) para o Flow ou qualquer outro sistema.
//
//   flow-bot-server iniciar                               sobe o servidor e os laços
//   flow-bot-server migrar                                cria/atualiza o schema flow_bot
//   flow-bot-server publicar <workspace> <fluxo.json> [perfil.json]
//   flow-bot-server perguntas <workspace>                 perguntas sem resposta (aprendizado)
//   flow-bot-server ligar-webhook <instância> <url pública do Flow Bot>   aponta a Evolution para o Flow Bot
//
// Ambiente: DATABASE_URL, EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET (32+ caracteres),
// FLOW_BOT_WORKSPACES (caminho do arquivo JSON), FLOW_BOT_SEGREDO (aprendizado), PORT, FLOW_BOT_RETENCAO_DIAS.
import { readFileSync } from "node:fs";
import process from "node:process";

import { configurarWebhook } from "@flow-bot/channel-evolution";
import { PerfilDeRealidade } from "@flow-bot/contracts";
import { FlowBot, migrar } from "@flow-bot/store-postgres";
import pg from "pg";

import {
  adaptadorDeSaida,
  carregarConfig,
  criarServidor,
  iniciarLacos,
  realidadeDoSistema,
} from "../dist/index.js";

const [comando, ...args] = process.argv.slice(2);
const json = (caminho) => JSON.parse(readFileSync(caminho, "utf8"));
const registro = (evento, dados = {}) =>
  console.log(JSON.stringify({ em: new Date().toISOString(), evento, ...dados }));

async function principal() {
  if (comando === "ligar-webhook") {
    const [instancia, base] = args;
    const { EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET } = process.env;
    if (!instancia || !base || !EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_WEBHOOK_SECRET)
      throw new Error(
        "Uso: ligar-webhook <instância> <url pública> (com EVOLUTION_URL, EVOLUTION_API_KEY e EVOLUTION_WEBHOOK_SECRET)",
      );
    const r = await configurarWebhook(
      { url: EVOLUTION_URL, apiKey: EVOLUTION_API_KEY },
      instancia,
      `${base.replace(/\/+$/, "")}/webhooks/evolution`,
      EVOLUTION_WEBHOOK_SECRET,
    );
    if (!r.ok) throw new Error(`A Evolution recusou: ${r.erro}`);
    return registro("webhook_ligado", { instancia });
  }
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  try {
    if (comando === "migrar") return registro("migrado", { aplicadas: await migrar(pool) });
    if (comando === "publicar") {
      const [workspace, fluxo, perfil] = args;
      if (!workspace || !fluxo)
        throw new Error("Uso: publicar <workspace> <fluxo.json> [perfil.json]");
      const bot = new FlowBot({
        pool,
        ...(perfil ? { perfis: [PerfilDeRealidade.parse(json(perfil))] } : {}),
      });
      await migrar(pool);
      return registro("publicado", { workspace, ...(await bot.publicar(workspace, json(fluxo))) });
    }
    if (comando === "perguntas") {
      const [workspace] = args;
      if (!workspace) throw new Error("Uso: perguntas <workspace>");
      for (const p of await new FlowBot({ pool }).perguntasSemResposta(workspace))
        console.log(`${String(p.contacts).padStart(4)} pessoas  ${p.kind.padEnd(18)} ${p.phrase}`);
      return;
    }
    if (comando !== "iniciar")
      throw new Error("Comandos: iniciar | migrar | publicar | perguntas | ligar-webhook");

    const arquivo = process.env.FLOW_BOT_WORKSPACES;
    if (!arquivo) throw new Error("Defina FLOW_BOT_WORKSPACES (arquivo JSON com os negócios).");
    const cfg = carregarConfig(process.env, json(arquivo));
    await migrar(pool);
    const bot = new FlowBot({
      pool,
      realidade: realidadeDoSistema(cfg),
      diasDeRetencao: cfg.diasDeRetencao,
      ...(cfg.segredoDoAprendizado ? { segredoDoAprendizado: cfg.segredoDoAprendizado } : {}),
    });
    const adaptador = adaptadorDeSaida(cfg);
    const servidor = criarServidor({ cfg, bot, pool, adaptador, registro });
    const parar = iniciarLacos({ cfg, bot, adaptador, registro });
    servidor.listen(cfg.porta, () =>
      registro("no_ar", { porta: cfg.porta, workspaces: cfg.workspaces.length }),
    );
    const desligar = () => {
      parar();
      servidor.close(() => void pool.end().then(() => process.exit(0)));
    };
    process.on("SIGTERM", desligar);
    process.on("SIGINT", desligar);
    await new Promise(() => undefined);
  } finally {
    if (comando !== "iniciar") await pool.end();
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
