/**
 * Execução durável do Flow Bot sobre Postgres.
 *
 * Cada evento roda numa transação: grava o evento (idempotente), trava a conversa (`FOR UPDATE`), chama o motor
 * puro (`processar`), grava a nova sessão, agenda os prazos e põe as ações na caixa de saída. Se qualquer passo
 * falhar, nada fica pela metade. Os prazos e as entregas são retomados por `processarVencidos` e
 * `entregarPendentes`, que podem rodar em vários processos (`FOR UPDATE SKIP LOCKED`).
 */
import { createHash } from "node:crypto";

import type { PerfilDeRealidade, Realidade } from "@flow-bot/contracts";
import {
  compilar,
  novaSessao,
  processar,
  type Acao,
  type Evento,
  type Plano,
  type Sessao,
} from "@flow-bot/runtime";
import type { Pool } from "pg";

import { registrarAprendizado } from "./aprendizado.js";
import { emTransacao, type Cliente } from "./banco.js";

export type OpcoesDoFlowBot = {
  pool: Pool;
  /** Relógio (injetável nos testes). */
  agora?: () => Date;
  /** Tentativas de entrega antes de desistir (padrão 5). */
  maxTentativas?: number;
  /** Quanto tempo um item fica reservado por um processo antes de outro poder retomá-lo (padrão 60 s). */
  reservaMs?: number;
  /** Perfis de realidade aceitos na publicação (fatos conferidos contra o perfil declarado no fluxo). */
  perfis?: readonly PerfilDeRealidade[];
  /**
   * Retrato da realidade do hospedeiro para um evento (o que é verdade agora: aberto, serviços, preços…). Chamado
   * antes de cada processamento, fora da transação do banco.
   */
  realidade?: (contexto: {
    workspaceId: string;
    conversationKey: string;
    agora: Date;
  }) => Promise<Realidade>;
  /**
   * Segredo da instalação para contar pessoas diferentes por frase sem guardar quem são. Sem ele, as frases de
   * aprendizado não são registradas (os contadores continuam).
   */
  segredoDoAprendizado?: string;
  /** Dias de retenção de mensagens e histórico (padrão 90, decisão do responsável). */
  diasDeRetencao?: number;
};

export type EntradaDeMensagem = {
  workspaceId: string;
  conversationKey: string;
  /** Fluxo que atende conversas novas. */
  flowId: string;
  /** Chave única do evento no canal (ex.: `whatsapp:<id da mensagem>`). */
  eventKey: string;
  text: string;
  contact?: { firstName?: string; name?: string };
};

export type ResultadoDoRecebimento =
  | { duplicado: true }
  | { duplicado: false; status: Sessao["status"]; motivo: string; acoes: Acao[] };

/** Adaptador de canal: entrega uma ação. Precisa ser idempotente pela `chave` (reenvio após falha). */
export type AdaptadorDeSaida = (entrega: {
  workspaceId: string;
  conversationKey: string;
  chave: string;
  acao: Acao;
}) => Promise<{ ok: boolean; erro?: string }>;

/** Filtros das filas: um processo pode atender todos os workspaces ou só um. */
export type OpcoesDaFila = { limite?: number; workspaceId?: string };

type LinhaDeConversa = { flow_id: string; flow_version: number; session: Sessao; revision: number };

/** JSON com chaves ordenadas: o mesmo fluxo gera sempre o mesmo checksum. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/** Espera entre tentativas: 5 s, 10 s, 20 s… até 1 h. */
export function esperaDaTentativa(tentativa: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, tentativa - 1), 3_600_000);
}

export class FlowBot {
  private readonly pool: Pool;
  private readonly agora: () => Date;
  private readonly maxTentativas: number;
  private readonly reservaMs: number;
  private readonly planos = new Map<string, Plano>();
  private readonly perfis: readonly PerfilDeRealidade[] | undefined;
  private readonly realidade: OpcoesDoFlowBot["realidade"];
  private readonly segredoDoAprendizado: string | null;
  private readonly diasDeRetencao: number;

  constructor(opcoes: OpcoesDoFlowBot) {
    this.pool = opcoes.pool;
    this.agora = opcoes.agora ?? (() => new Date());
    this.maxTentativas = opcoes.maxTentativas ?? 5;
    this.reservaMs = opcoes.reservaMs ?? 60_000;
    this.perfis = opcoes.perfis;
    this.realidade = opcoes.realidade;
    this.segredoDoAprendizado = opcoes.segredoDoAprendizado ?? null;
    this.diasDeRetencao = opcoes.diasDeRetencao ?? 90;
  }

  /** Publica uma versão nova e imutável (só se o fluxo for válido). Republicar o mesmo conteúdo não cria versão. */
  async publicar(
    workspaceId: string,
    documento: unknown,
  ): Promise<{ version: number; checksum: string; nova: boolean }> {
    const plano = compilar(documento, this.perfis ? { perfis: this.perfis } : {});
    const flowId = plano.doc.flow.id;
    const checksum = createHash("sha256").update(canonico(plano.doc)).digest("hex");
    return emTransacao(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `publicar:${workspaceId}:${flowId}`,
      ]);
      const ultima = await c.query<{ version: number; checksum: string }>(
        `SELECT version, checksum FROM flow_bot.flow_versions
          WHERE workspace_id = $1 AND flow_id = $2 ORDER BY version DESC LIMIT 1`,
        [workspaceId, flowId],
      );
      const atual = ultima.rows[0];
      if (atual?.checksum === checksum) return { version: atual.version, checksum, nova: false };
      const version = (atual?.version ?? 0) + 1;
      await c.query(
        `INSERT INTO flow_bot.flow_versions (workspace_id, flow_id, version, checksum, document, published_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, flowId, version, checksum, JSON.stringify(plano.doc), this.agora()],
      );
      return { version, checksum, nova: true };
    });
  }

  async receberMensagem(m: EntradaDeMensagem): Promise<ResultadoDoRecebimento> {
    const agora = this.agora();
    const evento: Evento = {
      type: "message",
      id: m.eventKey,
      at: agora.getTime(),
      text: m.text,
      ...(m.contact ? { contact: m.contact } : {}),
    };
    return this.receber(m.workspaceId, m.conversationKey, m.flowId, m.eventKey, evento, {
      text: m.text,
    });
  }

  /** Processa os prazos vencidos (fim de espera e de atraso). Devolve quantos processou. */
  async processarVencidos(opcoes: OpcoesDaFila = {}): Promise<number> {
    const limite = opcoes.limite ?? 50;
    const agora = this.agora();
    const reservados = await emTransacao(this.pool, async (c) => {
      const r = await c.query<{
        id: string;
        workspace_id: string;
        conversation_key: string;
        run_at: Date;
      }>(
        `UPDATE flow_bot.jobs SET status = 'running', locked_until = $2, attempts = attempts + 1
          WHERE id IN (
            SELECT id FROM flow_bot.jobs
             WHERE run_at <= $1
               AND (status = 'pending' OR (status = 'running' AND locked_until < $1))
               AND ($4::text IS NULL OR workspace_id = $4)
             ORDER BY run_at, id
             LIMIT $3
             FOR UPDATE SKIP LOCKED)
          RETURNING id, workspace_id, conversation_key, run_at`,
        [agora, new Date(agora.getTime() + this.reservaMs), limite, opcoes.workspaceId ?? null],
      );
      // RETURNING não garante ordem.
      return r.rows.sort(
        (a, b) => a.run_at.getTime() - b.run_at.getTime() || Number(a.id) - Number(b.id),
      );
    });
    for (const job of reservados) {
      try {
        const chave = `timer:${job.id}`;
        await this.receber(
          job.workspace_id,
          job.conversation_key,
          null,
          chave,
          {
            type: "timer",
            id: chave,
            at: job.run_at.getTime(),
          },
          {},
        );
        await this.pool.query(
          "UPDATE flow_bot.jobs SET status = 'done', locked_until = NULL WHERE id = $1",
          [job.id],
        );
      } catch (erro) {
        await this.adiarJob(job.id, erro);
      }
    }
    return reservados.length;
  }

  private async adiarJob(id: string, erro: unknown) {
    const agora = this.agora();
    await this.pool.query(
      `UPDATE flow_bot.jobs
          SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
              run_at = $2::timestamptz + make_interval(secs => LEAST(5 * power(2, attempts - 1), 3600)),
              locked_until = NULL, last_error = $4
        WHERE id = $1`,
      [
        id,
        agora,
        this.maxTentativas,
        String(erro instanceof Error ? erro.message : erro).slice(0, 500),
      ],
    );
  }

  /**
   * Entrega as ações pendentes pelo adaptador, com novas tentativas. A ordem dentro de uma conversa é garantida: uma
   * ação só sai depois que a anterior foi entregue, falhou de vez ou foi cancelada. Devolve quantas tentou.
   */
  async entregarPendentes(adaptador: AdaptadorDeSaida, opcoes: OpcoesDaFila = {}): Promise<number> {
    const limite = opcoes.limite ?? 50;
    let total = 0;
    while (total < limite) {
      const lote = await this.reservarSaidas(limite - total, opcoes.workspaceId ?? null);
      if (!lote.length) break;
      await this.entregarLote(adaptador, lote);
      total += lote.length;
    }
    return total;
  }

  /**
   * Aplica resultados externos de webhooks persistidos na fila. A chave de evento é estável:
   * se o processo cair depois de receber() e antes de marcar done, a deduplicação do inbound_events
   * torna a retomada segura e não executa o fluxo duas vezes.
   */
  async processarResultadosWebhook(opcoes: OpcoesDaFila = {}): Promise<number> {
    const limite = opcoes.limite ?? 50;
    const agora = this.agora();
    const reservados = await emTransacao(this.pool, async (c) => {
      const r = await c.query<{
        id: string;
        workspace_id: string;
        conversation_key: string;
        outbound_id: string;
        ok: boolean;
        attempts: number;
      }>(
        `UPDATE flow_bot.webhook_results SET status = 'running', locked_until = $2, attempts = attempts + 1
          WHERE id IN (
            SELECT id FROM flow_bot.webhook_results
             WHERE next_attempt_at <= $1
               AND (status = 'pending' OR (status = 'running' AND locked_until < $1))
               AND ($4::text IS NULL OR workspace_id = $4)
             ORDER BY next_attempt_at, id
             LIMIT $3
             FOR UPDATE SKIP LOCKED)
          RETURNING id, workspace_id, conversation_key, outbound_id, ok, attempts`,
        [agora, new Date(agora.getTime() + this.reservaMs), limite, opcoes.workspaceId ?? null],
      );
      return r.rows;
    });

    for (const item of reservados) {
      const chave = `webhook:${item.outbound_id}`;
      try {
        await this.receber(
          item.workspace_id,
          item.conversation_key,
          null,
          chave,
          { type: "webhook_result", id: chave, at: this.agora().getTime(), ok: item.ok },
          { ok: item.ok },
        );
        await this.pool.query(
          `UPDATE flow_bot.webhook_results
              SET status = 'done', processed_at = $2, locked_until = NULL, last_error = NULL
            WHERE id = $1`,
          [item.id, this.agora()],
        );
      } catch (erro) {
        const espera = Math.min(5_000 * 2 ** Math.max(0, item.attempts - 1), 3_600_000);
        await this.pool.query(
          `UPDATE flow_bot.webhook_results
              SET status = 'pending', next_attempt_at = $2, locked_until = NULL, last_error = $3
            WHERE id = $1`,
          [
            item.id,
            new Date(this.agora().getTime() + espera),
            String(erro instanceof Error ? erro.message : erro).slice(0, 500),
          ],
        );
      }
    }
    return reservados.length;
  }

  /** Reserva só a primeira ação pendente de cada conversa (as seguintes esperam a vez). */
  private async reservarSaidas(limite: number, workspaceId: string | null) {
    const agora = this.agora();
    const reservados = await emTransacao(this.pool, async (c) => {
      const r = await c.query<{
        id: string;
        workspace_id: string;
        conversation_key: string;
        idempotency_key: string;
        action: Acao;
        attempts: number;
      }>(
        `UPDATE flow_bot.outbound SET status = 'sending', locked_until = $2, attempts = attempts + 1
          WHERE id IN (
            SELECT o.id FROM flow_bot.outbound o
             WHERE o.next_attempt_at <= $1
               AND (o.status = 'pending' OR (o.status = 'sending' AND o.locked_until < $1))
               AND ($4::text IS NULL OR o.workspace_id = $4)
               AND NOT EXISTS (
                 SELECT 1 FROM flow_bot.outbound anterior
                  WHERE anterior.workspace_id = o.workspace_id
                    AND anterior.conversation_key = o.conversation_key
                    AND anterior.id < o.id
                    AND anterior.status IN ('pending', 'sending'))
             ORDER BY o.next_attempt_at, o.id
             LIMIT $3
             FOR UPDATE SKIP LOCKED)
          RETURNING id, workspace_id, conversation_key, idempotency_key, action, attempts`,
        [agora, new Date(agora.getTime() + this.reservaMs), limite, workspaceId],
      );
      return r.rows;
    });
    // RETURNING não garante ordem.
    return reservados.sort((a, b) => Number(a.id) - Number(b.id));
  }

  private async entregarLote(
    adaptador: AdaptadorDeSaida,
    reservados: Awaited<ReturnType<FlowBot["reservarSaidas"]>>,
  ) {
    for (const item of reservados) {
      let resultado: { ok: boolean; erro?: string };
      try {
        resultado = await adaptador({
          workspaceId: item.workspace_id,
          conversationKey: item.conversation_key,
          chave: item.idempotency_key,
          acao: item.action,
        });
      } catch (erro) {
        resultado = { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
      }
      const webhook = item.action.type === "webhook";
      if (webhook) {
        // Resultado externo e fila interna são persistidos juntos. Se o processo cair, outro ciclo retoma a fila.
        await emTransacao(this.pool, async (c) => {
          await c.query(
            `UPDATE flow_bot.outbound
                SET status = $2, sent_at = $3, locked_until = NULL, last_error = $4
              WHERE id = $1`,
            [
              item.id,
              resultado.ok ? "sent" : "failed",
              this.agora(),
              resultado.erro?.slice(0, 500) ?? null,
            ],
          );
          await c.query(
            `INSERT INTO flow_bot.webhook_results
               (workspace_id, outbound_id, conversation_key, ok, status, next_attempt_at, created_at)
             VALUES ($1, $2, $3, $4, 'pending', $5, $5)
             ON CONFLICT (workspace_id, outbound_id) DO NOTHING`,
            [item.workspace_id, item.id, item.conversation_key, resultado.ok, this.agora()],
          );
        });
        continue;
      }
      if (resultado.ok) {
        await this.pool.query(
          `UPDATE flow_bot.outbound SET status = 'sent', sent_at = $2, locked_until = NULL, last_error = NULL WHERE id = $1`,
          [item.id, this.agora()],
        );
        continue;
      }
      const desistir = item.attempts >= this.maxTentativas;
      await this.pool.query(
        `UPDATE flow_bot.outbound
            SET status = $2, next_attempt_at = $3, locked_until = NULL, last_error = $4
          WHERE id = $1`,
        [
          item.id,
          desistir ? "failed" : "pending",
          new Date(this.agora().getTime() + esperaDaTentativa(item.attempts)),
          resultado.erro?.slice(0, 500) ?? "falha_sem_detalhe",
        ],
      );
    }
  }

  /**
   * Devolve ao bot uma conversa que estava sob atendimento humano.
   * A autorização de quem pode chamar este método pertence à camada autenticada do servidor.
   */
  async retomarAtendimento(workspaceId: string, conversationKey: string): Promise<boolean> {
    return emTransacao(this.pool, async (c) => {
      const r = await c.query<LinhaDeConversa>(
        `SELECT flow_id, flow_version, session, revision FROM flow_bot.conversations
          WHERE workspace_id = $1 AND conversation_key = $2 FOR UPDATE`,
        [workspaceId, conversationKey],
      );
      const linha = r.rows[0];
      if (!linha || linha.session.status !== "handed_off") return false;

      const sessao: Sessao = {
        ...linha.session,
        status: "new",
        cursor: null,
        prazo: null,
        tentativas: 0,
      };
      await c.query(
        `UPDATE flow_bot.conversations
            SET session = $3, revision = revision + 1, updated_at = $4
          WHERE workspace_id = $1 AND conversation_key = $2`,
        [workspaceId, conversationKey, JSON.stringify(sessao), this.agora()],
      );
      return true;
    });
  }

  /** Cancela respostas e prazos ainda não executados de uma conversa (ex.: atendente assumiu). */
  async cancelarPendentes(
    workspaceId: string,
    conversationKey: string,
  ): Promise<{ saidas: number; prazos: number }> {
    return emTransacao(this.pool, async (c) => {
      const saidas = await c.query(
        `UPDATE flow_bot.outbound SET status = 'cancelled', locked_until = NULL
          WHERE workspace_id = $1 AND conversation_key = $2 AND status = 'pending'`,
        [workspaceId, conversationKey],
      );
      const prazos = await c.query(
        `UPDATE flow_bot.jobs SET status = 'cancelled', locked_until = NULL
          WHERE workspace_id = $1 AND conversation_key = $2 AND status = 'pending'`,
        [workspaceId, conversationKey],
      );
      return { saidas: saidas.rowCount ?? 0, prazos: prazos.rowCount ?? 0 };
    });
  }

  /** Histórico de decisões de uma conversa (mais antigo primeiro). */
  async historico(workspaceId: string, conversationKey: string) {
    const r = await this.pool.query<{
      event_key: string;
      flow_version: number;
      status: string;
      motivo: string;
      steps: unknown[];
      created_at: Date;
      reality_missing: string[];
    }>(
      `SELECT event_key, flow_version, status, motivo, steps, created_at, reality_missing FROM flow_bot.executions
        WHERE workspace_id = $1 AND conversation_key = $2 ORDER BY id`,
      [workspaceId, conversationKey],
    );
    return r.rows;
  }

  /**
   * Perguntas que o fluxo não soube tratar, das mais frequentes para as menos. Só aparecem frases vistas em conversas
   * de pelo menos `minimoDePessoas` pessoas diferentes (mínimo 3): uma mensagem única e pessoal nunca sai daqui.
   */
  async perguntasSemResposta(
    workspaceId: string,
    opcoes: { flowId?: string; minimoDePessoas?: number; limite?: number } = {},
  ) {
    const r = await this.pool.query<{
      flow_id: string;
      kind: string;
      phrase: string;
      contacts: number;
      occurrences: number;
      last_seen: Date;
    }>(
      `SELECT flow_id, kind, phrase, contacts, occurrences, last_seen FROM flow_bot.learning_phrases
        WHERE workspace_id = $1 AND ($2::text IS NULL OR flow_id = $2) AND contacts >= $3
        ORDER BY contacts DESC, occurrences DESC, phrase
        LIMIT $4`,
      [
        workspaceId,
        opcoes.flowId ?? null,
        Math.max(3, opcoes.minimoDePessoas ?? 3),
        opcoes.limite ?? 100,
      ],
    );
    return r.rows;
  }

  /** Contadores somados por métrica e chave desde uma data (assuntos, caminhos, encaminhamentos…). */
  async contadores(workspaceId: string, opcoes: { flowId?: string; desde?: Date } = {}) {
    const r = await this.pool.query<{
      flow_id: string;
      metric: string;
      key: string;
      total: number;
    }>(
      `SELECT flow_id, metric, key, sum(count)::int AS total FROM flow_bot.learning_counters
        WHERE workspace_id = $1 AND ($2::text IS NULL OR flow_id = $2) AND ($3::date IS NULL OR day >= $3)
        GROUP BY flow_id, metric, key
        ORDER BY metric, total DESC, key`,
      [workspaceId, opcoes.flowId ?? null, opcoes.desde ?? null],
    );
    return r.rows;
  }

  /**
   * Apaga o que passou da retenção (mensagens recebidas, histórico, saídas e prazos encerrados, conversas paradas e as
   * marcas de pessoa do aprendizado). Frases anonimizadas e contadores ficam. Em lotes, para não travar o banco.
   */
  async limparAntigos(
    opcoes: { lote?: number; workspaceId?: string } = {},
  ): Promise<Record<string, number>> {
    const limite = new Date(this.agora().getTime() - this.diasDeRetencao * 86_400_000);
    const lote = opcoes.lote ?? 5000;
    const alvos: [string, string, string][] = [
      ["inbound_events", "received_at", "TRUE"],
      ["executions", "created_at", "TRUE"],
      ["outbound", "created_at", "status IN ('sent', 'failed', 'cancelled')"],
      ["jobs", "created_at", "status IN ('done', 'failed', 'cancelled')"],
      ["webhook_results", "processed_at", "status = 'done' AND processed_at IS NOT NULL"],
      ["conversations", "updated_at", "TRUE"],
      ["learning_phrase_contacts", "seen_at", "TRUE"],
    ];
    const apagados: Record<string, number> = {};
    for (const [tabela, coluna, condicao] of alvos) {
      let total = 0;
      for (;;) {
        const r = await this.pool.query(
          `DELETE FROM flow_bot.${tabela} WHERE ctid IN (
             SELECT ctid FROM flow_bot.${tabela}
              WHERE ${coluna} < $1 AND ${condicao} AND ($3::text IS NULL OR workspace_id = $3)
              LIMIT $2)`,
          [limite, lote, opcoes.workspaceId ?? null],
        );
        total += r.rowCount ?? 0;
        if ((r.rowCount ?? 0) < lote) break;
      }
      apagados[tabela] = total;
    }
    return apagados;
  }

  async sessao(
    workspaceId: string,
    conversationKey: string,
  ): Promise<(LinhaDeConversa & { session: Sessao }) | null> {
    const r = await this.pool.query<LinhaDeConversa>(
      `SELECT flow_id, flow_version, session, revision FROM flow_bot.conversations
        WHERE workspace_id = $1 AND conversation_key = $2`,
      [workspaceId, conversationKey],
    );
    return r.rows[0] ?? null;
  }

  private async plano(
    c: Cliente,
    workspaceId: string,
    flowId: string,
    version: number | null,
  ): Promise<{ plano: Plano; version: number }> {
    const r = await c.query<{ version: number; document: unknown }>(
      version === null
        ? `SELECT version, document FROM flow_bot.flow_versions
            WHERE workspace_id = $1 AND flow_id = $2 ORDER BY version DESC LIMIT 1`
        : `SELECT version, document FROM flow_bot.flow_versions
            WHERE workspace_id = $1 AND flow_id = $2 AND version = $3`,
      version === null ? [workspaceId, flowId] : [workspaceId, flowId, version],
    );
    const linha = r.rows[0];
    if (!linha)
      throw new Error(`Fluxo ${flowId} sem versão publicada no workspace ${workspaceId}.`);
    const chave = `${workspaceId}:${flowId}:${linha.version}`;
    let plano = this.planos.get(chave);
    if (!plano) {
      // Já validado na publicação; os perfis podem ter mudado desde então, então não são reconferidos aqui.
      plano = compilar(linha.document);
      this.planos.set(chave, plano);
    }
    return { plano, version: linha.version };
  }

  private async receber(
    workspaceId: string,
    conversationKey: string,
    flowIdNovo: string | null,
    eventKey: string,
    evento: Evento,
    payload: Record<string, unknown>,
  ): Promise<ResultadoDoRecebimento> {
    const agora = this.agora();
    // O retrato vem antes da transação: uma consulta lenta do hospedeiro não segura a trava da conversa.
    const realidade: Realidade = this.realidade
      ? await this.realidade({ workspaceId, conversationKey, agora })
      : {};
    return emTransacao(this.pool, async (c) => {
      const inserido = await c.query(
        `INSERT INTO flow_bot.inbound_events (workspace_id, event_key, conversation_key, kind, payload, received_at)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [workspaceId, eventKey, conversationKey, evento.type, JSON.stringify(payload), agora],
      );
      if (!inserido.rowCount) return { duplicado: true };

      // Uma conversa por vez: a segunda mensagem espera a primeira terminar.
      const r = await c.query<LinhaDeConversa>(
        `SELECT flow_id, flow_version, session, revision FROM flow_bot.conversations
          WHERE workspace_id = $1 AND conversation_key = $2 FOR UPDATE`,
        [workspaceId, conversationKey],
      );
      let linha = r.rows[0];
      if (!linha) {
        if (!flowIdNovo)
          return { duplicado: false, status: "new", motivo: "conversa_inexistente", acoes: [] };
        const { version } = await this.plano(c, workspaceId, flowIdNovo, null);
        await c.query(
          `INSERT INTO flow_bot.conversations (workspace_id, conversation_key, flow_id, flow_version, session, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [
            workspaceId,
            conversationKey,
            flowIdNovo,
            version,
            JSON.stringify(novaSessao(flowIdNovo)),
            agora,
          ],
        );
        const de = await c.query<LinhaDeConversa>(
          `SELECT flow_id, flow_version, session, revision FROM flow_bot.conversations
            WHERE workspace_id = $1 AND conversation_key = $2 FOR UPDATE`,
          [workspaceId, conversationKey],
        );
        linha = de.rows[0];
        if (!linha) throw new Error("Conversa não pôde ser criada.");
      }

      // Conversa parada num nó continua na versão em que começou; livre, passa para a versão publicada mais nova.
      const livre = linha.session.cursor === null;
      const { plano, version } = await this.plano(
        c,
        workspaceId,
        linha.flow_id,
        livre ? null : linha.flow_version,
      );
      const resultado = processar(plano, linha.session, evento, { realidade });
      const sessao = resultado.sessao;

      // Ao encaminhar para atendimento humano, cancela o que ainda não foi reservado.
      // Itens em "sending" podem já estar em trânsito e não são interrompidos à força.
      if (linha.session.status !== "handed_off" && sessao.status === "handed_off") {
        await c.query(
          `UPDATE flow_bot.outbound
              SET status = 'cancelled', locked_until = NULL
            WHERE workspace_id = $1 AND conversation_key = $2 AND status = 'pending'`,
          [workspaceId, conversationKey],
        );
      }

      await c.query(
        `UPDATE flow_bot.conversations SET session = $3, flow_version = $4, revision = revision + 1, updated_at = $5
          WHERE workspace_id = $1 AND conversation_key = $2`,
        [workspaceId, conversationKey, JSON.stringify(sessao), version, agora],
      );

      // Prazo: a sessão tem no máximo um em aberto; qualquer mudança substitui o anterior.
      const agendar = resultado.acoes.filter(
        (a): a is Extract<Acao, { type: "schedule" }> => a.type === "schedule",
      );
      if (agendar.length || sessao.prazo === null)
        await c.query(
          `UPDATE flow_bot.jobs SET status = 'cancelled'
            WHERE workspace_id = $1 AND conversation_key = $2 AND status = 'pending'`,
          [workspaceId, conversationKey],
        );
      for (const a of agendar)
        await c.query(
          `INSERT INTO flow_bot.jobs (workspace_id, conversation_key, node_id, run_at, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [workspaceId, conversationKey, a.nodeId, new Date(a.at), agora],
        );

      let indice = 0;
      for (const a of resultado.acoes) {
        if (a.type === "schedule") continue;
        const atraso = "delayMs" in a ? a.delayMs : 0;
        await c.query(
          `INSERT INTO flow_bot.outbound (workspace_id, conversation_key, idempotency_key, action, next_attempt_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [
            workspaceId,
            conversationKey,
            `${eventKey}#${indice++}`,
            JSON.stringify(a),
            new Date(agora.getTime() + atraso),
            agora,
          ],
        );
      }

      await c.query(
        `INSERT INTO flow_bot.executions
           (workspace_id, conversation_key, event_key, flow_id, flow_version, status, motivo, steps, created_at,
            reality, reality_missing)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          workspaceId,
          conversationKey,
          eventKey,
          linha.flow_id,
          version,
          sessao.status,
          resultado.motivo,
          JSON.stringify(resultado.passos),
          agora,
          this.realidade ? JSON.stringify(realidade) : null,
          resultado.realidadeAusente,
        ],
      );
      await registrarAprendizado(c, {
        workspaceId,
        flowId: linha.flow_id,
        conversationKey,
        agora,
        resultado,
        texto: evento.type === "message" ? evento.text : null,
        contato: evento.type === "message" ? (evento.contact ?? {}) : {},
        segredo: this.segredoDoAprendizado,
      });
      return {
        duplicado: false,
        status: sessao.status,
        motivo: resultado.motivo,
        acoes: resultado.acoes,
      };
    });
  }
}
