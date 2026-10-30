/**
 * Sorteio reprodutível: a semente vem do evento (ex.: id da mensagem), então a mesma entrada sempre escolhe o mesmo
 * ramo e o mesmo atraso. Mulberry32 sobre um hash FNV-1a da semente.
 */
export type Sorteio = () => number;

export function sorteioComSemente(semente: string): Sorteio {
  let h = 0x811c9dc5;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let estado = h >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Índice sorteado segundo os pesos. */
export function escolherPorPeso(pesos: readonly number[], sorteio: Sorteio): number {
  const total = pesos.reduce((a, b) => a + b, 0);
  let alvo = sorteio() * total;
  for (let i = 0; i < pesos.length; i++) {
    alvo -= pesos[i] ?? 0;
    if (alvo < 0) return i;
  }
  return pesos.length - 1;
}
