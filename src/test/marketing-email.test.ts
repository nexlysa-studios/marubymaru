// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildMarketingEmail, processMarketingEmail, type MarketingJob, type MarketingSettings } from "../../supabase/functions/_shared/marketing-email";

const settings: MarketingSettings = { from: "Maru <letters@example.test>", replyTo: "care@example.test", contact: "marubymaru@icloud.com", address: "10 Test Road, Test City", site: "https://example.test", unsubscribeEndpoint: "https://project.supabase.co/functions/v1/newsletter" };
const token = "628c0721-bd00-4000-8000-000000000001";
const content = { products: [{ id: "test-dress", name: "<Dress & Co>", price: 800, sale_price: 600 }] };
const job = (): MarketingJob => ({ id: "job-test", lock_token: token, attempts: 1, first_attempt_at: null, payload: null, email: "reader@example.test", unsubscribe_token: token, content });
const deps = () => ({ settings, apiKey: "fixture-key", fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "provider-test" }))), now: () => Date.parse("2026-11-20T12:00:00Z"), allowed: vi.fn().mockResolvedValue(true), prepare: vi.fn().mockResolvedValue(undefined), complete: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined) });

describe("marketing email content", () => {
  it("includes old/new prices, savings and stable product links without expiring image URLs", () => {
    const mail = buildMarketingEmail(content, "reader@example.test", token, settings);
    expect(mail.html).toContain("<del"); expect(mail.html).toContain("25% off");
    expect(mail.html).toContain("&lt;Dress &amp; Co&gt;"); expect(mail.html).not.toContain("<img");
    expect(mail.text).toContain("https://example.test/product/test-dress");
    expect(mail.html).toContain('href="https://example.test/shop?collection=sale"');
    expect(mail.to).toEqual(["reader@example.test"]);
  });
  it("includes visible unsubscribe, one-click POST headers, address and requested footer email", () => {
    const mail = buildMarketingEmail(content, "reader@example.test", token, settings);
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mail.headers["List-Unsubscribe"]).toContain(`action=unsubscribe&token=${token}`);
    expect(mail.html).toContain("/newsletter/unsubscribe?token=");
    expect(mail.html).toContain("10 Test Road"); expect(mail.html).toContain("marubymaru@icloud.com");
    expect(mail.text).toContain("joined the Maru List");
  });
  it("includes coupon eligibility, expiry in SAST and use restrictions without internal notes", () => {
    const mail = buildMarketingEmail({ coupon: { code: "MARU10", discount_type: "percentage", discount_value: 10, min_order_amount: 500, ends_at: "2026-12-01T12:00:00Z", max_uses: 50, max_uses_per_customer: 1 } }, "reader@example.test", token, settings);
    expect(mail.html).toContain("MARU10"); expect(mail.text).toContain("Excludes sale items");
    expect(mail.text).toContain("Minimum full-price spend"); expect(mail.text).toContain("SAST");
    expect(mail.text).toContain("50 total uses"); expect(mail.text).not.toContain("Internal");
  });
  it("refuses real email generation without a business postal address", () => {
    expect(() => buildMarketingEmail(content, "reader@example.test", token, { ...settings, address: "" })).toThrow("postal address");
  });
  it("rejects invalid sale amounts and empty campaigns", () => {
    expect(() => buildMarketingEmail({ products: [{ ...content.products[0], sale_price: 900 }] }, "reader@example.test", token, settings)).toThrow();
    expect(() => buildMarketingEmail({}, "reader@example.test", token, settings)).toThrow();
  });
});

describe("marketing delivery safety", () => {
  it("saves the exact payload before sending using a stable idempotency key", async () => {
    const d = deps(); await processMarketingEmail(job(), d);
    expect(d.prepare).toHaveBeenCalledOnce(); expect(d.allowed).toHaveBeenCalledOnce();
    expect(d.prepare.mock.invocationCallOrder[0]).toBeLessThan(d.fetch.mock.invocationCallOrder[0]);
    expect(d.fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "maru-newsletter/job-test" }) }));
    expect(d.complete).toHaveBeenCalledWith("provider-test");
  });
  it("does not send to someone who unsubscribed after the job was queued", async () => {
    const d = deps(); d.allowed.mockResolvedValue(false); await processMarketingEmail(job(), d);
    expect(d.fetch).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledWith("skipped", expect.any(String), expect.any(String));
  });
  it("retries an identical prepared payload rather than rebuilding prices or recipients", async () => {
    const d = deps(); const payload = buildMarketingEmail(content, "original@example.test", token, settings);
    await processMarketingEmail({ ...job(), email: "new@example.test", payload }, d);
    expect(d.prepare).not.toHaveBeenCalled(); expect(JSON.parse(String(d.fetch.mock.calls[0][1]?.body))).toEqual(payload);
  });
  it.each([429, 500, 503])("retries HTTP %s without logging provider bodies", async status => {
    const d = deps(); d.fetch.mockResolvedValue(new Response("personal@example.test", { status })); await processMarketingEmail(job(), d);
    expect(d.fail).toHaveBeenCalledWith("queued", `Resend returned HTTP ${status}.`, expect.any(String));
  });
  it("stops permanent failures", async () => {
    const d = deps(); d.fetch.mockResolvedValue(new Response("invalid", { status: 422 })); await processMarketingEmail(job(), d);
    expect(d.fail).toHaveBeenCalledWith("failed", expect.any(String), expect.any(String));
  });
  it("stops uncertain retries before provider idempotency expires", async () => {
    const d = deps(); await processMarketingEmail({ ...job(), first_attempt_at: "2026-11-19T12:00:00Z" }, d);
    expect(d.fetch).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledWith("attention", expect.any(String), expect.any(String));
  });
});
