/**
 * Subconjunto seguro de RegEx para gatilhos. Recusa o que abre caminho para ReDoS (retrocesso exponencial)
 * em vez de tentar medir o tempo de execução: referências de volta, lookbehind e quantificador aplicado a
 * um grupo que já contém quantificador, como `(a+)+`.
 */
export const TAMANHO_MAXIMO_DO_PADRAO = 200;

export type ProblemaDoPadrao =
  | "vazio"
  | "longo_demais"
  | "referencia_de_volta"
  | "lookbehind"
  | "quantificador_aninhado"
  | "nao_compila";

export function problemaDoPadrao(padrao: string): ProblemaDoPadrao | null {
  if (!padrao) return "vazio";
  if (padrao.length > TAMANHO_MAXIMO_DO_PADRAO) return "longo_demais";
  if (/\\[1-9]|\\k</.test(padrao)) return "referencia_de_volta";
  if (/\(\?<[=!]/.test(padrao)) return "lookbehind";
  if (temQuantificadorAninhado(padrao)) return "quantificador_aninhado";
  try {
    new RegExp(padrao, "u");
  } catch {
    return "nao_compila";
  }
  return null;
}

const QUANTIFICADOR = /^(?:[*+?]|\{\d+(?:,\d*)?\})/;

/** Procura um grupo com quantificador dentro que também recebe quantificador por fora. */
function temQuantificadorAninhado(padrao: string): boolean {
  // Pilha de grupos abertos: cada item diz se já há quantificador dentro dele.
  const pilha: boolean[] = [];
  let emClasse = false;
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (emClasse) {
      if (c === "]") emClasse = false;
      continue;
    }
    if (c === "[") {
      emClasse = true;
      continue;
    }
    if (c === "(") {
      pilha.push(false);
      continue;
    }
    const resto = padrao.slice(i);
    if (c === ")") {
      const tinhaQuantificador = pilha.pop() ?? false;
      const depois = padrao.slice(i + 1);
      if (QUANTIFICADOR.test(depois)) {
        if (tinhaQuantificador) return true;
        if (pilha.length) pilha[pilha.length - 1] = true;
      } else if (tinhaQuantificador && pilha.length) {
        pilha[pilha.length - 1] = true;
      }
      continue;
    }
    if (QUANTIFICADOR.test(resto) && pilha.length) pilha[pilha.length - 1] = true;
  }
  return false;
}
