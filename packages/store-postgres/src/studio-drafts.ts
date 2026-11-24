import { isDeepStrictEqual } from "node:util";

import { validarFluxo, type DocumentoDeFluxo, type PerfilDeRealidade } from "@flow-bot/contracts";
import type { Pool } from "pg";

import { emTransacao } from "./banco.js";

export type StudioScope = {
  workspaceId: string;
  environment: "test" | "staging";
  actorId: string;
};

type DraftRevision = {
  revision: number;
  document: DocumentoDeFluxo;
  actor_id: string;
  created_at: Date;
};

function assertScope(scope: StudioScope, flowId: string) {
  if (
    !/^[A-Za-z0-9_-]{1,120}$/.test(scope.workspaceId) ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(scope.actorId) ||
    !["test", "staging"].includes(scope.environment) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(flowId)
  )
    throw new Error("studio_scope_invalido");
}

/** Trusted backend only: resolve scope and actor from authenticated session, never request body. */
export class StudioDrafts {
  constructor(
    private readonly pool: Pool,
    private readonly perfis: readonly PerfilDeRealidade[] = [],
  ) {}

  async save(scope: StudioScope, flowId: string, expectedRevision: number, document: unknown) {
    assertScope(scope, flowId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("studio_revisao_invalida");
    const parsed = validarFluxo(document, { perfis: this.perfis });
    if (!parsed.ok) return { ok: false as const, error: "invalid_flow", problems: parsed.problems };
    if (parsed.flow.flow.id !== flowId || parsed.flow.flow.status !== "draft")
      return { ok: false as const, error: "invalid_draft" };
    const json = JSON.stringify(parsed.flow);
    if (Buffer.byteLength(json, "utf8") > 1024 * 1024)
      return { ok: false as const, error: "draft_too_large" };

    return emTransacao(this.pool, async (c) => {
      const key = [scope.workspaceId, scope.environment, flowId];
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "studio-draft:" + key.join(":"),
      ]);
      const previous = await c.query<DraftRevision>(
        `SELECT revision, document, actor_id, created_at FROM flow_bot.studio_draft_revisions
         WHERE workspace_id = $1 AND environment = $2 AND flow_id = $3
         ORDER BY revision DESC LIMIT 1`,
        key,
      );
      const latest = previous.rows[0];
      const revision = latest?.revision ?? 0;
      if (revision !== expectedRevision)
        return { ok: false as const, error: "revision_conflict", currentRevision: revision };
      if (latest && isDeepStrictEqual(latest.document, parsed.flow))
        return { ok: true as const, revision, changed: false };
      await c.query(
        `INSERT INTO flow_bot.studio_draft_revisions
         (workspace_id, environment, flow_id, revision, document, actor_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [...key, revision + 1, json, scope.actorId],
      );
      return { ok: true as const, revision: revision + 1, changed: true };
    });
  }

  async get(scope: StudioScope, flowId: string, revision?: number) {
    assertScope(scope, flowId);
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1))
      throw new Error("studio_revisao_invalida");
    const result = await this.pool.query<DraftRevision>(
      `SELECT revision, document, actor_id, created_at FROM flow_bot.studio_draft_revisions
       WHERE workspace_id = $1 AND environment = $2 AND flow_id = $3
       AND ($4::integer IS NULL OR revision = $4)
       ORDER BY revision DESC LIMIT 1`,
      [scope.workspaceId, scope.environment, flowId, revision ?? null],
    );
    return result.rows[0] ?? null;
  }

  async history(scope: StudioScope, flowId: string, beforeRevision?: number) {
    assertScope(scope, flowId);
    if (
      beforeRevision !== undefined &&
      (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1)
    )
      throw new Error("studio_revisao_invalida");
    const result = await this.pool.query<Omit<DraftRevision, "document">>(
      `SELECT revision, actor_id, created_at FROM flow_bot.studio_draft_revisions
       WHERE workspace_id = $1 AND environment = $2 AND flow_id = $3
       AND ($4::integer IS NULL OR revision < $4)
       ORDER BY revision DESC LIMIT 50`,
      [scope.workspaceId, scope.environment, flowId, beforeRevision ?? null],
    );
    return result.rows;
  }
}
