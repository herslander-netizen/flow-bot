/**
 * As duas ligações com o sistema dono do negócio (Flow ou qualquer outro) e a saída pela Evolution:
 * - realidade: GET `realityUrl?workspace=…&conversation=…` → `{ "reality.x": valor }`;
 * - encaminhamento: POST `handoffUrl` → `{ workspaceId, conversationKey, note }`;
 * - mensagens ao cliente: Evolution; webhooks de fluxo: só HTTPS público.
 */
import { enviarTexto, textoParaOCliente } from "@flow-bot/channel-evolution";
import type { Realidade } from "@flow-bot/contracts";
import type { AdaptadorDeSaida } from "@flow-bot/store-postgres";

import type { ConfigDoServidor, ConfigDoWorkspace } from "./config.js";
import { chamarJson, motivoDeUrlInsegura } from "./rede.js";

export type Dependencias = { fetch?: typeof fetch; resolver?: (host: string) => Promise<string[]> };

/** Aceita só fatos `reality.*` com valores simples; o resto é descartado (o fluxo registra o que faltar). */
export function filtrarRealidade(json: unknown): Realidade {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const saida: Realidade = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (!/^reality\.[A-Za-z][A-Za-z0-9_]{0,59}$/.test(k)) continue;
    if (typeof v === "string") saida[k] = v.slice(0, 4000);
    else if (typeof v === "number" && Number.isFinite(v)) saida[k] = v;
    else if (typeof v === "boolean") saida[k] = v;
    else if (Array.isArray(v) && v.every((i) => typeof i === "string"))
      saida[k] = v.slice(0, 50).map((i) => (i as string).slice(0, 300));
  }
  return saida;
}

export function realidadeDoSistema(cfg: ConfigDoServidor, deps: Dependencias = {}) {
  const porId = new Map(cfg.workspaces.map((w) => [w.id, w]));
  return async ({
    workspaceId,
    conversationKey,
  }: {
    workspaceId: string;
    conversationKey: string;
  }) => {
    const w = porId.get(workspaceId);
    if (!w?.realityUrl) return {};
    const url = new URL(w.realityUrl);
    url.searchParams.set("workspace", workspaceId);
    url.searchParams.set("conversation", conversationKey);
    try {
      const token = cfg.tokens.get(workspaceId);
      const r = await chamarJson(url.toString(), {
        metodo: "GET",
        timeoutMs: 2500,
        ...(token ? { token } : {}),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
      // Sistema fora do ar: o fluxo segue sem os fatos e o histórico registra quais faltaram.
      return r.ok ? filtrarRealidade(r.json) : {};
    } catch {
      return {};
    }
  };
}

export function adaptadorDeSaida(cfg: ConfigDoServidor, deps: Dependencias = {}): AdaptadorDeSaida {
  const porId = new Map<string, ConfigDoWorkspace>(cfg.workspaces.map((w) => [w.id, w]));
  return async ({ workspaceId, conversationKey, acao }) => {
    const w = porId.get(workspaceId);
    if (!w) return { ok: false, erro: "workspace_sem_configuracao" };
    const token = cfg.tokens.get(workspaceId);
    const texto = textoParaOCliente(acao);
    if (texto !== null)
      return enviarTexto(
        {
          url: cfg.evolution.url,
          apiKey: cfg.evolution.apiKey,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        },
        w.instance,
        conversationKey,
        texto,
      );
    if (acao.type === "handoff") {
      if (!w.handoffUrl) return { ok: true };
      try {
        const r = await chamarJson(w.handoffUrl, {
          metodo: "POST",
          timeoutMs: 5000,
          corpo: { workspaceId, conversationKey, note: acao.note ?? null },
          ...(token ? { token } : {}),
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        });
        return r.ok ? { ok: true } : { ok: false, erro: `handoff_http_${r.status}` };
      } catch (erro) {
        return { ok: false, erro: `handoff_rede: ${String(erro)}` };
      }
    }
    if (acao.type === "webhook") {
      const motivo = await motivoDeUrlInsegura(acao.url, deps.resolver);
      if (motivo) return { ok: false, erro: `webhook_recusado: ${motivo}` };
      try {
        const r = await chamarJson(acao.url, {
          metodo: acao.method,
          timeoutMs: acao.timeoutMs,
          corpo: { workspaceId, conversationKey, nodeId: acao.nodeId },
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        });
        return r.ok ? { ok: true } : { ok: false, erro: `webhook_http_${r.status}` };
      } catch (erro) {
        return { ok: false, erro: `webhook_rede: ${String(erro)}` };
      }
    }
    return { ok: true };
  };
}
