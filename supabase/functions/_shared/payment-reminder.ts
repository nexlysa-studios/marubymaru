import { escapeHtml } from "./order-email.ts";
import { processMarketingEmail, type MarketingJob, type MarketingPayload, type MarketingSettings } from "./marketing-email.ts";
export interface ReminderSnapshot { order_number: string; email: string; first_name: string; total: number; created_at: string }
export interface ReminderJob { id: string; lock_token: string; attempts: number; first_attempt_at: string | null; token: string; snapshot: ReminderSnapshot; payload: MarketingPayload | null }
export function buildPaymentReminder(snapshot: ReminderSnapshot, token: string, settings: MarketingSettings): MarketingPayload {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(snapshot.email) || !/^[0-9a-f-]{36}$/i.test(token) || !Number.isFinite(snapshot.total) || snapshot.total < 5 || !snapshot.order_number) throw new Error("Invalid payment reminder");
  const pay = `${settings.site}/payment/reminder?token=${encodeURIComponent(token)}`;
  const cancel = `${pay}&mode=cancel`;
  const amount = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(snapshot.total);
  const subject = `Complete your Maru order | ${snapshot.order_number.replace(/[\r\n]/g, " ")}`;
  const caution = "If you have already paid, please do not pay again. Open the link to check the latest status or contact Maru. Payment is confirmed only after PayFast verifies it. If your order is still unpaid when these links expire after 48 hours, it will be automatically cancelled.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f5f2ed;color:#25211e"><div style="max-width:560px;margin:32px auto;padding:36px 24px;background:#fffdf9;font:15px Arial;line-height:1.8"><p style="font:27px Georgia;letter-spacing:3px">MARU BY MARU</p><p style="font-size:10px;letter-spacing:2px;margin-top:32px">YOUR ORDER</p><h1 style="font:36px Georgia;line-height:1.15">A little reminder.</h1><p>Dear ${escapeHtml(snapshot.first_name)}, we haven't received payment confirmation for order <strong>${escapeHtml(snapshot.order_number)}</strong>.</p><p style="font:28px Georgia">${escapeHtml(amount)}</p><p>You can complete your existing order securely with PayFast, or cancel it if you no longer wish to proceed.</p><p style="margin:30px 0"><a href="${escapeHtml(pay)}" style="display:inline-block;background:#25211e;padding:14px 22px;color:white;text-decoration:none;letter-spacing:2px;font-size:11px">PAY NOW →</a></p><p><a href="${escapeHtml(cancel)}" style="color:#25211e">Cancel this unpaid order</a></p><p style="font-size:12px;color:#777">${escapeHtml(caution)}</p><p style="font-size:12px;color:#777">These private links expire after 48 hours. This is a one-time reminder about your order, not a newsletter.</p><footer style="border-top:1px solid #ddd;margin-top:28px;padding-top:20px;font-size:11px;color:#777">Maru By Maru<br><a href="mailto:${escapeHtml(settings.contact)}">${escapeHtml(settings.contact)}</a></footer></div></body></html>`;
  return { from: settings.from, to: [snapshot.email], reply_to: settings.replyTo, subject, html,
    text: [`MARU BY MARU`, `Dear ${snapshot.first_name},`, `We haven't received payment confirmation for order ${snapshot.order_number}.`, `Order total: ${amount}`, `Pay now: ${pay}`, `Cancel this unpaid order: ${cancel}`, caution, "Private links expire after 48 hours. This is a one-time order reminder, not a newsletter.", settings.contact].join("\n\n"), headers: {} };
}
type Dependencies = Parameters<typeof processMarketingEmail>[1];
export async function processPaymentReminder(job: ReminderJob, deps: Dependencies) {
  if (job.first_attempt_at && deps.now() - Date.parse(job.first_attempt_at) >= 23 * 3600_000) return deps.fail("attention", "Retry window expired. Check Resend.", new Date(deps.now()).toISOString());
  let payload = job.payload;
  if (!payload) {
    try { payload = buildPaymentReminder(job.snapshot, job.token, deps.settings); }
    catch { return deps.fail("failed", "Invalid payment reminder data.", new Date(deps.now()).toISOString()); }
    await deps.prepare(payload);
  }
  const prepared: MarketingJob = { ...job, payload, email: job.snapshot.email, unsubscribe_token: job.token, content: {} };
  // Only reuse the immutable-payload transport; no marketing rendering or consent logic.
  return processMarketingEmail(prepared, { ...deps, fail: (status, reason, next) => deps.fail(status, status === "skipped" ? "Order paid, cancelled, changed or link expired." : reason, next) });
}
