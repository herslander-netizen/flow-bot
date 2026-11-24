#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";

import { StudioApprovals, StudioDrafts } from "@flow-bot/store-postgres";
import pg from "pg";

import { createStudioApi, createStudioBff } from "../dist/index.js";

const { STUDIO_PREVIEW_DATABASE_URL, STUDIO_PREVIEW_CONFIG, STUDIO_PREVIEW_ORIGIN } = process.env;

async function main() {
  if (!STUDIO_PREVIEW_DATABASE_URL || !STUDIO_PREVIEW_CONFIG || !STUDIO_PREVIEW_ORIGIN) {
    throw new Error("preview_configuration_required");
  }
  if (STUDIO_PREVIEW_DATABASE_URL === process.env.DATABASE_URL) {
    throw new Error("preview_database_must_be_separate");
  }
  const operators = JSON.parse(readFileSync(STUDIO_PREVIEW_CONFIG, "utf8"));
  if (!Array.isArray(operators) || !operators.length || operators.length > 50) {
    throw new Error("invalid_operators");
  }
  const permissions = ["read", "write", "simulate", "approve"];
  for (const operator of operators) {
    if (
      !Array.isArray(operator.permissions) ||
      operator.permissions.some((permission) => !permissions.includes(permission))
    ) {
      throw new Error("invalid_permissions");
    }
  }

  const pool = new pg.Pool({ connectionString: STUDIO_PREVIEW_DATABASE_URL, max: 4 });
  const api = createStudioApi({
    drafts: new StudioDrafts(pool),
    approvals: new StudioApprovals(pool),
    principals: operators.map((operator) => ({
      actorId: operator.actorId,
      workspaceId: operator.workspaceId,
      environment: operator.environment,
      token: operator.serviceToken,
      permissions: operator.permissions,
    })),
  });
  const bff = createStudioBff({
    origin: STUDIO_PREVIEW_ORIGIN,
    upstream: "http://127.0.0.1:4175",
    operators,
  });
  const stop = () => {
    bff.close();
    api.close();
    void pool.end();
  };
  api.on("error", stop);
  bff.on("error", stop);
  try {
    await pool.query("SELECT 1 FROM flow_bot.studio_draft_revisions LIMIT 1");
    await pool.query("SELECT 1 FROM flow_bot.studio_draft_approvals LIMIT 1");
    api.listen(4175, "127.0.0.1", () => {
      bff.listen(4176, "127.0.0.1", () => console.log("Studio preview: loopback 4176"));
    });
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } catch (error) {
    stop();
    throw error;
  }
}

main().catch(() => {
  console.error("Studio preview startup failed. Check isolated database and configuration.");
  process.exitCode = 1;
});
