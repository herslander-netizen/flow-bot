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

export type ResultadoDoEnvio = { ok: boolean; id?: string; erro?: string };

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
      },
    );
    if (!r.ok) {
      const corpo = await r.text().catch(() => "");
      return {
        ok: false,
        erro: `evolution_http_${r.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}`,
      };
    }
    const json = (await r.json().catch(() => ({}))) as { key?: { id?: unknown } };
    const id = typeof json.key?.id === "string" ? json.key.id : undefined;
    return id ? { ok: true, id } : { ok: true };
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    return {
      ok: false,
      erro: nome === "TimeoutError" ? "evolution_timeout" : `evolution_rede: ${String(erro)}`,
    };
  }
}
