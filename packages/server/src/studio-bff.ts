import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createStudioSessions, type StudioOperator } from "./studio-session.js";

const COOKIE = "__Host-flowbot-studio";
const MAX_BODY = 1024 * 1024;

function reply(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

function sessionId(req: IncomingMessage) {
  const cookies = (req.headers.cookie ?? "").split(";").map((item) => item.trim());
  const entries = cookies.filter((item) => item.startsWith(COOKIE + "="));
  if (entries.length !== 1) return "";
  const id = entries[0]?.slice(COOKIE.length + 1) ?? "";
  return /^[a-f0-9]{64}$/.test(id) ? id : "";
}

function cookie(id: string, maxAge: number) {
  return COOKIE + "=" + id + "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=" + maxAge;
}

async function readBody(req: IncomingMessage, max: number) {
  const parts: Buffer[] = [];
  let size = 0;
  if (req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
    throw new Error("invalid_body");
  }
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const part = Buffer.from(chunk);
    size += part.length;
    if (size > max) throw new Error("body_too_large");
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}

type Options = {
  origin: string;
  upstream: string;
  operators: readonly StudioOperator[];
  now?: () => number;
};

/** Preview only. Serve through a same-origin HTTPS reverse proxy, not directly on the internet. */
export function createStudioBff(options: Options) {
  const origin = new URL(options.origin);
  const upstream = new URL(options.upstream);
  if (origin.protocol !== "https:" || origin.origin !== options.origin) {
    throw new Error("https_origin_required");
  }
  if (
    upstream.protocol !== "http:" ||
    upstream.hostname !== "127.0.0.1" ||
    upstream.origin !== options.upstream ||
    !upstream.port
  ) {
    throw new Error("loopback_upstream_required");
  }
  const sessions = createStudioSessions(options.operators, options.now);

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", origin);
      if (url.origin !== origin.origin) return reply(res, 400, { error: "invalid_url" });
      const method = req.method;
      if (method !== "GET" && req.headers.origin !== origin.origin) {
        return reply(res, 403, { error: "origin_forbidden" });
      }
      const id = sessionId(req);
      if (url.pathname === "/studio/session" && !url.search) {
        if (method === "POST") {
          const input = JSON.parse(await readBody(req, 4096)) as unknown;
          if (!input || typeof input !== "object" || Array.isArray(input)) {
            return reply(res, 400, { error: "invalid_body" });
          }
          const fields = input as Record<string, unknown>;
          if (Object.keys(fields).some((key) => !["username", "password"].includes(key))) {
            return reply(res, 400, { error: "invalid_body" });
          }
          const result = await sessions.login(fields.username, fields.password);
          if (!result.ok) {
            const status = result.error === "rate_limited" ? 429 : 401;
            return reply(res, status, { error: result.error });
          }
          sessions.logout(id);
          res.setHeader("Set-Cookie", cookie(result.id, result.expiresIn));
          return reply(res, 200, { ok: true });
        }
        if (method === "DELETE") {
          sessions.logout(id);
          res.setHeader("Set-Cookie", cookie("", 0));
          return reply(res, 200, { ok: true });
        }
        if (method === "GET") {
          const user = sessions.get(id);
          if (!user) return reply(res, 401, { error: "session_expired" });
          return reply(res, 200, {
            actorId: user.actorId,
            workspaceId: user.workspaceId,
            environment: user.environment,
          });
        }
        return reply(res, 405, { error: "method_not_allowed" });
      }

      const pattern = /^\/studio\/v1\/flows\/([A-Za-z0-9_-]{1,80})\/(draft|history|simulate|approval)$/;
      const action = pattern.exec(url.pathname)?.[2];
      if (!action) return reply(res, 404, { error: "not_found" });
      const operator = sessions.get(id);
      if (!operator) return reply(res, 401, { error: "session_expired" });
      const allowed =
        (method === "GET" && ["draft", "history", "approval"].includes(action)) ||
        (method === "PUT" && action === "draft") ||
        (method === "POST" && ["simulate", "approval"].includes(action));
      if (!allowed) return reply(res, 405, { error: "method_not_allowed" });
      const payload = method === "GET" ? undefined : await readBody(req, MAX_BODY);
      const result = await fetch(upstream.origin + url.pathname + url.search, {
        method,
        headers: {
          Authorization: "Bearer " + operator.serviceToken,
          "Content-Type": "application/json",
        },
        ...(payload === undefined ? {} : { body: payload }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      const data: unknown = await result.json();
      return reply(res, result.status, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (error instanceof SyntaxError || message === "invalid_body") {
        return reply(res, 400, { error: "invalid_body" });
      }
      if (message === "body_too_large") {
        return reply(res, 413, { error: "body_too_large" });
      }
      return reply(res, 502, { error: "service_unavailable" });
    }
  });
}
