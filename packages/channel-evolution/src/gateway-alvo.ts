/**
 * Gateway Evolution Alvo: API multi-projeto, autenticada por Bearer.
 * O projeto é determinado no gateway pelo token privado e não pela instancia informada no corpo.
 * idempotency-key é obrigatória e estável para tentativas da mesma ação.
 * "accepted" significa aceitação pelo gateway, NÃO confirmação de entrega ou leitura.
 */
export type ConfigDoGatewayAlvo = {
  url: string;
  token: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export type ResultadoDoGatewayAlvo = {
  ok: boolean;
  id?: string;
  erro?: string;
  incerto?: true;
};

const CHAVE = /^[A-Za-z0-9_.:-]{8,128}$/;

function endereco(cfg: ConfigDoGatewayAlvo, caminho: string): string | null {
  try {
    const url = new URL(cfg.url);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return null;
    return url.origin + url.pathname.replace(/\/+$/, "") + caminho;
  } catch {
    return null;
  }
}

/** Não registra detalhes do upstream; nunca retorna tokens ou payloads nos erros. */
export async function enviarTextoViaGatewayAlvo(
  cfg: ConfigDoGatewayAlvo,
  telefone: string,
  texto: string,
  idempotencyKey: string,
): Promise<ResultadoDoGatewayAlvo> {
  const url = endereco(cfg, "/v1/messages/text");
  if (!url || !cfg.token || cfg.token.length > 128)
    return { ok: false, erro: "gateway_config_invalida" };
  if (!CHAVE.test(idempotencyKey)) return { ok: false, erro: "gateway_chave_invalida" };
  const number = telefone.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(number)) return { ok: false, erro: "gateway_destinatario_invalido" };
  if (!texto.trim()) return { ok: false, erro: "gateway_texto_vazio" };

  try {
    const response = await (cfg.fetch ?? fetch)(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.token}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ number, text: texto }),
      redirect: "error",
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000),
    });
    const resultado = (await response.json().catch(() => null)) as {
      status?: unknown;
      key?: { id?: unknown };
    } | null;
    const status = resultado?.status;
    if ((response.status === 202 || response.status === 200) && status === "accepted") {
      const id = resultado?.key?.id;
      return typeof id === "string" && id.trim() ? { ok: true, id } : { ok: true };
    }
    // O gateway armazena a situação 'unknown' vinculada à MESMA chave.
    // Nunca gerar nova chave para tentar resolver uma resposta inconclusiva.
    if (status === "unknown" || status === "pending") {
      return { ok: false, incerto: true, erro: "gateway_envio_incerto" };
    }
    // 409 sem status 'unknown' pode indicar conexão sem pareamento ou
    // uma chave idempotente reaproveitada com conteúdo diferente.
    if (response.status === 409) return { ok: false, erro: "gateway_conflito_ou_desconectado" };
    if ([400, 401, 403, 404, 405, 413, 415, 422].includes(response.status))
      return { ok: false, erro: `gateway_http_${response.status}` };
    return { ok: false, incerto: true, erro: `gateway_resposta_inconclusiva_${response.status}` };
  } catch (erro) {
    return {
      ok: false,
      incerto: true,
      erro:
        erro instanceof Error && erro.name === "TimeoutError"
          ? "gateway_timeout_incerto"
          : "gateway_rede_incerta",
    };
  }
}

/** Monitor de conexão por projeto: não expõe token ou número. */
export async function consultarConexaoGatewayAlvo(cfg: ConfigDoGatewayAlvo): Promise<{
  ok: boolean;
  state?: "open" | "close" | "connecting" | "unconfigured";
  erro?: string;
}> {
  const url = endereco(cfg, "/v1/connection");
  if (!url || !cfg.token || cfg.token.length > 128)
    return { ok: false, erro: "gateway_config_invalida" };
  try {
    const response = await (cfg.fetch ?? fetch)(url, {
      method: "GET",
      headers: { authorization: `Bearer ${cfg.token}`, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 8000),
    });
    if (!response.ok) return { ok: false, erro: `gateway_http_${response.status}` };
    const data = (await response.json().catch(() => null)) as { state?: unknown } | null;
    const state = data?.state;
    if (state === "open" || state === "close" || state === "connecting") {
      return { ok: true, state };
    }
    if (state === "unconfigured") return { ok: true, state };
    return { ok: false, erro: "gateway_estado_invalido" };
  } catch {
    return { ok: false, erro: "gateway_indisponivel" };
  }
}
