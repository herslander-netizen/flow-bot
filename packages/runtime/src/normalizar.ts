/**
 * Normalização para comparar mensagens: caixa, espaços repetidos, emojis e pontuação nunca contam; acentos só
 * contam se o fluxo pedir (`defaults.ignoreAccents: false`).
 */
export function normalizar(texto: string, ignorarAcentos = true): string {
  let t = texto.toLocaleLowerCase("pt-BR");
  if (ignorarAcentos) t = t.normalize("NFD").replace(/\p{M}/gu, "");
  return t
    .replace(/[^\p{L}\p{N}\s*]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
