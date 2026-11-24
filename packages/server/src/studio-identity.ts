import type { StudioScope } from "@flow-bot/store-postgres";

export type StudioPermission = "read" | "write" | "simulate" | "approve";
export type StudioRole = "owner" | "admin" | "editor" | "viewer";
export type StudioIdentity = {
  scope: StudioScope;
  permissions: readonly StudioPermission[];
};

type Membership = {
  workspace_id: string;
  user_id: string;
  role: StudioRole;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: Record<StudioRole, readonly StudioPermission[]> = {
  owner: ["read", "write", "simulate", "approve"],
  admin: ["read", "write", "simulate", "approve"],
  editor: ["read", "write", "simulate"],
  viewer: ["read"],
};

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Adapted from Alvo OS: verified user plus an active membership, never user metadata. */
export function resolveStudioIdentity(
  verifiedUserId: string,
  selectedWorkspace: string,
  memberships: unknown,
  environment: StudioScope["environment"],
): StudioIdentity | null {
  if (!UUID.test(verifiedUserId) || !UUID.test(selectedWorkspace)) return null;
  if (!["test", "staging"].includes(environment)) return null;
  if (!Array.isArray(memberships) || memberships.length !== 1) return null;
  const row = object(memberships[0]);
  if (!row || row.user_id !== verifiedUserId || row.workspace_id !== selectedWorkspace) {
    return null;
  }
  if (typeof row.role !== "string" || !Object.hasOwn(ROLES, row.role)) return null;
  const membership = row as Membership;
  return {
    scope: {
      workspaceId: membership.workspace_id,
      actorId: membership.user_id,
      environment,
    },
    permissions: [...ROLES[membership.role]],
  };
}

type Options = {
  projectUrl: string;
  publishableKey: string;
  environment: StudioScope["environment"];
  fetcher?: typeof fetch;
};

export type IdentityResolver = (
  token: string,
  selectedWorkspace: string,
) => Promise<StudioIdentity | null>;

/** Reads only the existing FlowBot membership table using the verified user's JWT and RLS. */
export function createVerifiedIdentityResolver(options: Options): IdentityResolver {
  const project = new URL(options.projectUrl);
  if (
    project.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(project.hostname) ||
    project.origin !== options.projectUrl ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(options.publishableKey) ||
    !["test", "staging"].includes(options.environment)
  ) {
    throw new Error("invalid_identity_configuration");
  }
  const key = options.publishableKey;
  const environment = options.environment;
  const fetcher = options.fetcher ?? fetch;

  async function get(path: string, token: string): Promise<unknown> {
    const response = await fetcher(project.origin + path, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("identity_provider_unavailable");
    return response.json();
  }

  return async (token, selectedWorkspace) => {
    if (!UUID.test(selectedWorkspace)) return null;
    if (token.length > 4000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
    const user = object(await get("/auth/v1/user", token));
    if (!user || typeof user.id !== "string" || !UUID.test(user.id)) return null;
    if (user.is_anonymous !== false || user.role !== "authenticated") return null;
    const query = new URLSearchParams({
      select: "workspace_id,user_id,role",
      workspace_id: "eq." + selectedWorkspace,
      user_id: "eq." + user.id,
      limit: "2",
    });
    const rows = await get("/rest/v1/flowbot_workspace_members?" + query.toString(), token);
    return resolveStudioIdentity(user.id, selectedWorkspace, rows, environment);
  };
}
