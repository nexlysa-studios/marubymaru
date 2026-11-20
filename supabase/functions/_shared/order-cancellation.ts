import { escapeHtml } from "./order-email.ts";
import { processMarketingEmail, type MarketingJob, type MarketingPayload, type MarketingSettings } from "./marketing-email.ts";
import type { ReminderSnapshot } from "./payment-reminder.ts";
export interface CancellationJob { id: string; lock_token: string; attempts: number; first_attempt_at: string | null; snapshot: ReminderSnapshot; payload: MarketingPayload | null }
export function buildOrderCancellation(snapshot: ReminderSnapshot, settings: MarketingSettings): MarketingPayload {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(snapshot.email) || !snapshot.order_number) throw new Error("Invalid cancellation email");
  const subject = `Your Maru order has been cancelled | ${snapshot.order_number.replace(/[\r\n]/g, " ")}`;
  const reason = "We did not receive payment confirmation before the 48-hour payment window in your reminder expired, so your unpaid order has been automatically cancelled.";
  const caution = "You can no longer start payment for this order on our website. If you have already paid or money has left your account, please contact Maru before placing or paying for another order so we can check PayFast's confirmation.";
  const shop = `${settings.site}/shop`;
  return { from: settings.from, to: [snapshot.email], reply_to: settings.replyTo, subject, headers: {},
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f2ed;color:#25211e"><div style="max-width:560px;margin:32px auto;padding:36px 24px;background:#fffdf9;font:15px Arial;line-height:1.8"><p style="font:27px Georgia;letter-spacing:3px">MARU BY MARU</p><h1 style="font:36px Georgia;line-height:1.15">Your order has been cancelled.</h1><p>Dear ${escapeHtml(snapshot.first_name)},</p><p>Order <strong>${escapeHtml(snapshot.order_number)}</strong></p><p>${escapeHtml(reason)}</p><p style="font-size:12px;color:#777">${escapeHtml(caution)}</p><p>You are welcome to place a new order, subject to current availability and prices.</p><p><a href="${escapeHtml(shop)}" style="color:#25211e">RETURN TO SHOP →</a></p><footer style="border-top:1px solid #ddd;margin-top:28px;padding-top:20px;font-size:11px;color:#777">Maru By Maru<br><a href="mailto:${escapeHtml(settings.contact)}">${escapeHtml(settings.contact)}</a></footer></div></body></html>`,
    text: ["MARU BY MARU", `Dear ${snapshot.first_name},`, `Order ${snapshot.order_number} has been cancelled.`, reason, caution, "You are welcome to place a new order, subject to current availability and prices.", shop, settings.contact].join("\n\n") };
}
export async function processOrderCancellation(job: CancellationJob, deps: Parameters<typeof processMarketingEmail>[1]) {
  if (job.first_attempt_at && deps.now() - Date.parse(job.first_attempt_at) >= 23 * 3600_000) return deps.fail("attention", "Retry window expired. Check Resend.", new Date(deps.now()).toISOString());
  let payload = job.payload;
  if (!payload) {
    try { payload = buildOrderCancellation(job.snapshot, deps.settings); }
    catch { return deps.fail("failed", "Invalid cancellation email data.", new Date(deps.now()).toISOString()); }
    await deps.prepare(payload);
  }
  const prepared: MarketingJob = { ...job, payload, email: job.snapshot.email, unsubscribe_token: "", content: {} };
  return processMarketingEmail(prepared, { ...deps, fail: (status, reason, next) => deps.fail(status, status === "skipped" ? "Order payment or cancellation status changed." : reason, next) });
}
