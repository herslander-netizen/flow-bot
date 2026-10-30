/**
 * Chamadas para fora com proteção: prazo curto, corpo limitado e, para webhooks de fluxo, bloqueio de endereços
 * internos (localhost, redes privadas, link-local, metadados de nuvem) para o fluxo não virar porta de entrada (SSRF).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipPrivado(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return ipPrivado(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** Recusa (com motivo) URL de webhook que não seja HTTPS público. */
export async function motivoDeUrlInsegura(
  url: string,
  resolver: (host: string) => Promise<string[]> = async (h) =>
    (await lookup(h, { all: true })).map((a) => a.address),
): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "url_invalida";
  }
  if (u.protocol !== "https:") return "so_https";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    return "endereco_interno";
  const ips = isIP(host) ? [host] : await resolver(host).catch(() => []);
  if (!ips.length) return "host_nao_resolvido";
  if (ips.some(ipPrivado)) return "endereco_interno";
  return null;
}

export async function chamarJson(
  url: string,
  opcoes: {
    metodo: "GET" | "POST" | "PUT";
    token?: string;
    corpo?: unknown;
    timeoutMs: number;
    fetch?: typeof fetch;
  },
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const chamar = opcoes.fetch ?? fetch;
  const r = await chamar(url, {
    method: opcoes.metodo,
    headers: {
      accept: "application/json",
      ...(opcoes.corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(opcoes.token ? { authorization: `Bearer ${opcoes.token}` } : {}),
    },
    ...(opcoes.corpo !== undefined ? { body: JSON.stringify(opcoes.corpo) } : {}),
    signal: AbortSignal.timeout(opcoes.timeoutMs),
    redirect: "error",
  });
  const texto = (await r.text()).slice(0, 256 * 1024);
  let json: unknown;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json };
}
