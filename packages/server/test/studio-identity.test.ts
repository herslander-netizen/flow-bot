import { describe, expect, it, vi } from "vitest";

import { createVerifiedIdentityResolver, resolveStudioIdentity } from "../src/studio-identity.js";

const actor = "00000000-0000-4000-8000-000000000001";
const workspace = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const token = "header.payload.signature";
const projectUrl = "https://example.supabase.co";
const publishableKey = "sb_publishable_example";
const user = { id: actor, role: "authenticated", is_anonymous: false };
const member = { user_id: actor, workspace_id: workspace, role: "editor" };

function resolver(fetcher: typeof fetch) {
  return createVerifiedIdentityResolver({
    projectUrl,
    publishableKey,
    environment: "test",
    fetcher,
  });
}

describe("Studio verified identity", () => {
  it("uses the existing workspace roles without granting approval to editors", () => {
    const result = resolveStudioIdentity(actor, workspace, [member], "test");
    expect(result).toEqual({
      scope: { actorId: actor, workspaceId: workspace, environment: "test" },
      permissions: ["read", "write", "simulate"],
    });
    const viewer = { ...member, role: "viewer" };
    expect(resolveStudioIdentity(actor, workspace, [viewer], "test")?.permissions).toEqual([
      "read",
    ]);
    const admin = { ...member, role: "admin" };
    expect(resolveStudioIdentity(actor, workspace, [admin], "test")?.permissions).toContain(
      "approve",
    );
  });

  it("rejects missing, ambiguous, foreign and unknown-role memberships", () => {
    for (const rows of [
      [],
      [member, member],
      [{ ...member, user_id: other }],
      [{ ...member, workspace_id: other }],
      [{ ...member, role: "superuser" }],
      [{ ...member, role: "__proto__" }],
    ]) {
      expect(resolveStudioIdentity(actor, workspace, rows, "test")).toBeNull();
    }
    expect(resolveStudioIdentity(actor, other, [member], "test")).toBeNull();
  });

  it("verifies the user and rechecks membership for every request", async () => {
    const request = vi.fn<typeof fetch>();
    request.mockResolvedValueOnce(Response.json(user));
    request.mockResolvedValueOnce(Response.json([member]));
    request.mockResolvedValueOnce(Response.json(user));
    request.mockResolvedValueOnce(Response.json([]));
    const resolve = resolver(request);
    expect(await resolve(token, workspace)).toMatchObject({
      scope: { actorId: actor, workspaceId: workspace },
    });
    expect(await resolve(token, workspace)).toBeNull();
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[0]?.[0]).toBe(projectUrl + "/auth/v1/user");
    const membershipUrl = new URL(String(request.mock.calls[1]?.[0]));
    expect(membershipUrl.pathname).toBe("/rest/v1/flowbot_workspace_members");
    expect(membershipUrl.searchParams.get("workspace_id")).toBe("eq." + workspace);
    expect(membershipUrl.searchParams.get("user_id")).toBe("eq." + actor);
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer " + token, apikey: publishableKey },
      redirect: "error",
    });
  });

  it("fails closed for invalid sessions, anonymous users and provider errors", async () => {
    const request = vi.fn<typeof fetch>();
    request.mockResolvedValueOnce(new Response(null, { status: 401 }));
    request.mockResolvedValueOnce(Response.json({ ...user, is_anonymous: true }));
    request.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const resolve = resolver(request);
    expect(await resolve(token, workspace)).toBeNull();
    expect(await resolve(token, workspace)).toBeNull();
    await expect(resolve(token, workspace)).rejects.toThrow("identity_provider_unavailable");
    expect(await resolve("not-a-jwt", workspace)).toBeNull();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("rejects untrusted origins and privileged keys", () => {
    const options = {
      projectUrl,
      publishableKey,
      environment: "test" as const,
    };
    expect(() => createVerifiedIdentityResolver({ ...options, projectUrl: "http://localhost" }))
      .toThrow();
    expect(() => {
      createVerifiedIdentityResolver({ ...options, publishableKey: "sb_secret_example" });
    }).toThrow();
  });
});
