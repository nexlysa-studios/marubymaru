// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildOrderCancellation, processOrderCancellation, type CancellationJob } from "../../supabase/functions/_shared/order-cancellation";
import type { MarketingSettings } from "../../supabase/functions/_shared/marketing-email";
const settings: MarketingSettings = { from: "Maru <orders@example.test>", replyTo: "care@example.test", contact: "marubymaru@icloud.com", address: "", site: "https://example.test", unsubscribeEndpoint: "" };
const snapshot = { order_number: "MBM-TEST", first_name: "<Reader>", email: "reader@example.test", total: 749, created_at: "2026-11-20T12:00:00Z" };
const job = (): CancellationJob => ({ id: "expiry-test", lock_token: "lease", attempts: 1, first_attempt_at: null, snapshot, payload: null });
const deps = () => ({ settings, apiKey: "fixture", now: () => Date.parse("2026-11-20T12:20:00Z"), fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "provider-test" }))), prepare: vi.fn().mockResolvedValue(undefined), allowed: vi.fn().mockResolvedValue(true), complete: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined) });
describe("automatic cancellation email", () => {
 it("explains the deadline and reason without offering payment on the cancelled order", () => {
  const mail=buildOrderCancellation(snapshot,settings);expect(mail.to).toEqual([snapshot.email]);expect(mail.text).toContain("48-hour payment window");expect(mail.text).toContain("automatically cancelled");expect(mail.text).toContain("already paid");expect(mail.html).toContain("&lt;Reader&gt;");expect(mail.html).not.toContain("/payment/reminder");expect(mail.headers).toEqual({});
 });
 it("persists one immutable message before sending", async () => {
  const d=deps();await processOrderCancellation(job(),d);expect(d.prepare).toHaveBeenCalledOnce();expect(d.prepare.mock.invocationCallOrder[0]).toBeLessThan(d.fetch.mock.invocationCallOrder[0]);expect(d.complete).toHaveBeenCalledWith("provider-test");
 });
 it("suppresses sending if a late payment was confirmed", async () => {
  const d=deps();d.allowed.mockResolvedValue(false);await processOrderCancellation(job(),d);expect(d.fetch).not.toHaveBeenCalled();expect(d.fail).toHaveBeenCalledWith("skipped","Order payment or cancellation status changed.",expect.any(String));
 });
 it("keeps the same content and idempotency key on retries", async () => {
  const d=deps(),payload=buildOrderCancellation(snapshot,settings);await processOrderCancellation({...job(),snapshot:{...snapshot,email:"changed@example.test"},payload},d);expect(d.prepare).not.toHaveBeenCalled();expect(JSON.parse(String(d.fetch.mock.calls[0][1]?.body))).toEqual(payload);expect(d.fetch.mock.calls[0][1]?.headers).toHaveProperty("Idempotency-Key","maru-newsletter/expiry-test");
 });
 it("stops retries before idempotency expires", async () => {
  const d=deps();await processOrderCancellation({...job(),first_attempt_at:"2026-11-19T12:00:00Z"},d);expect(d.fetch).not.toHaveBeenCalled();expect(d.fail).toHaveBeenCalledWith("attention",expect.any(String),expect.any(String));
 });
});
