import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrar, StudioDrafts, type StudioScope } from "../src/index.js";

const database = process.env["DATABASE_URL"];
const fixture = () =>
  JSON.parse(
    readFileSync(new URL("../../../examples/boas-vindas-menu.json", import.meta.url), "utf8"),
  );
const flowId = "boas-vindas-menu";
const scope = (): StudioScope => ({
  workspaceId: "studio-" + randomUUID(),
  environment: "test",
  actorId: "operator-test",
});

describe.skipIf(!database)("Studio draft storage over PostgreSQL", () => {
  let pool: pg.Pool;
  let drafts: StudioDrafts;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database, max: 4 });
    await migrar(pool);
    drafts = new StudioDrafts(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists revisions without modifying history or publishing", async () => {
    const s = scope();
    const first = fixture();
    expect(await drafts.save(s, flowId, 0, first)).toEqual({
      ok: true,
      revision: 1,
      changed: true,
    });
    expect(await drafts.save(s, flowId, 1, first)).toMatchObject({
      ok: true,
      revision: 1,
      changed: false,
    });
    const second = fixture();
    second.flow.name = "Novo nome";
    expect(await drafts.save(s, flowId, 1, second)).toMatchObject({ ok: true, revision: 2 });
    const restarted = new StudioDrafts(pool);
    expect((await restarted.get(s, flowId, 1))?.document.flow.name).toBe(first.flow.name);
    expect((await restarted.get(s, flowId))?.document.flow.name).toBe("Novo nome");
    expect((await restarted.history(s, flowId)).map((r) => r.revision)).toEqual([2, 1]);
    expect((await restarted.history(s, flowId, 2)).map((r) => r.revision)).toEqual([1]);
    const sql = "SELECT 1 FROM flow_bot.flow_versions WHERE workspace_id = $1";
    const published = await pool.query(sql, [s.workspaceId]);
    expect(published.rowCount).toBe(0);
  });

  it("isolates workspaces and environments", async () => {
    const s = scope();
    await drafts.save(s, flowId, 0, fixture());
    expect(await drafts.get(scope(), flowId)).toBeNull();
    expect(await drafts.get({ ...s, environment: "staging" }, flowId)).toBeNull();
    expect(await drafts.history(scope(), flowId)).toEqual([]);
    const staging = await drafts.save({ ...s, environment: "staging" }, flowId, 0, fixture());
    expect(staging).toMatchObject({ ok: true, revision: 1 });
  });

  it("rejects invalid drafts and stale concurrent writes", async () => {
    const s = scope();
    const invalid = fixture();
    invalid.edges = [];
    expect(await drafts.save(s, flowId, 0, invalid)).toMatchObject({
      ok: false,
      error: "invalid_flow",
    });
    const published = fixture();
    published.flow.status = "published";
    expect(await drafts.save(s, flowId, 0, published)).toMatchObject({
      ok: false,
      error: "invalid_draft",
    });
    const other = fixture();
    other.flow.name = "Edição concorrente";
    const results = await Promise.all([
      drafts.save(s, flowId, 0, fixture()),
      drafts.save(s, flowId, 0, other),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, error: "revision_conflict", currentRevision: 1 });
    expect(await drafts.history(s, flowId)).toHaveLength(1);
  });
});
