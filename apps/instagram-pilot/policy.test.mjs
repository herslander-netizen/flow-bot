import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature, plan } from "./policy.mjs";

const now = 2_000_000_000_000;
const config = { accountId: "123", mediaAllowlist: ["456"], keyword: "MARCA", privateReply: "Aqui está o material.", publicReply: "Enviei no direct.", dmReply: "Como posso ajudar?" };
const event = { kind: "comment", accountId: "123", sender: "789", sourceId: "321", mediaId: "456", mediaType: "FEED", text: " marca ", echo: false };
const state = { accountId: "123", sender: "789", human: false, optOut: false, usedKeys: [], verifiedCommentId: "321", verifiedCommentAt: now - 1000 };
test("HMAC valida bytes originais e rejeita adulteração", () => {
  const raw = Buffer.from("{}");
  const secret = "synthetic-secret";
  const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifySignature(raw, signature, secret), true);
  assert.equal(verifySignature(Buffer.from("{ }"), signature, secret), false);
  assert.equal(verifySignature(raw, "sha256=bad", secret), false);
});
test("intenção privada antes de confirmação pública", () => {
  const [intent] = plan(event, state, config, now);
  assert.equal(intent.kind, "private_reply");
  assert.equal(intent.mode, "review-only");
  assert.deepEqual(plan(event, { ...state, usedKeys: [intent.key], privateDeliveryConfirmed: true }, config, now).map((x) => x.kind), ["public_reply"]);
});
test("bloqueia duplicatas, humano, opt-out, estado de outro usuário e expiração", () => {
  const [intent] = plan(event, state, config, now);
  for (const blocked of [{ ...state, usedKeys: [intent.key] }, { ...state, human: true }, { ...state, optOut: true }, { ...state, sender: "999" }, { ...state, verifiedCommentAt: now - 7 * 86400000 }]) {
    assert.deepEqual(plan(event, blocked, config, now), []);
  }
  assert.deepEqual(plan({ ...event, echo: true }, state, config, now), []);
  assert.deepEqual(plan({ ...event, mediaId: "999" }, state, config, now), []);
});
test("DM exige inbound recente e não responde a opt-out", () => {
  const dm = { ...event, kind: "dm", sourceId: "m1", text: "oi", at: now - 1000 };
  const dmState = { ...state, lastInboundAt: now - 1000 };
  assert.equal(plan(dm, dmState, config, now).length, 1);
  assert.deepEqual(plan({ ...dm, text: "SAIR" }, dmState, config, now), []);
  assert.deepEqual(plan({ ...dm, at: now - 86400000 }, dmState, config, now), []);
});
