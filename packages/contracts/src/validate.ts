/**
 * Validador do documento `flow-bot/v0`: primeiro a estrutura (schema), depois a semântica do grafo.
 * Todo erro aponta o nó, a aresta ou o campo exato, com um código estável para testes e para a interface.
 */
import type { z } from "zod";

import {
  CATALOGO,
  ehTipoConhecido,
  portasDoNo,
  type ConfigDeCorrespondencia,
  type EspecDeNo,
  type TipoDeNo,
} from "./catalog.js";
import { DocumentoDeFluxo, type No } from "./flow.js";
import { problemaDoPadrao } from "./regex-segura.js";
import { ehVariavelDoSistema, nomeDeVariavelValido, placeholdersDoTexto } from "./variables.js";

export type CodigoDoProblema =
  | "estrutura"
  | "id_duplicado"
  | "no_desconhecido"
  | "config_invalida"
  | "entrada_inexistente"
  | "aresta_origem_inexistente"
  | "aresta_destino_inexistente"
  | "aresta_para_gatilho"
  | "porta_invalida"
  | "porta_repetida"
  | "saida_obrigatoria_ausente"
  | "espera_sem_tratamento_de_timeout"
  | "goto_destino_inexistente"
  | "variavel_invalida"
  | "variavel_nao_declarada"
  | "variavel_duplicada"
  | "no_inalcancavel"
  | "loop_sem_limite"
  | "regex_insegura"
  | "curinga_total"
  | "limiar_ausente"
  | "atraso_invalido";

export type Problema = {
  code: CodigoDoProblema;
  message: string;
  /** Caminho no documento, ex.: `nodes[2].config.timeoutSeconds`. */
  path: string;
  nodeId?: string;
  edgeId?: string;
};

export type ResultadoDaValidacao =
  | { ok: true; flow: DocumentoDeFluxo; problems: [] }
  | { ok: false; flow: DocumentoDeFluxo | null; problems: Problema[] };

type Correspondencia = z.infer<typeof ConfigDeCorrespondencia>;
type Configurado = { tipo: TipoDeNo; config: Record<string, unknown>; indice: number };

function caminho(partes: readonly PropertyKey[]): string {
  return partes
    .map((p, i) => (typeof p === "number" ? `[${p}]` : `${i === 0 ? "" : "."}${String(p)}`))
    .join("");
}

export function validarFluxo(entrada: unknown): ResultadoDaValidacao {
  const estrutura = DocumentoDeFluxo.safeParse(entrada);
  if (!estrutura.success) {
    return {
      ok: false,
      flow: null,
      problems: estrutura.error.issues.map((i) => ({
        code: "estrutura",
        message: i.message,
        path: caminho(i.path),
      })),
    };
  }
  const doc = estrutura.data;
  const problemas: Problema[] = [];
  const add = (p: Problema) => problemas.push(p);

  // IDs únicos de nós e arestas.
  const nos = new Map<string, { no: No; indice: number }>();
  doc.nodes.forEach((no, indice) => {
    if (nos.has(no.id))
      add({
        code: "id_duplicado",
        message: `O nó "${no.id}" aparece mais de uma vez.`,
        path: `nodes[${indice}].id`,
        nodeId: no.id,
      });
    else nos.set(no.id, { no, indice });
  });
  const idsDeArestas = new Set<string>();
  doc.edges.forEach((aresta, indice) => {
    if (idsDeArestas.has(aresta.id))
      add({
        code: "id_duplicado",
        message: `A aresta "${aresta.id}" aparece mais de uma vez.`,
        path: `edges[${indice}].id`,
        edgeId: aresta.id,
      });
    idsDeArestas.add(aresta.id);
  });

  // Tipo conhecido e configuração válida para o tipo.
  const configs = new Map<string, Configurado>();
  for (const [id, { no, indice }] of nos) {
    if (!ehTipoConhecido(no.type)) {
      add({
        code: "no_desconhecido",
        message: `Tipo de nó desconhecido: "${no.type}".`,
        path: `nodes[${indice}].type`,
        nodeId: id,
      });
      continue;
    }
    const espec: EspecDeNo = CATALOGO[no.type];
    const config = espec.config.safeParse(no.config);
    if (!config.success) {
      for (const issue of config.error.issues)
        add({
          code: "config_invalida",
          message: issue.message,
          path: caminho(["nodes", indice, "config", ...issue.path]),
          nodeId: id,
        });
      continue;
    }
    configs.set(id, { tipo: no.type, config: config.data as Record<string, unknown>, indice });
  }

  const atraso = doc.defaults?.delaySeconds;
  if (atraso && atraso.min > atraso.max)
    add({
      code: "atraso_invalido",
      message: "O atraso mínimo não pode ser maior que o máximo.",
      path: "defaults.delaySeconds",
    });

  if (!nos.has(doc.flow.entryNodeId))
    add({
      code: "entrada_inexistente",
      message: `O nó de entrada "${doc.flow.entryNodeId}" não existe.`,
      path: "flow.entryNodeId",
    });

  // Arestas: origem, destino, porta válida e uma aresta por porta.
  const saidas = new Map<string, Map<string, string>>();
  doc.edges.forEach((aresta, indice) => {
    const base = { edgeId: aresta.id };
    const origem = nos.get(aresta.from);
    const destino = nos.get(aresta.to);
    if (!origem)
      add({
        ...base,
        code: "aresta_origem_inexistente",
        message: `A aresta sai de "${aresta.from}", que não existe.`,
        path: `edges[${indice}].from`,
      });
    if (!destino)
      add({
        ...base,
        code: "aresta_destino_inexistente",
        message: `A aresta chega em "${aresta.to}", que não existe.`,
        path: `edges[${indice}].to`,
      });
    if (
      destino &&
      ehTipoConhecido(destino.no.type) &&
      (CATALOGO[destino.no.type] as EspecDeNo).trigger
    )
      add({
        ...base,
        code: "aresta_para_gatilho",
        message: `Gatilhos só iniciam o fluxo: "${aresta.to}" não pode receber aresta.`,
        path: `edges[${indice}].to`,
      });
    const doNo = configs.get(aresta.from);
    if (!doNo) return;
    const portas = portasDoNo(doNo.tipo, doNo.config).map((p) => p.name);
    if (!portas.includes(aresta.port)) {
      add({
        ...base,
        code: "porta_invalida",
        message: `"${doNo.tipo}" não tem a porta "${aresta.port}"${portas.length ? ` (portas: ${portas.join(", ")})` : " (nó terminal)"}.`,
        path: `edges[${indice}].port`,
      });
      return;
    }
    const porNo = saidas.get(aresta.from) ?? new Map<string, string>();
    if (porNo.has(aresta.port))
      add({
        ...base,
        code: "porta_repetida",
        message: `A porta "${aresta.port}" de "${aresta.from}" já tem destino: o caminho precisa ser único.`,
        path: `edges[${indice}].port`,
      });
    else porNo.set(aresta.port, aresta.to);
    saidas.set(aresta.from, porNo);
  });

  // Saídas obrigatórias, destino dos saltos e correspondências.
  for (const [id, { tipo, config, indice }] of configs) {
    for (const porta of portasDoNo(tipo, config)) {
      if (!porta.required || saidas.get(id)?.has(porta.name)) continue;
      const esperaSemTimeout = tipo === "state.wait_for_reply" && porta.name === "timeout";
      add({
        code: esperaSemTimeout ? "espera_sem_tratamento_de_timeout" : "saida_obrigatoria_ausente",
        message: esperaSemTimeout
          ? `A espera "${id}" precisa dizer o que acontece quando o prazo acaba (porta "timeout").`
          : `A porta "${porta.name}" de "${id}" precisa de um destino.`,
        path: `nodes[${indice}]`,
        nodeId: id,
      });
    }
    if (tipo === "logic.goto" && !nos.has(String(config["target"])))
      add({
        code: "goto_destino_inexistente",
        message: `O salto de "${id}" aponta para "${String(config["target"])}", que não existe.`,
        path: `nodes[${indice}].config.target`,
        nodeId: id,
      });
    const match = config["match"] as Correspondencia | undefined;
    if (match)
      conferirCorrespondencia(
        match,
        id,
        `nodes[${indice}].config.match`,
        add,
        doc.defaults?.similarityThreshold !== undefined,
      );
  }

  conferirVariaveis(doc, nos, configs, add);
  conferirAlcanceELoops(doc, nos, configs, saidas, add);

  return problemas.length
    ? { ok: false, flow: doc, problems: problemas }
    : { ok: true, flow: doc, problems: [] };
}

function conferirCorrespondencia(
  match: Correspondencia,
  nodeId: string,
  path: string,
  add: (p: Problema) => void,
  limiarPadrao: boolean,
) {
  if (match.mode === "similarity" && match.threshold === undefined && !limiarPadrao)
    add({
      code: "limiar_ausente",
      message: `A correspondência por similaridade de "${nodeId}" precisa de um limiar (threshold no nó ou defaults.similarityThreshold).`,
      path: `${path}.threshold`,
      nodeId,
    });
  if (match.mode === "pattern")
    match.values.forEach((padrao, i) => {
      // Só curinga ("*", "**"…) responderia a qualquer mensagem: isso é o trigger.message_received, explícito.
      if (/^\*+$/.test(padrao.trim()))
        add({
          code: "curinga_total",
          message: `O padrão "${padrao}" responderia a qualquer mensagem; use o gatilho trigger.message_received.`,
          path: `${path}.values[${i}]`,
          nodeId,
        });
    });
  if (match.mode !== "regex") return;
  match.values.forEach((padrao, i) => {
    const problema = problemaDoPadrao(padrao);
    if (problema)
      add({
        code: "regex_insegura",
        message: `Padrão recusado (${problema}): "${padrao.slice(0, 60)}".`,
        path: `${path}.values[${i}]`,
        nodeId,
      });
  });
}

function conferirVariaveis(
  doc: DocumentoDeFluxo,
  nos: Map<string, { no: No; indice: number }>,
  configs: Map<string, Configurado>,
  add: (p: Problema) => void,
) {
  const declaradas = new Set<string>();
  doc.variables.forEach((v, i) => {
    if (declaradas.has(v.name))
      add({
        code: "variavel_duplicada",
        message: `A variável "${v.name}" foi declarada duas vezes.`,
        path: `variables[${i}].name`,
      });
    declaradas.add(v.name);
  });

  const conferir = (nome: string, nodeId: string, path: string, gravacao = false) => {
    if (!nomeDeVariavelValido(nome)) {
      add({
        code: "variavel_invalida",
        message: `"${nome}" não é um nome de variável válido (use contact., conversation., message. ou session.).`,
        path,
        nodeId,
      });
      return;
    }
    if (nome.startsWith("session.")) {
      if (!declaradas.has(nome))
        add({
          code: "variavel_nao_declarada",
          message: `A variável "${nome}" é usada em "${nodeId}" mas não está declarada em variables.`,
          path,
          nodeId,
        });
      return;
    }
    if (gravacao || !ehVariavelDoSistema(nome))
      add({
        code: gravacao ? "variavel_invalida" : "variavel_nao_declarada",
        message: gravacao
          ? `Só variáveis session. podem ser gravadas pelo fluxo ("${nome}" em "${nodeId}").`
          : `"${nome}" não é uma variável do sistema.`,
        path,
        nodeId,
      });
  };

  for (const [id, { tipo, config, indice }] of configs) {
    const base = `nodes[${indice}].config`;
    for (const campo of ["text", "prompt", "note"] as const) {
      const valor = config[campo];
      if (typeof valor === "string")
        placeholdersDoTexto(valor).forEach((nome) => conferir(nome, id, `${base}.${campo}`));
    }
    if (tipo === "message.quick_replies")
      (config["options"] as { label: string }[]).forEach((o, i) =>
        placeholdersDoTexto(o.label).forEach((nome) =>
          conferir(nome, id, `${base}.options[${i}].label`),
        ),
      );
    if (typeof config["variable"] === "string") {
      const grava = tipo === "data.capture" || tipo === "data.set_variable";
      conferir(config["variable"], id, `${base}.variable`, grava);
    }
    if (typeof config["saveAs"] === "string")
      conferir(config["saveAs"], id, `${base}.saveAs`, true);
  }
}

function conferirAlcanceELoops(
  doc: DocumentoDeFluxo,
  nos: Map<string, { no: No; indice: number }>,
  configs: Map<string, Configurado>,
  saidas: Map<string, Map<string, string>>,
  add: (p: Problema) => void,
) {
  // Vizinhos: arestas válidas + o salto do `logic.goto`.
  const vizinhos = new Map<string, string[]>();
  for (const id of nos.keys()) {
    const lista = [...(saidas.get(id)?.values() ?? [])].filter((d) => nos.has(d));
    const doNo = configs.get(id);
    if (doNo?.tipo === "logic.goto" && nos.has(String(doNo.config["target"])))
      lista.push(String(doNo.config["target"]));
    vizinhos.set(id, lista);
  }

  // Alcance a partir da entrada e de todos os gatilhos.
  const inicio = [doc.flow.entryNodeId];
  for (const [id, { tipo }] of configs) if ((CATALOGO[tipo] as EspecDeNo).trigger) inicio.push(id);
  const alcancados = new Set<string>();
  const fila = inicio.filter((id) => nos.has(id));
  for (let id = fila.shift(); id !== undefined; id = fila.shift()) {
    if (alcancados.has(id)) continue;
    alcancados.add(id);
    fila.push(...(vizinhos.get(id) ?? []));
  }
  for (const [id, { no, indice }] of nos)
    if (!alcancados.has(id) && !no.detached)
      add({
        code: "no_inalcancavel",
        message: `O nó "${id}" nunca é alcançado (ligue-o ao fluxo ou marque "detached": true).`,
        path: `nodes[${indice}]`,
        nodeId: id,
      });

  // Ciclos (componentes fortemente conexos, Tarjan): cada um precisa de um nó que suspende ou limita.
  let contador = 0;
  const indiceDe = new Map<string, number>();
  const menor = new Map<string, number>();
  const pilha: string[] = [];
  const naPilha = new Set<string>();
  const componentes: string[][] = [];
  const de = (mapa: Map<string, number>, k: string) => mapa.get(k) ?? 0;
  const visitar = (v: string) => {
    indiceDe.set(v, contador);
    menor.set(v, contador);
    contador++;
    pilha.push(v);
    naPilha.add(v);
    for (const w of vizinhos.get(v) ?? []) {
      if (!indiceDe.has(w)) {
        visitar(w);
        menor.set(v, Math.min(de(menor, v), de(menor, w)));
      } else if (naPilha.has(w)) menor.set(v, Math.min(de(menor, v), de(indiceDe, w)));
    }
    if (menor.get(v) === indiceDe.get(v)) {
      const comp: string[] = [];
      for (let w = pilha.pop(); w !== undefined; w = pilha.pop()) {
        naPilha.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      componentes.push(comp);
    }
  };
  for (const id of nos.keys()) if (!indiceDe.has(id)) visitar(id);

  for (const comp of componentes) {
    const [unico] = comp;
    const ciclo =
      comp.length > 1 || (unico !== undefined && (vizinhos.get(unico) ?? []).includes(unico));
    if (!ciclo) continue;
    const limitado = comp.some((id) => {
      const doNo = configs.get(id);
      if (!doNo) return false;
      return Boolean((CATALOGO[doNo.tipo] as EspecDeNo).suspends) || doNo.tipo === "logic.goto";
    });
    if (limitado) continue;
    const ordenados = [...comp].sort();
    const primeiro = ordenados[0] ?? "";
    add({
      code: "loop_sem_limite",
      message: `Ciclo sem espera nem limite entre: ${ordenados.join(", ")}. Inclua uma espera, um atraso ou um logic.goto com maxVisits.`,
      path: `nodes[${nos.get(primeiro)?.indice ?? 0}]`,
      nodeId: primeiro,
    });
  }
}
