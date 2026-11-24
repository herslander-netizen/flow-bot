import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import process from "node:process";

import { migrar, StudioApprovals, StudioDrafts } from "@flow-bot/store-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStudioApi } from "../src/studio-api.js";

const database = process.env["DATABASE_URL"];
const fixture = () =>
  JSON.parse(
    readFileSync(new URL("../../../examples/boas-vindas-menu.json", import.meta.url), "utf8"),
  );
const scope = {
  workspaceId: "studio-api-" + randomUUID(),
  environment: "test" as const,
  actorId: "reviewer-test",
};
const writer = "writer-" + randomUUID();
const reader = "reader-" + randomUUID();
const outsider = "outsider-" + randomUUID();
const path = "/studio/v1/flows/boas-vindas-menu";
const scenarios = {
  scenarios: [
    {
      name: "Atendimento",
      steps: [{ say: "oi", expect: { status: "waiting_input" } }],
    },
  ],
};

describe.skipIf(!database)("Private Studio API", () => {
  let pool: pg.Pool;
  let server: ReturnType<typeof createStudioApi>;
  let url: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database });
    await migrar(pool);
    server = createStudioApi({
      drafts: new StudioDrafts(pool),
      approvals: new StudioApprovals(pool),
      principals: [
        { ...scope, token: writer, permissions: ["read", "write", "simulate", "approve"] },
        { ...scope, token: reader, permissions: ["read"] },
        { ...scope, workspaceId: "other-" + randomUUID(), token: outsider, permissions: ["read"] },
      ],
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  function call(route: string, token: string, method = "GET", data?: unknown) {
    return fetch(url + route, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  }

  it("protects private routes and completes authoring without a publisher", async () => {
    const draft = { expectedRevision: 0, document: fixture() };
    expect((await call(path + "/draft", "invalid")).status).toBe(401);
    expect((await call(path + "/draft", reader, "PUT", draft)).status).toBe(403);
    const spoof = { ...draft, workspaceId: "another" };
    expect((await call(path + "/draft", writer, "PUT", spoof)).status).toBe(400);
    expect((await call(path + "/draft", writer, "PUT", draft)).status).toBe(200);
    expect((await call(path + "/draft", outsider)).status).toBe(404);
    const read = await call(path + "/draft", reader);
    expect(await read.json()).toMatchObject({ revision: 1 });
    expect((await call(path + "/draft", writer, "PUT", draft)).status).toBe(409);

    const simulation = await call(path + "/simulate", writer, "POST", {
      revision: 1,
      scenarios,
    });
    expect(await simulation.json()).toMatchObject({ ok: true, scenariosPassed: true });
    const approval = { revision: 1, confirmation: true, scenarios };
    expect((await call(path + "/approval", reader, "POST", approval)).status).toBe(403);
    expect((await call(path + "/approval", writer, "POST", approval)).status).toBe(200);
    const current = await call(path + "/approval", reader);
    expect(await current.json()).toMatchObject({ approved: true, published: false });

    const history = await call(path + "/history", reader);
    expect(await history.json()).toMatchObject([{ revision: 1 }]);
    expect((await call(path + "/publish", writer, "POST", {})).status).toBe(404);
    expect((await call("/webhooks/evolution", writer, "POST", {})).status).toBe(404);
    const sql = "SELECT 1 FROM flow_bot.flow_versions WHERE workspace_id = $1";
    expect((await pool.query(sql, [scope.workspaceId])).rowCount).toBe(0);
  });

  it("rechecks managed membership and rejects static credentials in managed mode", async () => {
    const managedScope = { ...scope, workspaceId: randomUUID(), actorId: randomUUID() };
    let permitted = true;
    const managed = createStudioApi({
      drafts: new StudioDrafts(pool),
      approvals: new StudioApprovals(pool),
      resolveIdentity: async (token, selected) => {
        if (!permitted || token !== "verified" || selected !== managedScope.workspaceId) {
          return null;
        }
        return { scope: managedScope, permissions: ["read", "write", "simulate"] };
      },
    });
    await new Promise<void>((resolve) => managed.listen(0, "127.0.0.1", resolve));
    const address = managed.address() as AddressInfo;
    const base = "http://127.0.0.1:" + address.port + path;
    const headers = {
      Authorization: "Bearer verified",
      "X-Studio-Workspace": managedScope.workspaceId,
      "Content-Type": "application/json",
    };
    try {
      const draft = JSON.stringify({ expectedRevision: 0, document: fixture() });
      const saved = await fetch(base + "/draft", { method: "PUT", headers, body: draft });
      expect(saved.status).toBe(200);
      const stored = await fetch(base + "/draft", { headers });
      expect(await stored.json()).toMatchObject({ revision: 1, actor_id: managedScope.actorId });
      const foreign = { ...headers, "X-Studio-Workspace": scope.workspaceId };
      expect((await fetch(base + "/draft", { headers: foreign })).status).toBe(401);
      const staticHeaders = { ...headers, Authorization: "Bearer " + writer };
      expect((await fetch(base + "/draft", { headers: staticHeaders })).status).toBe(401);
      const review = JSON.stringify({ revision: 1, confirmation: true, scenarios });
      const denied = await fetch(base + "/approval", { method: "POST", headers, body: review });
      expect(denied.status).toBe(403);
      permitted = false;
      expect((await fetch(base + "/draft", { headers })).status).toBe(401);
    } finally {
      await new Promise<void>((resolve) => managed.close(() => resolve()));
    }
  });
});
