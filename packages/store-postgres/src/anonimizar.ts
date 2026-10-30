/**
 * Frase de aprendizado sem dado pessoal: a mensagem vira texto normalizado (minúsculas, sem acento nem pontuação,
 * para agrupar a mesma pergunta escrita de jeitos diferentes) com marcadores no lugar de e-mail, link,
 * documento, telefone, valor, número longo e o nome do próprio contato. Outros nomes ficam protegidos pela regra de
 * só mostrar frases vistas em conversas de várias pessoas (ver `perguntasSemResposta`).
 */
const TAMANHO_MAXIMO = 120;

export function anonimizar(
  texto: string,
  contato: { firstName?: string | undefined; name?: string | undefined } = {},
): string | null {
  let t = texto.normalize("NFC").toLocaleLowerCase("pt-BR");
  t = t
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " [email] ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/g, " [link] ")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, " [documento] ")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, " [documento] ")
    .replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, " [telefone] ")
    .replace(/r\$\s*\d[\d.,]*/g, " [valor] ")
    .replace(/\d{3,}/g, " [numero] ");
  const nomes = [contato.firstName, ...(contato.name?.split(/\s+/) ?? [])]
    .filter((n): n is string => !!n && n.length >= 2)
    .map((n) => n.toLocaleLowerCase("pt-BR"));
  for (const nome of new Set(nomes)) {
    const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`(?<![\\p{L}])${escapado}(?![\\p{L}])`, "gu"), " [nome] ");
  }
  // Sem acento e sem pontuação: "Vocês atendem domingo?" e "voces atendem DOMINGO" são a mesma pergunta.
  t = t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s[\]]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || !/\p{L}/u.test(t.replace(/\[[a-z]+\]/g, ""))) return null;
  return t.length > TAMANHO_MAXIMO ? t.slice(0, TAMANHO_MAXIMO).replace(/\s\S*$/, "") : t;
}
