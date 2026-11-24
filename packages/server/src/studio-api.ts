import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { StudioApprovals, StudioDrafts, StudioScope } from "@flow-bot/store-postgres";

import type { IdentityResolver, StudioPermission } from "./studio-identity.js";
import { avaliarRascunhoStudio } from "./studio-offline.js";

export type StudioPrincipal = StudioScope & {
  token: string;
  permissions: readonly StudioPermission[];
};
type Dependencies = {
  drafts: Pick<StudioDrafts, "save" | "get" | "history">;
  approvals: Pick<StudioApprovals, "approve" | "current">;
} & (
  | { principals: readonly StudioPrincipal[]; resolveIdentity?: never }
  | { resolveIdentity: IdentityResolver; principals?: never }
);

const MAX_BODY = 1024 * 1024;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function reply(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
    throw new Error("invalid_body");
  }
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY) throw new Error("body_too_large");
    parts.push(part);
  }
  let result: unknown;
  try {
    result = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new Error("invalid_body");
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("invalid_body");
  }
  return result as Record<string, unknown>;
}

function revision(value: unknown, allowZero = false): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > 2147483647
  ) {
    throw new Error("invalid_revision");
  }
  return value;
}

function fields(input: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new Error("invalid_body");
  }
}

/** Separate authoring server. Bind only to a private interface behind a trusted BFF. */
export function createStudioApi(deps: Dependencies) {
  if (deps.resolveIdentity && deps.principals) throw new Error("studio_auth_mode_conflict");
  if (!deps.resolveIdentity && !deps.principals?.length) throw new Error("studio_auth_required");
  const tokens = new Set<string>();
  const principals = (deps.principals ?? []).map((p) => {
    if (
      p.token.length < 32 ||
      tokens.has(p.token) ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(p.workspaceId) ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(p.actorId) ||
      !["test", "staging"].includes(p.environment)
    ) {
      throw new Error("studio_principal_invalid");
    }
    tokens.add(p.token);
    const scope: StudioScope = {
      workspaceId: p.workspaceId,
      environment: p.environment,
      actorId: p.actorId,
    };
    return { scope, permissions: [...p.permissions], digest: digest(p.token) };
  });

  return createServer(async (req, res) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ") || header.length > 4096) {
        return reply(res, 401, { error: "unauthorized" });
      }
      const token = header.slice(7);
      const selected = req.headers["x-studio-workspace"];
      const principal = deps.resolveIdentity
        ? await deps.resolveIdentity(token, typeof selected === "string" ? selected : "")
        : principals.find((p) => timingSafeEqual(p.digest, digest(token)));
      if (!principal) return reply(res, 401, { error: "unauthorized" });
      const { scope, permissions } = principal;
      const url = new URL(req.url ?? "/", "http://localhost");
      const match = /^\/studio\/v1\/flows\/([A-Za-z0-9_-]{1,80})\/([a-z]+)$/.exec(url.pathname);
      const flowId = match?.[1];
      const action = match?.[2];
      if (!flowId || !action || !["draft", "history", "simulate", "approval"].includes(action)) {
        return reply(res, 404, { error: "not_found" });
      }

      const method = req.method;
      let permission: StudioPermission;
      if (method === "GET" && ["draft", "history", "approval"].includes(action)) {
        permission = "read";
      } else if (method === "PUT" && action === "draft") {
        permission = "write";
      } else if (method === "POST" && action === "simulate") {
        permission = "simulate";
      } else if (method === "POST" && action === "approval") {
        permission = "approve";
      } else {
        return reply(res, 405, { error: "method_not_allowed" });
      }
      if (!permissions.includes(permission)) return reply(res, 403, { error: "forbidden" });

      const queryKey = action === "draft" && method === "GET" ? "revision" : "before";
      const allowsQuery = method === "GET" && ["draft", "history"].includes(action);
      for (const key of url.searchParams.keys()) {
        if (!allowsQuery || key !== queryKey || url.searchParams.getAll(key).length !== 1) {
          throw new Error("invalid_query");
        }
      }
      const value = url.searchParams.get(queryKey);
      const cursor = value === null ? undefined : revision(Number(value));
      if (method === "GET") {
        if (action === "history")
          return reply(res, 200, await deps.drafts.history(scope, flowId, cursor));
        const data =
          action === "draft"
            ? await deps.drafts.get(scope, flowId, cursor)
            : await deps.approvals.current(scope, flowId);
        return reply(res, data ? 200 : 404, data ?? { error: "not_found" });
      }

      const input = await body(req);
      if (action === "draft") {
        fields(input, ["expectedRevision", "document"]);
        const expected = revision(input.expectedRevision, true);
        const result = await deps.drafts.save(scope, flowId, expected, input.document);
        const status = result.ok ? 200 : result.error === "revision_conflict" ? 409 : 422;
        return reply(res, status, result);
      }
      if (action === "simulate") {
        fields(input, ["revision", "scenarios", "baseRevision"]);
        const selected = await deps.drafts.get(scope, flowId, revision(input.revision));
        if (!selected) return reply(res, 404, { error: "not_found" });
        const base =
          input.baseRevision === undefined
            ? null
            : await deps.drafts.get(scope, flowId, revision(input.baseRevision));
        if (input.baseRevision !== undefined && !base) {
          return reply(res, 404, { error: "not_found" });
        }
        const result = avaliarRascunhoStudio({
          draft: selected.document,
          scenarios: input.scenarios,
          ...(base ? { base: base.document } : {}),
        });
        return reply(res, result.ok ? 200 : 422, result);
      }
      fields(input, ["revision", "confirmation", "scenarios"]);
      const result = await deps.approvals.approve(
        { ...scope, canApprove: true },
        flowId,
        revision(input.revision),
        input.confirmation === true,
        input.scenarios,
      );
      if (result.ok) return reply(res, 200, result);
      const conflict = ["revision_conflict", "already_approved"].includes(result.error);
      return reply(res, conflict ? 409 : 422, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (["invalid_body", "invalid_revision", "invalid_query"].includes(message)) {
        return reply(res, 400, { error: message });
      }
      if (message === "body_too_large") return reply(res, 413, { error: message });
      return reply(res, 500, { error: "internal_error" });
    }
  });
}
