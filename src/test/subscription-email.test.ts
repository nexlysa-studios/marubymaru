// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildSubscriptionEmail, processSubscriptionEmail, type SubscriptionJob, type SubscriptionKind } from "../../supabase/functions/_shared/subscription-email";
import type { MarketingSettings } from "../../supabase/functions/_shared/marketing-email";
const settings: MarketingSettings = { from: "Maru <orders@example.test>", replyTo: "care@example.test", contact: "marubymaru@icloud.com", address: "", site: "https://example.test", unsubscribeEndpoint: "https://project.supabase.co/functions/v1/newsletter" };
const snapshot = { email: "reader@example.test", unsubscribe_token: "628c0721-bd00-4000-8000-000000000001", occurred_at: "2026-11-20T12:00:00Z" };
const job = (): SubscriptionJob => ({ id: "subscription-test", lock_token: "fixture", attempts: 1, first_attempt_at: null, kind: "welcome", snapshot, payload: null });
const deps = () => ({ settings, adminEmail: "admin@example.test", apiKey: "test-key", now: () => Date.parse("2026-11-20T12:30:00Z"), fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "provider-test" }))), allowed: vi.fn().mockResolvedValue(true), prepare: vi.fn().mockResolvedValue(undefined), complete: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined) });
describe("subscription confirmation content", () => {
  it.each(["welcome", "admin_subscribed", "goodbye", "admin_unsubscribed"] as SubscriptionKind[])("builds %s without requiring the marketing postal-address gate", kind => {
    const mail = buildSubscriptionEmail(kind, snapshot, settings, "admin@example.test");
    expect(mail.to).toEqual([kind.startsWith("admin_") ? "admin@example.test" : "reader@example.test"]);
    expect(mail.html).toContain("marubymaru@icloud.com"); expect(mail.text).toBeTruthy();
  });
  it("includes the website unsubscribe confirmation link in the welcome email", () => {
    const mail = buildSubscriptionEmail("welcome", snapshot, settings, "admin@example.test");
    expect(mail.html).toContain(`/newsletter/unsubscribe?token=${snapshot.unsubscribe_token}`);
    expect(mail.text).toContain("nothing to verify");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
  it("does not include member unsubscribe tokens in administrative notifications", () => {
    const mail = buildSubscriptionEmail("admin_subscribed", snapshot, settings, "admin@example.test");
    expect(mail.subject).toContain("New subscriber"); expect(mail.text).toContain(snapshot.email);
    expect(mail.text).toContain("14:00 SAST"); expect(mail.text).not.toContain(snapshot.unsubscribe_token);
  });
  it("keeps the final unsubscribe confirmation non-promotional", () => {
    const mail = buildSubscriptionEmail("goodbye", snapshot, settings, "admin@example.test");
    expect(mail.subject).toContain("unsubscribed"); expect(mail.text).toContain("one-time confirmation");
    expect(mail.text).toContain("essential order and payment confirmations are unaffected");
    expect(mail.html).not.toContain("SHOP THE EDIT"); expect(mail.html).not.toContain("/newsletter/unsubscribe");
  });
});
describe("subscription confirmation delivery", () => {
  it("persists content before sending and acknowledges the provider ID", async () => {
    const d = deps(); await processSubscriptionEmail(job(), d);
    expect(d.prepare).toHaveBeenCalledOnce(); expect(d.prepare.mock.invocationCallOrder[0]).toBeLessThan(d.fetch.mock.invocationCallOrder[0]);
    expect(d.complete).toHaveBeenCalledWith("provider-test");
    expect(d.fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "maru-newsletter/subscription-test" }) }));
  });
  it("does not rebuild a prepared message when admin settings change", async () => {
    const d = deps(); const payload = buildSubscriptionEmail("admin_subscribed", snapshot, settings, "original@example.test");
    await processSubscriptionEmail({ ...job(), kind: "admin_subscribed", payload }, d);
    expect(d.prepare).not.toHaveBeenCalled(); expect(JSON.parse(String(d.fetch.mock.calls[0][1]?.body)).to).toEqual(["original@example.test"]);
  });
  it("skips a welcome when the membership is no longer active", async () => {
    const d = deps(); d.allowed.mockResolvedValue(false); await processSubscriptionEmail(job(), d);
    expect(d.fetch).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledWith("skipped", expect.any(String), expect.any(String));
  });
  it("stops uncertain retries before provider idempotency expires", async () => {
    const d = deps(); await processSubscriptionEmail({ ...job(), first_attempt_at: "2026-11-19T12:00:00Z" }, d);
    expect(d.fetch).not.toHaveBeenCalled(); expect(d.prepare).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledWith("attention", expect.any(String), expect.any(String));
  });
});
