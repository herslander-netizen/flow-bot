import { createHash } from "node:crypto";

import { realidadeDeExemplo, type PerfilDeRealidade } from "@flow-bot/contracts";
import { ArquivoDeCenarios, compilar, simular } from "@flow-bot/runtime";
import type { Pool } from "pg";

import { emTransacao } from "./banco.js";
import type { StudioScope } from "./studio-drafts.js";

type ReviewScope = StudioScope & { canApprove: boolean };
type Approval = {
  revision: number;
  reviewer_id: string;
  document_sha256: string;
  evidence_sha256: string;
  scenario_count: number;
  approved_at: Date;
};

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function assertScope(scope: StudioScope, flowId: string) {
  if (
    !/^[A-Za-z0-9_-]{1,120}$/.test(scope.workspaceId) ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(scope.actorId) ||
    !["test", "staging"].includes(scope.environment) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(flowId)
  )
    throw new Error("studio_scope_invalido");
}

/** Only for a trusted backend. Authorization and human identity must come from its session. */
export class StudioApprovals {
  constructor(
    private readonly pool: Pool,
    private readonly perfis: readonly PerfilDeRealidade[] = [],
  ) {}

  async approve(
    scope: ReviewScope,
    flowId: string,
    revision: number,
    confirmation: boolean,
    scenarios: unknown,
  ) {
    assertScope(scope, flowId);
    if (scope.canApprove !== true || confirmation !== true)
      return { ok: false as const, error: "approval_not_authorized" };
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new Error("studio_revisao_invalida");
    }
    const parsed = ArquivoDeCenarios.safeParse(scenarios);
    if (!parsed.success) return { ok: false as const, error: "independent_scenarios_required" };
    const valid = parsed.data.scenarios.every((scenario) => {
      if (scenario.steps.length > 20) return false;
      return scenario.steps.some((step) => {
        const e = step.expect;
        if (!e) return false;
        if (e.replies !== undefined || e.status !== undefined) return true;
        if (e.cursor !== undefined || e.handoff !== undefined) return true;
        if (Object.keys(e.variables ?? {}).length > 0) return true;
        return e.contains?.some((value) => value.trim().length > 0) === true;
      });
    });
    if (!valid || parsed.data.scenarios.length > 20)
      return { ok: false as const, error: "independent_scenarios_required" };
    const evidence = JSON.stringify(parsed.data);
    if (Buffer.byteLength(evidence, "utf8") > 128 * 1024)
      return { ok: false as const, error: "evidence_too_large" };

    return emTransacao(this.pool, async (c) => {
      const key = [scope.workspaceId, scope.environment, flowId];
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "studio-draft:" + key.join(":"),
      ]);
      const saved = await c.query<{ revision: number; document_text: string }>(
        `SELECT revision, document::text AS document_text
         FROM flow_bot.studio_draft_revisions
         WHERE workspace_id = $1 AND environment = $2 AND flow_id = $3
         ORDER BY revision DESC LIMIT 1`,
        key,
      );
      const latest = saved.rows[0];
      if (!latest || latest.revision !== revision) {
        return { ok: false as const, error: "revision_conflict" };
      }
      const documentHash = hash(latest.document_text);
      const existing = await c.query<Approval>(
        `SELECT revision, reviewer_id, document_sha256, evidence_sha256, scenario_count, approved_at
         FROM flow_bot.studio_draft_approvals
         WHERE workspace_id = $1 AND environment = $2 AND flow_id = $3 AND revision = $4`,
        [...key, revision],
      );
      if (existing.rows[0]) return { ok: false as const, error: "already_approved" };

      const plan = compilar(JSON.parse(latest.document_text), { perfis: this.perfis });
      const profile = this.perfis.find((p) => p.id === plan.doc.reality);
      const realidade = profile ? realidadeDeExemplo(profile) : {};
      const reports = parsed.data.scenarios.map((s) => simular(plan, s, { realidade }));
      if (!reports.every((r) => r.ok))
        return { ok: false as const, error: "independent_tests_failed", reports };
      const evidenceHash = hash(JSON.stringify({ scenarios: parsed.data, reports, realidade }));
      await c.query(
        `INSERT INTO flow_bot.studio_draft_approvals
         (workspace_id, environment, flow_id, revision, reviewer_id, document_sha256,
          evidence_sha256, scenario_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [...key, revision, scope.actorId, documentHash, evidenceHash, reports.length],
      );
      return { ok: true as const, revision, approved: true, published: false, reports };
    });
  }

  async current(scope: StudioScope, flowId: string) {
    assertScope(scope, flowId);
    const result = await this.pool.query<Approval & { document_text: string }>(
      `SELECT a.revision, a.reviewer_id, a.document_sha256, a.evidence_sha256,
              a.scenario_count, a.approved_at, d.document::text AS document_text
       FROM flow_bot.studio_draft_approvals a
       JOIN flow_bot.studio_draft_revisions d
         USING (workspace_id, environment, flow_id, revision)
       WHERE a.workspace_id = $1 AND a.environment = $2 AND a.flow_id = $3
       AND a.revision = (
         SELECT max(revision) FROM flow_bot.studio_draft_revisions
         WHERE workspace_id = $1 AND environment = $2 AND flow_id = $3
       )`,
      [scope.workspaceId, scope.environment, flowId],
    );
    const row = result.rows[0];
    if (!row || hash(row.document_text) !== row.document_sha256) return null;
    return {
      revision: row.revision,
      reviewer_id: row.reviewer_id,
      document_sha256: row.document_sha256,
      evidence_sha256: row.evidence_sha256,
      scenario_count: row.scenario_count,
      approved_at: row.approved_at,
      approved: true as const,
      published: false as const,
    };
  }
}
