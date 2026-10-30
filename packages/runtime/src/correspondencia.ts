/**
 * Correspondência determinística entre a mensagem e os termos de uma regra. Nenhum modo usa modelo de linguagem.
 * A RegEx chega aqui já aprovada pelo validador (subconjunto seguro); mesmo assim a entrada é cortada em 500
 * caracteres.
 */
import type { Correspondencia } from "@flow-bot/contracts";

import { normalizar } from "./normalizar.js";

export type ResultadoDaCorrespondencia = {
  casou: boolean;
  /** Termo que casou (ou o mais próximo, na similaridade). */
  termo?: string;
  /** Só na similaridade: 0–1. */
  pontuacao?: number;
  /** Grupos capturados pela RegEx. */
  capturas?: string[];
  motivo: string;
};

const ENTRADA_MAXIMA = 500;

/** Curinga `*` sem RegEx: casamento guloso com retrocesso linear (o clássico de wildcard). */
export function casarCuringa(padrao: string, texto: string): boolean {
  let p = 0;
  let t = 0;
  let estrela = -1;
  let marca = 0;
  while (t < texto.length) {
    if (p < padrao.length && padrao[p] !== "*" && padrao[p] === texto[t]) {
      p++;
      t++;
    } else if (p < padrao.length && padrao[p] === "*") {
      estrela = p++;
      marca = t;
    } else if (estrela !== -1) {
      p = estrela + 1;
      t = ++marca;
    } else return false;
  }
  while (p < padrao.length && padrao[p] === "*") p++;
  return p === padrao.length;
}

/** Coeficiente de Dice sobre bigramas (0–1). Textos de uma letra só comparam por igualdade. */
export function similaridade(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramas = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ba = bigramas(a);
  const bb = bigramas(b);
  let comuns = 0;
  for (const [g, n] of ba) comuns += Math.min(n, bb.get(g) ?? 0);
  return (2 * comuns) / (a.length - 1 + (b.length - 1));
}

export function corresponder(
  match: Correspondencia,
  textoBruto: string,
  opcoes: { ignorarAcentos?: boolean; limiarPadrao?: number } = {},
): ResultadoDaCorrespondencia {
  const bruto = textoBruto.slice(0, ENTRADA_MAXIMA);
  const ignorar = opcoes.ignorarAcentos ?? true;
  const texto = normalizar(bruto, ignorar);
  const norm = (s: string) => normalizar(s, ignorar);

  const excecao = match.exclude?.find((e) => {
    const n = norm(e);
    return n !== "" && texto.includes(n);
  });
  if (excecao !== undefined) return { casou: false, termo: excecao, motivo: "excecao" };

  switch (match.mode) {
    case "exact": {
      const termo = match.values.find((v) => norm(v) === texto);
      return termo !== undefined
        ? { casou: true, termo, motivo: "exato" }
        : { casou: false, motivo: "sem_correspondencia" };
    }
    case "contains":
    case "starts_with":
    case "ends_with": {
      const termo = match.values.find((v) => {
        const n = norm(v);
        if (!n) return false;
        if (match.mode === "starts_with") return texto.startsWith(n);
        if (match.mode === "ends_with") return texto.endsWith(n);
        // "contém" por palavra inteira: "oi" não casa com "noite".
        return ` ${texto} `.includes(` ${n} `);
      });
      return termo !== undefined
        ? { casou: true, termo, motivo: match.mode }
        : { casou: false, motivo: "sem_correspondencia" };
    }
    case "pattern": {
      const termo = match.values.find((v) => casarCuringa(norm(v), texto));
      return termo !== undefined
        ? { casou: true, termo, motivo: "padrao" }
        : { casou: false, motivo: "sem_correspondencia" };
    }
    case "regex": {
      for (const v of match.values) {
        const r = new RegExp(v, "iu").exec(bruto);
        if (r)
          return {
            casou: true,
            termo: v,
            capturas: r.slice(1).map((c) => c ?? ""),
            motivo: "regex",
          };
      }
      return { casou: false, motivo: "sem_correspondencia" };
    }
    case "similarity": {
      const limiar = match.threshold ?? opcoes.limiarPadrao ?? 0.75;
      let melhor = { termo: "", pontuacao: 0 };
      for (const v of match.values) {
        const pontuacao = similaridade(norm(v), texto);
        if (pontuacao > melhor.pontuacao) melhor = { termo: v, pontuacao };
      }
      return melhor.pontuacao >= limiar
        ? { casou: true, termo: melhor.termo, pontuacao: melhor.pontuacao, motivo: "similaridade" }
        : {
            casou: false,
            termo: melhor.termo,
            pontuacao: melhor.pontuacao,
            motivo: "abaixo_do_limiar",
          };
    }
  }
}
