import { createHmac, timingSafeEqual } from "node:crypto";

const DAY = 86_400_000;
const isId = (x) => typeof x === "string" && /^\d{1,40}$/.test(x);
const isText = (x) => typeof x === "string" && x.trim().length > 0;
const normalize = (x) => x.normalize("NFKC").trim().toLocaleUpperCase("pt-BR");
const recent = (at, now, limit) =>
  Number.isSafeInteger(at) && Number.isSafeInteger(now) && at <= now && now - at < limit;

export function verifySignature(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || raw.length > 256 * 1024 || !isText(secret)) return false;
  if (typeof signature !== "string" || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(raw).digest(), Buffer.from(signature.slice(7), "hex"));
}

// Review-only pilot. No network, credentials, persistence or dispatch.
// Input must be normalized by a verified server-side adapter.
// The trusted state must be scoped to this exact account and sender.
export function plan(event, state, config, now) {
  if (!event || !state || !config || !isId(config.accountId) || event.accountId !== config.accountId ||
      state.accountId !== event.accountId || state.sender !== event.sender || !isId(event.sender) ||
      event.sender === config.accountId || event.echo !== false || state.human !== false ||
      state.optOut !== false || !Array.isArray(state.usedKeys) || !isText(event.sourceId) ||
      !isText(event.text) || !Number.isSafeInteger(now)) return [];
  if (["SAIR", "PARAR", "STOP", "CANCELAR"].includes(normalize(event.text))) return [];
  const intents = [];
  const add = (kind, path, body) => {
    const key = JSON.stringify([event.accountId, event.sourceId, kind]);
    if (!state.usedKeys.includes(key)) intents.push({ mode: "review-only", key, kind, path, body });
  };
  if (event.kind === "comment") {
    if (!isId(event.sourceId) || !isId(event.mediaId) || !["FEED", "REELS"].includes(event.mediaType) ||
        !Array.isArray(config.mediaAllowlist) || !config.mediaAllowlist.includes(event.mediaId) ||
        !isText(config.keyword) || normalize(event.text) !== normalize(config.keyword) ||
        state.verifiedCommentId !== event.sourceId || !recent(state.verifiedCommentAt, now, 7 * DAY)) return [];
    if (state.privateDeliveryConfirmed === true) {
      if (isText(config.publicReply)) add("public_reply", `/${event.sourceId}/replies`, { message: config.publicReply });
    } else if (isText(config.privateReply)) {
      add("private_reply", `/${event.accountId}/messages`, { recipient: { comment_id: event.sourceId }, message: { text: config.privateReply } });
    }
  } else if (event.kind === "dm") {
    if (!recent(event.at, now, DAY) || !recent(state.lastInboundAt, now, DAY) ||
        state.lastInboundAt < event.at || !isText(config.dmReply)) return [];
    add("dm_reply", `/${event.accountId}/messages`, { recipient: { id: event.sender }, message: { text: config.dmReply } });
  }
  return intents;
}
