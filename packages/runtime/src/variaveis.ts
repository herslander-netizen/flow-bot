/**
 * Preenche `{{namespace.nome}}` com valores do contexto. Só substitui texto: nunca avalia expressão. Variável sem
 * valor usa o padrão declarado no fluxo, senão vira vazio.
 */
import type { Realidade, ValorDeFato } from "@flow-bot/contracts";

import type { Plano } from "./plano.js";
import type { Contato, Sessao } from "./sessao.js";

export type Contexto = {
  sessao: Sessao;
  contato: Contato;
  textoDaMensagem: string;
  /** Retrato dos fatos do sistema hospedeiro neste evento. */
  realidade: Realidade;
  /** Fatos citados pelo fluxo que o hospedeiro não entregou (para o rastro). */
  faltando: Set<string>;
};

export function valorDaVariavel(
  nome: string,
  plano: Plano,
  ctx: Contexto,
): ValorDeFato | undefined {
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
  if (nome.startsWith("reality.")) {
    if (nome in ctx.realidade) return ctx.realidade[nome];
    ctx.faltando.add(nome);
    return undefined;
  }
  if (nome in ctx.sessao.variaveis) return ctx.sessao.variaveis[nome];
  return plano.doc.variables.find((v) => v.name === nome)?.default;
}

export function preencher(texto: string, plano: Plano, ctx: Contexto): string {
  return (
    texto
      .replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_, nome: string) => {
        const v = valorDaVariavel(nome, plano, ctx);
        if (v === undefined) return "";
        // Lista vira uma linha por item: "• Corte — R$ 45,00".
        if (Array.isArray(v)) return v.length ? `\n${v.map((i) => `• ${i}`).join("\n")}` : "";
        return String(v);
      })
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      // Variável vazia não deixa pontuação solta: "Olá, {{contact.firstName}}!" sem nome vira "Olá!".
      .replace(/[ \t]*,[ \t]*(?=[!?.,;:])/g, "")
      .replace(/[ \t]+(?=[!?.,;:])/g, "")
      .trim()
  );
}
