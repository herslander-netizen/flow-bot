import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrar, StudioDrafts } from "../src/index.js";
import { StudioApprovals } from "../src/studio-approvals.js";

const database = process.env["DATABASE_URL"];
const fixture = () =>
  JSON.parse(
    readFileSync(new URL("../../../examples/boas-vindas-menu.json", import.meta.url), "utf8"),
  );
const flowId = "boas-vindas-menu";
const scope = () => ({
  workspaceId: "studio-" + randomUUID(),
  environment: "test" as const,
  actorId: "reviewer-test",
  canApprove: true,
});
const scenarios = {
  scenarios: [
    {
      name: "Menu e atendimento humano",
      steps: [
        { say: "oi", expect: { status: "waiting_input" } },
        { say: "3", expect: { status: "handed_off" } },
      ],
    },
  ],
};

describe.skipIf(!database)("Studio approvals over PostgreSQL", () => {
  let pool: pg.Pool;
  let drafts: StudioDrafts;
  let approvals: StudioApprovals;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database, max: 4 });
    await migrar(pool);
    drafts = new StudioDrafts(pool);
    approvals = new StudioApprovals(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("requires permission, confirmation, assertions and successful tests", async () => {
    const s = scope();
    await drafts.save(s, flowId, 0, fixture());
    const denied = { ...s, canApprove: false };
    expect(await approvals.approve(denied, flowId, 1, true, scenarios)).toMatchObject({
      ok: false,
      error: "approval_not_authorized",
    });
    expect(await approvals.approve(s, flowId, 1, false, scenarios)).toMatchObject({
      ok: false,
      error: "approval_not_authorized",
    });
    const empty = { scenarios: [{ name: "No assertion", steps: [{ say: "oi" }] }] };
    expect(await approvals.approve(s, flowId, 1, true, empty)).toMatchObject({
      ok: false,
      error: "independent_scenarios_required",
    });
    const failing = {
      scenarios: [{ name: "Fail", steps: [{ say: "oi", expect: { contains: ["ZZZ"] } }] }],
    };
    expect(await approvals.approve(s, flowId, 1, true, failing)).toMatchObject({
      ok: false,
      error: "independent_tests_failed",
    });
    expect(await approvals.current(s, flowId)).toBeNull();
  });

  it("binds approval to a revision without publishing", async () => {
    const s = scope();
    await drafts.save(s, flowId, 0, fixture());
    expect(await approvals.approve(s, flowId, 1, true, scenarios)).toMatchObject({
      ok: true,
      revision: 1,
      approved: true,
      published: false,
    });
    expect(await approvals.current(s, flowId)).toMatchObject({
      revision: 1,
      reviewer_id: s.actorId,
      approved: true,
      published: false,
    });
    expect(await approvals.current(scope(), flowId)).toBeNull();
    expect(await approvals.approve(s, flowId, 1, true, scenarios)).toMatchObject({
      ok: false,
      error: "already_approved",
    });
    const revised = fixture();
    revised.flow.name = "Nova revisão";
    await drafts.save(s, flowId, 1, revised);
    expect(await approvals.current(s, flowId)).toBeNull();
    expect(await approvals.approve(s, flowId, 1, true, scenarios)).toMatchObject({
      ok: false,
      error: "revision_conflict",
    });
    const sql = "SELECT 1 FROM flow_bot.flow_versions WHERE workspace_id = $1";
    expect((await pool.query(sql, [s.workspaceId])).rowCount).toBe(0);
  });
});
