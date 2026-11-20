import { escapeHtml } from "./order-email.ts";
import { processMarketingEmail, type MarketingJob, type MarketingPayload, type MarketingSettings } from "./marketing-email.ts";

export type SubscriptionKind = "welcome" | "admin_subscribed" | "goodbye" | "admin_unsubscribed";
export interface SubscriptionSnapshot { email: string; unsubscribe_token: string; occurred_at: string }
export interface SubscriptionJob { id: string; lock_token: string; attempts: number; first_attempt_at: string | null; kind: SubscriptionKind; snapshot: SubscriptionSnapshot; payload: MarketingPayload | null }
export function buildSubscriptionEmail(kind: SubscriptionKind, snapshot: SubscriptionSnapshot, settings: MarketingSettings, adminEmail: string): MarketingPayload {
  const validEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  const admin = kind.startsWith("admin_");
  const joined = kind === "welcome" || kind === "admin_subscribed";
  if (!validEmail.test(snapshot.email) || !validEmail.test(adminEmail) || !Number.isFinite(Date.parse(snapshot.occurred_at)) || !/^[0-9a-f-]{36}$/i.test(snapshot.unsubscribe_token)) throw new Error("Invalid subscription notification");
  const subject = admin ? joined ? "New subscriber | The Maru List" : "Subscriber unsubscribed | The Maru List" : joined ? "Welcome to the Maru List" : "You've been unsubscribed | Maru By Maru";
  const title = admin ? joined ? "A new reader has joined." : "A reader has unsubscribed." : joined ? "You're on the list." : "Your preferences are updated.";
  const date = new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(snapshot.occurred_at)) + " SAST";
  const intro = admin ? `${snapshot.email} ${joined ? "subscribed to" : "unsubscribed from"} the Maru List on ${date}.`
    : joined ? "Thank you for joining the Maru List. Your subscription is active—there's nothing to verify. This email confirms your signup."
    : "Your unsubscribe request is complete. You will no longer receive sale announcements or promotional emails from the Maru List. Your essential order and payment confirmations are unaffected.";
  const url = admin ? `${settings.site}/admin/newsletter` : joined ? `${settings.site}/newsletter/unsubscribe?token=${encodeURIComponent(snapshot.unsubscribe_token)}` : `${settings.site}/contact`;
  const action = admin ? "VIEW SUBSCRIBERS" : joined ? "MANAGE MY SUBSCRIPTION" : "CONTACT MARU";
  const details = admin ? "This is an administrative subscription notification, not an order or payment notification."
    : joined ? "You can unsubscribe whenever you wish using the link below. If you didn't request this signup, you can use the same link to leave the list."
    : "No further action is needed. This is a one-time confirmation of your request, not a promotional email.";
  // These are non-promotional action confirmations, not campaigns; no postal-address gate.
  const unsubscribe = !admin && joined ? `<p><a href="${escapeHtml(url)}" style="color:#555">Unsubscribe from the Maru List</a></p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f5f2ed;color:#25211e"><div style="max-width:560px;margin:32px auto;background:#fffdf9;padding:36px 24px;font:15px Arial;line-height:1.8"><p style="font:27px Georgia;letter-spacing:3px;margin:0">MARU BY MARU</p><p style="font-size:10px;letter-spacing:2px;margin-top:32px">THE MARU LIST</p><h1 style="font:38px Georgia;line-height:1.15">${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p><p style="color:#777;font-size:13px">${escapeHtml(details)}</p><p style="margin:30px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;background:#25211e;color:white;text-decoration:none;font-size:10px;letter-spacing:2px">${action} →</a></p><footer style="border-top:1px solid #ddd;padding-top:20px;color:#777;font-size:11px">Maru By Maru<br><a href="mailto:${escapeHtml(settings.contact)}" style="color:#555">${escapeHtml(settings.contact)}</a>${unsubscribe}</footer></div></body></html>`;
  const oneClick = `${settings.unsubscribeEndpoint}?action=unsubscribe&token=${encodeURIComponent(snapshot.unsubscribe_token)}`;
  return { from: settings.from, to: [admin ? adminEmail : snapshot.email], reply_to: settings.replyTo, subject, html,
    text: ["MARU BY MARU", title, intro, details, `${action}: ${url}`, settings.contact, ...(!admin && joined ? [`Unsubscribe: ${url}`] : [])].join("\n\n"),
    headers: !admin && joined ? { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {} };
}

type DeliveryDependencies = Parameters<typeof processMarketingEmail>[1];
export async function processSubscriptionEmail(job: SubscriptionJob, deps: DeliveryDependencies & { adminEmail: string }) {
  if (job.first_attempt_at && deps.now() - Date.parse(job.first_attempt_at) >= 23 * 3600_000) return deps.fail("attention", "Retry window expired. Check Resend.", new Date(deps.now()).toISOString());
  let payload = job.payload;
  if (!payload) {
    try { payload = buildSubscriptionEmail(job.kind, job.snapshot, deps.settings, deps.adminEmail); }
    catch { return deps.fail("failed", "Invalid subscription notification configuration.", new Date(deps.now()).toISOString()); }
    await deps.prepare(payload);
  }
  // Reuse the tested immutable-payload/idempotency transport. Campaign rendering
  // is bypassed: these notifications contain only subscription action details.
  const prepared: MarketingJob = { ...job, payload, email: job.snapshot.email, unsubscribe_token: job.snapshot.unsubscribe_token, content: {} };
  return processMarketingEmail(prepared, deps);
}
