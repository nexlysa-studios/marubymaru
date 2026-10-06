import { Webhook } from "npm:svix@1.76.1";
import { createResendWebhookHandler } from "../functions/_shared/resend-webhook-handler.ts";

const secret = "whsec_" + btoa("fake-test-secret-not-a-real-key");
const webhook = new Webhook(secret);
const body = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: "provider-test" } });
function request(raw = body, timestamp = new Date(), signature?: string) {
  return new Request("https://example.test/webhook", { method: "POST", body: raw, headers: {
    "svix-id": "msg_test", "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature ?? webhook.sign("msg_test", timestamp, body),
  } });
}
function fixture(fail = false) {
  const recorded: string[][] = [];
  const handler = createResendWebhookHandler({ verify: (raw, headers) => webhook.verify(raw, headers),
    record: async (...args) => { if (fail) throw new Error("DB down"); recorded.push(args); } });
  return { handler, recorded };
}
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
Deno.test("signed Resend event records delivery", async () => {
  const { handler, recorded } = fixture();
  assert((await handler(request())).status === 200, "Expected success");
  assert(recorded.length === 1 && recorded[0][2] === "delivered", "Expected delivery record");
});
Deno.test("forged webhook is rejected without database access", async () => {
  const { handler, recorded } = fixture();
  assert((await handler(request(body, new Date(), "v1,ZmFrZQ=="))).status === 400, "Expected rejection");
  assert(recorded.length === 0, "Unexpected database write");
});
Deno.test("tampered signed payload is rejected", async () => {
  const { handler, recorded } = fixture();
  assert((await handler(request(body.replace("provider-test", "another-id")))).status === 400, "Expected rejection");
  assert(recorded.length === 0, "Unexpected database write");
});
Deno.test("expired signed payload is rejected", async () => {
  const { handler } = fixture();
  assert((await handler(request(body, new Date(Date.now() - 600000)))).status === 400, "Expected expiration");
});
Deno.test("database failure tells Resend to retry", async () => {
  const { handler } = fixture(true);
  assert((await handler(request())).status === 503, "Expected retry response");
});
