import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const SESSION_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 500;
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000;

export type StudioOperator = {
  username: string;
  actorId: string;
  workspaceId: string;
  environment: "test" | "staging";
  salt: string;
  passwordHash: string;
  serviceToken: string;
};

type Session = { operator: StudioOperator; expires: number };

/** Isolated, short-lived sessions for a single preview process, not a distributed auth system. */
export function createStudioSessions(
  configured: readonly StudioOperator[],
  now: () => number = Date.now,
) {
  const operators = new Map<string, StudioOperator>();
  const tokens = new Set<string>();
  const identities = new Set<string>();
  for (const operator of configured) {
    const identity = [operator.workspaceId, operator.environment, operator.actorId].join(":");
    if (
      !/^[A-Za-z0-9_.-]{1,80}$/.test(operator.username) ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(operator.actorId) ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(operator.workspaceId) ||
      !["test", "staging"].includes(operator.environment) ||
      !/^[a-f0-9]{32,128}$/.test(operator.salt) ||
      !/^[a-f0-9]{128}$/.test(operator.passwordHash) ||
      operator.serviceToken.length < 32 ||
      operators.has(operator.username) ||
      tokens.has(operator.serviceToken) ||
      identities.has(identity)
    ) {
      throw new Error("invalid_operator_configuration");
    }
    operators.set(operator.username, { ...operator });
    tokens.add(operator.serviceToken);
    identities.add(identity);
  }
  if (!operators.size) throw new Error("operators_required");

  const sessions = new Map<string, Session>();
  const dummySalt = randomBytes(16);
  let windowStart = now();
  let attempts = 0;
  let pending = 0;

  function prune() {
    for (const [id, session] of sessions) {
      if (session.expires <= now()) sessions.delete(id);
    }
  }

  return {
    async login(username: unknown, password: unknown) {
      if (now() - windowStart >= WINDOW_MS) {
        windowStart = now();
        attempts = 0;
      }
      if (attempts >= MAX_ATTEMPTS || pending >= 2) {
        return { ok: false as const, error: "rate_limited" };
      }
      attempts++;
      if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        username.length > 80 ||
        password.length > 256 ||
        !password.length
      ) {
        return { ok: false as const, error: "invalid_credentials" };
      }
      const operator = operators.get(username);
      const salt = operator ? Buffer.from(operator.salt, "hex") : dummySalt;
      const expected = Buffer.from(operator?.passwordHash ?? "0".repeat(128), "hex");
      pending++;
      try {
        const actual = (await derive(password, salt, 64)) as Buffer;
        if (!timingSafeEqual(expected, actual) || !operator) {
          return { ok: false as const, error: "invalid_credentials" };
        }
        prune();
        if (sessions.size >= MAX_SESSIONS) {
          return { ok: false as const, error: "rate_limited" };
        }
        const id = randomBytes(32).toString("hex");
        sessions.set(id, { operator, expires: now() + SESSION_MS });
        return { ok: true as const, id, expiresIn: SESSION_MS / 1000 };
      } finally {
        pending--;
      }
    },
    get(id: string) {
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expires <= now()) {
        sessions.delete(id);
        return null;
      }
      return session.operator;
    },
    logout(id: string) {
      sessions.delete(id);
    },
  };
}
