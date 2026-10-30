/**
 * Preenche `{{namespace.nome}}` com valores do contexto. Só substitui texto: nunca avalia expressão. Variável sem
 * valor usa o padrão declarado no fluxo, senão vira vazio.
 */
import type { Plano } from "./plano.js";
import type { Contato, Sessao, Valor } from "./sessao.js";

export type Contexto = { sessao: Sessao; contato: Contato; textoDaMensagem: string };

export function valorDaVariavel(nome: string, plano: Plano, ctx: Contexto): Valor | undefined {
  switch (nome) {
    case "contact.firstName":
      return ctx.contato.firstName ?? ctx.contato.name?.split(/\s+/)[0];
    case "contact.name":
      return ctx.contato.name;
    case "conversation.messageCount":
      return ctx.sessao.mensagens;
    case "message.text":
      return ctx.textoDaMensagem;
  }
  if (nome in ctx.sessao.variaveis) return ctx.sessao.variaveis[nome];
  return plano.doc.variables.find((v) => v.name === nome)?.default;
}

export function preencher(texto: string, plano: Plano, ctx: Contexto): string {
  return texto
    .replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_, nome: string) => {
      const v = valorDaVariavel(nome, plano, ctx);
      return v === undefined ? "" : String(v);
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
