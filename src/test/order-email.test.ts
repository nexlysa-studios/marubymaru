// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildOrderEmail, emailSettings, processOrderEmail, type EmailJob, type ReceiptSnapshot } from "../../supabase/functions/_shared/order-email";

const settings = { from: "Maru By Maru <orders@example.com>", adminEmail: "admin@example.com", replyTo: "orders@example.com", siteUrl: "https://marubymaru.co.za" };
const snapshot: ReceiptSnapshot = {
  order: {
    id: "00000000-0000-4000-8000-000000000001", order_number: "MBM-TEST", payment_status: "paid", payment_reference: "12345",
    paid_at: "2026-10-06T10:30:00Z", created_at: "2026-10-06T10:28:00Z",
    customer_first_name: "Amina", customer_last_name: "Test", customer_email: "buyer@example.com", customer_phone: "0123456789",
    shipping_address_line_1: "1 Test Street", shipping_address_line_2: "", shipping_city: "Cape Town", shipping_province: "Western Cape",
    shipping_postal_code: "8000", shipping_country: "South Africa", customer_notes: "Ring the bell",
    subtotal: 1200, shipping_amount: 50, discount_amount: 100, discount_code: "MARU100", total: 1150,
  },
  items: [{ product_name: "Maru Dress", size: "M", quantity: 2, unit_price: 600, line_total: 1200 }],
};
function job(overrides: Partial<EmailJob> = {}): EmailJob {
  return { id: "email-1", lock_token: "lease-1", kind: "customer_payment", snapshot, attempts: 1, first_attempt_at: null, payload: null, ...overrides };
}
function dependencies() {
  return { apiKey: "test-only-key", settings, fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "provider-1" }))),
    prepare: vi.fn().mockResolvedValue(undefined), complete: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined),
    now: () => Date.parse("2026-10-06T11:00:00Z") };
}
describe("Maru payment emails", () => {
  it("itemises the paid order and formats payment time in South Africa", () => {
    const mail = buildOrderEmail(snapshot, "customer_payment", settings);
    expect(mail.to).toEqual(["buyer@example.com"]);
    expect(mail.subject).toContain("MBM-TEST");
    for (const value of ["Maru Dress", "Size M", "Qty 2", "MARU100", "12345", "12:30", "SAST", "1 Test Street", "Total paid (ZAR)"]) {
      expect(mail.html).toContain(value);
      expect(mail.text).toContain(value);
    }
    expect(mail.html).not.toContain("/admin/orders/");
    expect(mail.html).not.toContain("payment/success");
    expect(mail.text).toContain("not a dispatch notification");
  });
  it("sends admin details separately and links to the protected order route", () => {
    const mail = buildOrderEmail(snapshot, "admin_payment", settings);
    expect(mail.to).toEqual(["admin@example.com"]);
    expect(mail.html).toContain(`/admin/orders/${snapshot.order.id}`);
    expect(mail.text).toContain("buyer@example.com");
    expect(mail.text).toContain("0123456789");
  });
  it("escapes customer and product content in HTML", () => {
    const hostile = structuredClone(snapshot);
    hostile.order.customer_first_name = '<img src=x onerror="evil()">';
    hostile.items[0].product_name = "<script>bad()</script>";
    hostile.order.customer_notes = '<a href="https://evil.test">link</a>';
    const mail = buildOrderEmail(hostile, "customer_payment", settings);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain('href="https://evil.test"');
  });
  it.each(["pending", "failed", "cancelled"])("never creates a confirmation for %s payments", (status) => {
    expect(() => buildOrderEmail({ ...snapshot, order: { ...snapshot.order, payment_status: status } }, "customer_payment", settings)).toThrow();
  });
  it("rejects missing sender configuration and non-HTTPS site URLs", () => {
    expect(() => emailSettings(() => undefined)).toThrow();
    const env: Record<string, string> = { ORDER_EMAIL_FROM: settings.from, ORDER_EMAIL_ADMIN: settings.adminEmail, ORDER_EMAIL_REPLY_TO: settings.replyTo, ORDER_EMAIL_SITE_URL: settings.siteUrl };
    expect(emailSettings((key) => env[key])).toEqual(settings);
    env.ORDER_EMAIL_SITE_URL = "http://example.com";
    expect(() => emailSettings((key) => env[key])).toThrow();
  });
  it("persists the payload before sending and uses an order-email-specific idempotency key", async () => {
    const deps = dependencies();
    await processOrderEmail(job(), deps);
    expect(deps.prepare.mock.invocationCallOrder[0]).toBeLessThan(deps.fetch.mock.invocationCallOrder[0]);
    const init = deps.fetch.mock.calls[0][1]!;
    expect(init.headers).toMatchObject({ "Idempotency-Key": "maru-payment/email-1" });
    expect(deps.complete).toHaveBeenCalledWith(job(), "provider-1");
    expect(deps.fail).not.toHaveBeenCalled();
  });
  it("does not send if storing the immutable payload fails", async () => {
    const deps = dependencies();
    deps.prepare.mockRejectedValue(new Error("database unavailable"));
    await expect(processOrderEmail(job(), deps)).rejects.toThrow();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("reuses the exact body and recipient even if settings change between attempts", async () => {
    const deps = dependencies();
    const payload = buildOrderEmail(snapshot, "customer_payment", settings);
    deps.settings = { ...settings, from: "Changed <other@example.com>" };
    await processOrderEmail(job({ payload, attempts: 2 }), deps);
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.fetch.mock.calls[0][1]?.body).toBe(JSON.stringify(payload));
  });
  it.each([429, 500, 503, 409])("retries HTTP %s without marking the email sent", async (status) => {
    const deps = dependencies();
    deps.fetch.mockResolvedValue(new Response("private provider details", { status }));
    await processOrderEmail(job(), deps);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith(expect.anything(), "queued", `Resend returned HTTP ${status}.`, expect.any(String));
  });
  it("records a permanent rejection without logging the raw response", async () => {
    const deps = dependencies();
    deps.fetch.mockResolvedValue(new Response("private details", { status: 422 }));
    await processOrderEmail(job(), deps);
    expect(deps.fail).toHaveBeenCalledWith(expect.anything(), "failed", "Resend returned HTTP 422.", expect.any(String));
  });
  it("retries network uncertainty without touching payment state", async () => {
    const deps = dependencies();
    deps.fetch.mockRejectedValue(new Error("timeout"));
    await processOrderEmail(job(), deps);
    expect(deps.fail).toHaveBeenCalledWith(expect.anything(), "queued", expect.any(String), expect.any(String));
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it("preserves the lease for safe replay if acknowledgement storage fails", async () => {
    const deps = dependencies();
    deps.complete.mockRejectedValue(new Error("db down"));
    await expect(processOrderEmail(job(), deps)).rejects.toThrow("db down");
    expect(deps.fail).not.toHaveBeenCalled();
  });
  it("stops uncertain retries before Resend's 24-hour idempotency expiration", async () => {
    const deps = dependencies();
    await processOrderEmail(job({ first_attempt_at: "2026-10-05T11:00:00Z" }), deps);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith(expect.anything(), "attention", expect.any(String), expect.any(String));
  });
  it("requires review after eight failed attempts", async () => {
    const deps = dependencies();
    deps.fetch.mockRejectedValue(new Error("timeout"));
    await processOrderEmail(job({ attempts: 8 }), deps);
    expect(deps.fail).toHaveBeenCalledWith(expect.anything(), "attention", expect.any(String), expect.any(String));
  });
});
