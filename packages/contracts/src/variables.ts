/**
 * Variáveis em textos: `{{namespace.nome}}`. Só substituição de valor, nunca expressão ou código.
 *
 * Namespaces do sistema (preenchidos pelo runtime): `contact`, `conversation`, `message`.
 * Namespace do fluxo: `session`, que precisa ser declarado em `variables` (ou gravado por um nó).
 * Namespace da realidade: `reality`, só leitura, com os fatos do perfil declarado no fluxo (`realidade.ts`).
 */
export const VARIAVEIS_DO_SISTEMA = [
  "contact.firstName",
  "contact.name",
  "conversation.messageCount",
  "message.text",
] as const;

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;
const NOME_VALIDO =
  /^(?:contact|conversation|message|session|reality)\.[A-Za-z][A-Za-z0-9_]{0,59}$/;

/** Placeholders de um texto, na ordem em que aparecem. */
export function placeholdersDoTexto(texto: string): string[] {
  return [...texto.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "");
}

export function nomeDeVariavelValido(nome: string): boolean {
  return NOME_VALIDO.test(nome);
}

export function ehVariavelDoSistema(nome: string): boolean {
  return (VARIAVEIS_DO_SISTEMA as readonly string[]).includes(nome);
}
