/**
 * Envio pela Evolution API v2: `POST {url}/message/sendText/{instância}` com o cabeçalho `apikey`. O menu sai como
 * lista numerada (funciona em qualquer WhatsApp; botões interativos não são confiáveis fora da API oficial).
 */
import type { Acao } from "@flow-bot/runtime";

export type ConfigDaEvolution = {
  /** Endereço da sua Evolution, sem barra no fim (ex.: https://evolution.meudominio.com). */
  url: string;
  apiKey: string;
  timeoutMs?: number;
  /** Injetável nos testes. */
  fetch?: typeof fetch;
};

export type ResultadoDoEnvio = { ok: boolean; id?: string; erro?: string; incerto?: true };

/** Texto que o cliente vê para uma ação de mensagem; `null` = ação que não vai para o cliente. */
export function textoParaOCliente(acao: Acao): string | null {
  if (acao.type === "send_text") return acao.text;
  if (acao.type === "send_quick_replies")
    return [acao.text, ...acao.options.map((o) => `${o.value}. ${o.label}`)].join("\n");
  return null;
}

export async function enviarTexto(
  cfg: ConfigDaEvolution,
  instancia: string,
  telefone: string,
  texto: string,
): Promise<ResultadoDoEnvio> {
  const chamar = cfg.fetch ?? fetch;
  try {
    const r = await chamar(
      `${cfg.url.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(instancia)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", apikey: cfg.apiKey },
        body: JSON.stringify({ number: telefone.replace(/\D/g, ""), text: texto }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
        redirect: "error",
      },
    );
    if (!r.ok) {
      // Só rejeições explícitas anteriores ao envio são tratadas como falha conhecida.
      if ([400, 401, 403, 404, 405, 413, 415, 422].includes(r.status)) {
        return { ok: false, erro: `evolution_http_${r.status}` };
      }
      return { ok: false, incerto: true, erro: `evolution_incerto_http_${r.status}` };
    }
    const json = (await r.json().catch(() => null)) as { key?: { id?: unknown } } | null;
    const id = json?.key?.id;
    return typeof id === "string" && id.trim()
      ? { ok: true, id }
      : { ok: false, incerto: true, erro: "evolution_incerto_sem_id" };
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    return {
      ok: false,
      incerto: true,
      erro: nome === "TimeoutError" ? "evolution_incerto_timeout" : "evolution_incerto_rede",
    };
  }
}

/**
 * Aponta o webhook de uma instância da Evolution para o Flow Bot, com o segredo no cabeçalho (nunca na URL).
 * Eventos: mensagens e estado da conexão.
 */
export async function configurarWebhook(
  cfg: ConfigDaEvolution,
  instancia: string,
  urlDoFlowBot: string,
  segredo: string,
): Promise<ResultadoDoEnvio> {
  const chamar = cfg.fetch ?? fetch;
  try {
    const r = await chamar(
      `${cfg.url.replace(/\/+$/, "")}/webhook/set/${encodeURIComponent(instancia)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", apikey: cfg.apiKey },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: urlDoFlowBot,
            byEvents: false,
            base64: false,
            headers: { "x-webhook-secret": segredo },
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          },
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
      },
    );
    return r.ok ? { ok: true } : { ok: false, erro: `evolution_http_${r.status}` };
  } catch (erro) {
    return { ok: false, erro: `evolution_rede: ${String(erro)}` };
  }
}
