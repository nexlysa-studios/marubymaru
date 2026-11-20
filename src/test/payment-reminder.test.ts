// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildPaymentReminder, processPaymentReminder, type ReminderJob } from "../../supabase/functions/_shared/payment-reminder";
import type { MarketingSettings } from "../../supabase/functions/_shared/marketing-email";
const token = "628c0721-bd00-4000-8000-000000000001";
const settings: MarketingSettings = { from: "Maru <orders@example.test>", replyTo: "care@example.test", contact: "marubymaru@icloud.com", address: "", site: "https://example.test", unsubscribeEndpoint: "https://project.supabase.co/functions/v1/newsletter" };
const snapshot = { order_number: "MBM-TEST", first_name: "<Reader>", email: "reader@example.test", total: 749, created_at: "2026-11-20T12:00:00Z" };
const job = (): ReminderJob => ({ id: "reminder-test", lock_token: "lease", attempts: 1, first_attempt_at: null, token, snapshot, payload: null });
const deps = () => ({ settings, apiKey: "fixture", now: () => Date.parse("2026-11-20T12:20:00Z"), fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "provider-test" }))), prepare: vi.fn().mockResolvedValue(undefined), allowed: vi.fn().mockResolvedValue(true), complete: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined) });
describe("payment reminder content", () => {
  it("links pay/cancel to the website using a private token, not editable totals", () => {
    const mail = buildPaymentReminder(snapshot, token, settings);
    expect(mail.to).toEqual([snapshot.email]);
    expect(mail.html).toContain(`/payment/reminder?token=${token}`);
    expect(mail.html).toContain(`token=${token}&amp;mode=cancel`);
    expect(mail.text).toContain("48 hours"); expect(mail.text).toContain("do not pay again");
    expect(mail.html).toContain("&lt;Reader&gt;"); expect(mail.text).not.toContain("amount=");
    expect(mail.html).not.toContain("merchant_key"); expect(mail.html).not.toContain("passphrase");
  });
  it("is a non-promotional order reminder independent of newsletter consent/settings", () => {
    const mail = buildPaymentReminder(snapshot, token, settings);
    expect(mail.subject).toContain("MBM-TEST"); expect(mail.text).toContain("not a newsletter");
    expect(mail.html).not.toContain("SHOP THE EDIT"); expect(mail.headers).toEqual({});
  });
  it.each([0, -1, 1, 4.99, NaN])("does not build a reminder for a non-payable total %s", total => {
    expect(() => buildPaymentReminder({ ...snapshot, total }, token, settings)).toThrow();
  });
});
describe("payment reminder delivery", () => {
  it("persists the immutable message before sending and acknowledges acceptance", async () => {
    const d = deps(); await processPaymentReminder(job(), d);
    expect(d.prepare).toHaveBeenCalledOnce(); expect(d.prepare.mock.invocationCallOrder[0]).toBeLessThan(d.fetch.mock.invocationCallOrder[0]);
    expect(d.complete).toHaveBeenCalledWith("provider-test");
  });
  it("checks that payment is still pending immediately before sending", async () => {
    const d = deps(); d.allowed.mockResolvedValue(false); await processPaymentReminder(job(), d);
    expect(d.fetch).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledWith("skipped", expect.any(String), expect.any(String));
  });
  it("retries exactly the stored recipient, amounts and links", async () => {
    const d = deps(); const payload = buildPaymentReminder(snapshot, token, settings);
    await processPaymentReminder({ ...job(), snapshot: { ...snapshot, total: 1500 }, payload }, d);
    expect(d.prepare).not.toHaveBeenCalled(); expect(JSON.parse(String(d.fetch.mock.calls[0][1]?.body))).toEqual(payload);
  });
  it("stops uncertain retries before the provider idempotency window expires", async () => {
    const d = deps(); await processPaymentReminder({ ...job(), first_attempt_at: "2026-11-19T12:00:00Z" }, d);
    expect(d.fetch).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledWith("attention", expect.any(String), expect.any(String));
  });
});
