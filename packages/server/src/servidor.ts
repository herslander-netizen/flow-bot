/**
 * Servidor HTTP do Flow Bot (só `node:http`, sem framework):
 * - `POST /webhooks/evolution`: aviso da Evolution, autenticado pelo segredo (cabeçalho `x-webhook-secret` ou
 *   `apikey`, comparado em tempo constante); corpo até 1 MB; negócio sempre pela instância, nunca pelo corpo;
 * - `POST /workspaces/:id/conversations/:key/resume`: retomada autenticada por credencial do workspace;
 * - `GET /health`: banco respondendo.
 * Os laços de prazos, entregas e limpeza rodam no mesmo processo (`iniciarLacos`).
 */
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { lerAvisoDaEvolution } from "@flow-bot/channel-evolution";
import type { AdaptadorDeSaida, FlowBot } from "@flow-bot/store-postgres";
import type pg from "pg";

import type { ConfigDoServidor } from "./config.js";

const CORPO_MAXIMO = 1024 * 1024;

function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function responder(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req: IncomingMessage): Promise<string | null> {
  let tamanho = 0;
  const partes: Buffer[] = [];
  for await (const parte of req) {
    tamanho += (parte as Buffer).length;
    if (tamanho > CORPO_MAXIMO) return null;
    partes.push(parte as Buffer);
  }
  return Buffer.concat(partes).toString("utf8");
}

export type Registro = (evento: string, dados?: Record<string, unknown>) => void;

export function criarServidor(p: {
  cfg: ConfigDoServidor;
  bot: FlowBot;
  pool: pg.Pool;
  adaptador: AdaptadorDeSaida;
  registro?: Registro;
}): Server {
  const log: Registro = p.registro ?? (() => undefined);
  const porInstancia = new Map(p.cfg.workspaces.map((w) => [w.instance, w]));

  return createServer(async (req, res) => {
    try {
      const caminho = new URL(req.url ?? "/", "http://local").pathname;
      if (req.method === "GET" && caminho === "/health") {
        await p.pool.query("SELECT 1");
        return responder(res, 200, { ok: true });
      }

      const rotaRetomada = caminho.match(
        /^\/workspaces\/([^/]+)\/conversations\/([^/]+)\/resume$/,
      );
      if (req.method === "POST" && rotaRetomada) {
        let workspaceId: string;
        let conversationKey: string;
        try {
          workspaceId = decodeURIComponent(rotaRetomada[1] ?? "");
          conversationKey = decodeURIComponent(rotaRetomada[2] ?? "");
        } catch {
          return responder(res, 400, { erro: "caminho_invalido" });
        }
        if (
          !workspaceId ||
          workspaceId.length > 120 ||
          workspaceId.includes("/") ||
          !conversationKey ||
          conversationKey.length > 200 ||
          conversationKey.includes("/")
        )
          return responder(res, 400, { erro: "caminho_invalido" });
        const token = p.cfg.resumeTokens.get(workspaceId);
        if (!token) return responder(res, 404, { erro: "nao_encontrado" });
        const header = String(req.headers.authorization ?? "");
        const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (!recebido || !igual(recebido, token))
          return responder(res, 401, { erro: "nao_autorizado" });
        const retomada = await p.bot.retomarAtendimento(workspaceId, conversationKey);
        return responder(res, 200, { ok: true, retomada });
      }

      if (req.method !== "POST" || caminho !== "/webhooks/evolution")
        return responder(res, 404, { erro: "nao_encontrado" });

      const segredo = String(req.headers["x-webhook-secret"] ?? req.headers["apikey"] ?? "");
      if (!segredo || !igual(segredo, p.cfg.evolution.webhookSecret)) {
        log("webhook_recusado", { motivo: "segredo" });
        return responder(res, 401, { erro: "nao_autorizado" });
      }
      const texto = await lerCorpo(req);
      if (texto === null) return responder(res, 413, { erro: "corpo_grande_demais" });
      let corpo: unknown;
      try {
        corpo = JSON.parse(texto);
      } catch {
        return responder(res, 400, { erro: "json_invalido" });
      }

      const aviso = lerAvisoDaEvolution(corpo);
      if (aviso.tipo === "ignorado")
        return responder(res, 200, { ok: true, ignorado: aviso.motivo });
      const w = porInstancia.get(aviso.instancia);
      // Instância sem negócio configurado: 200 para a Evolution não reenviar sem fim; fica no registro.
      if (!w) {
        log("instancia_desconhecida", { instancia: aviso.instancia });
        return responder(res, 200, { ok: true, ignorado: "instancia_desconhecida" });
      }
      if (aviso.tipo === "conexao") {
        log("conexao", { workspace: w.id, estado: aviso.estado });
        return responder(res, 200, { ok: true });
      }

      const r = await p.bot.receberMensagem({
        workspaceId: w.id,
        conversationKey: aviso.telefone,
        flowId: w.flowId,
        eventKey: `evolution:${aviso.instancia}:${aviso.id}`,
        text: aviso.texto,
        ...(aviso.nome ? { contact: { name: aviso.nome } } : {}),
      });
      responder(res, 200, {
        ok: true,
        ...(r.duplicado ? { duplicado: true } : { motivo: r.motivo }),
      });
      // Resposta sai logo, sem esperar o próximo ciclo do laço (o laço cobre qualquer falha).
      void p.bot
        .entregarPendentes(p.adaptador, { workspaceId: w.id, limite: 20 })
        .then(() => p.bot.processarResultadosWebhook({ workspaceId: w.id }))
        .catch(() => undefined);
    } catch (erro) {
      log("erro", { mensagem: erro instanceof Error ? erro.message : String(erro) });
      if (!res.headersSent) responder(res, 500, { erro: "interno" });
    }
  });
}

/** Laços de prazos e entregas (a cada `intervaloMs`) e limpeza diária. Devolve a função que para tudo. */
export function iniciarLacos(p: {
  cfg: ConfigDoServidor;
  bot: FlowBot;
  adaptador: AdaptadorDeSaida;
  registro?: Registro;
}): () => void {
  const log: Registro = p.registro ?? (() => undefined);
  let rodando = false;
  const ciclo = setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try {
      await p.bot.processarVencidos();
      await p.bot.entregarPendentes(p.adaptador);
      await p.bot.processarResultadosWebhook();
    } catch (erro) {
      log("erro_no_laco", { mensagem: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      rodando = false;
    }
  }, p.cfg.intervaloMs);
  const limpeza = setInterval(
    () =>
      void p.bot
        .limparAntigos()
        .then((r) => log("limpeza", r))
        .catch(() => undefined),
    24 * 60 * 60 * 1000,
  );
  return () => {
    clearInterval(ciclo);
    clearInterval(limpeza);
  };
}
