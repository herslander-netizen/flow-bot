import { randomBytes, scryptSync } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { createStudioBff } from "../src/studio-bff.js";
import { createStudioSessions } from "../src/studio-session.js";

function operator() {
  const salt = randomBytes(16);
  return {
    username: "operator",
    actorId: "actor-test",
    workspaceId: "workspace-test",
    environment: "test" as const,
    salt: salt.toString("hex"),
    passwordHash: scryptSync("test-password", salt, 64).toString("hex"),
    serviceToken: randomBytes(32).toString("hex"),
  };
}

describe("Studio operator sessions", () => {
  it("rejects invalid credentials, expires sessions and supports logout", async () => {
    let now = 0;
    const sessions = createStudioSessions([operator()], () => now);
    expect(await sessions.login("unknown", "test-password")).toMatchObject({ ok: false });
    expect(await sessions.login("operator", "wrong")).toMatchObject({ ok: false });
    const result = await sessions.login("operator", "test-password");
    if (!result.ok) throw new Error("expected login");
    expect(sessions.get(result.id)?.workspaceId).toBe("workspace-test");
    sessions.logout(result.id);
    expect(sessions.get(result.id)).toBeNull();
    const next = await sessions.login("operator", "test-password");
    if (!next.ok) throw new Error("expected login");
    now += 30 * 60 * 1000;
    expect(sessions.get(next.id)).toBeNull();
  });

  it("does not permit duplicate backend credentials or identities", () => {
    const user = operator();
    expect(() => createStudioSessions([user, { ...user, username: "other" }])).toThrow();
  });

  it("proxies only authoring routes with a server-side token", async () => {
    const user = operator();
    let received = "";
    const upstream = createServer((req, res) => {
      received = req.headers.authorization ?? "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const target = "http://127.0.0.1:" + (upstream.address() as AddressInfo).port;
    const origin = "https://studio.example.test";
    const bff = createStudioBff({ origin, upstream: target, operators: [user] });
    await new Promise<void>((resolve) => bff.listen(0, "127.0.0.1", resolve));
    const base = "http://127.0.0.1:" + (bff.address() as AddressInfo).port;
    const path = "/studio/v1/flows/example/draft";
    try {
      expect((await fetch(base + path)).status).toBe(401);
      const input = JSON.stringify({ username: "operator", password: "test-password" });
      const headers = { Origin: origin, "Content-Type": "application/json" };
      const login = await fetch(base + "/studio/session", {
        method: "POST",
        headers,
        body: input,
      });
      expect(login.status).toBe(200);
      const setCookie = login.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("Secure; HttpOnly; SameSite=Strict");
      expect(await login.json()).toEqual({ ok: true });
      const Cookie = setCookie.split(";")[0] ?? "";
      expect((await fetch(base + path, { headers: { Cookie } })).status).toBe(200);
      expect(received).toBe("Bearer " + user.serviceToken);
      const blocked = await fetch(base + path, {
        method: "PUT",
        headers: { ...headers, Origin: "https://other.example.test", Cookie },
        body: "{}",
      });
      expect(blocked.status).toBe(403);
      const publish = "/studio/v1/flows/example/publish";
      expect((await fetch(base + publish, { headers: { Cookie } })).status).toBe(404);
      const logout = await fetch(base + "/studio/session", {
        method: "DELETE",
        headers: { Origin: origin, Cookie },
      });
      expect(logout.status).toBe(200);
      expect((await fetch(base + path, { headers: { Cookie } })).status).toBe(401);
    } finally {
      await new Promise<void>((resolve) => bff.close(() => resolve()));
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});
