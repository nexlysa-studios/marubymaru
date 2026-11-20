import { escapeHtml } from "./order-email.ts";

export interface MarketingContent {
  products?: { id: string; name: string; price: number; sale_price: number }[];
  coupon?: { code: string; discount_type: string; discount_value: number; min_order_amount: number; ends_at: string | null; max_uses: number | null; max_uses_per_customer: number };
}
export interface MarketingSettings { from: string; replyTo: string; contact: string; address: string; site: string; unsubscribeEndpoint: string }
export interface MarketingPayload { from: string; to: string[]; reply_to: string; subject: string; html: string; text: string; headers: Record<string, string> }
export function marketingSettings(env: (key: string) => string | undefined): MarketingSettings {
  const from = env("ORDER_EMAIL_FROM") ?? "";
  const replyTo = env("ORDER_EMAIL_REPLY_TO") ?? "";
  const site = new URL(env("ORDER_EMAIL_SITE_URL") ?? "");
  const contact = env("NEWSLETTER_CONTACT_EMAIL") ?? "marubymaru@icloud.com";
  if (!from || /[\r\n]/.test(from) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyTo) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact) || site.protocol !== "https:") throw new Error("Invalid marketing email configuration");
  return { from, replyTo, contact, site: site.origin, address: "", unsubscribeEndpoint: `${env("SUPABASE_URL")}/functions/v1/newsletter` };
}
const money = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
export function buildMarketingEmail(content: MarketingContent, email: string, token: string, settings: MarketingSettings): MarketingPayload {
  if (settings.address.trim().length < 10) throw new Error("A business postal address is required before sending newsletters.");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || !/^[0-9a-f-]{36}$/i.test(token)) throw new Error("Invalid recipient");
  const subject = content.coupon ? "A little something from Maru" : "Discover the Maru Sale Edit";
  const unsubscribe = `${settings.site}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  const oneClick = `${settings.unsubscribeEndpoint}?action=unsubscribe&token=${encodeURIComponent(token)}`;
  const parts: string[] = [];
  let body = "";
  if (content.products?.length) {
    body += `<p>Considered pieces. A little more irresistible.</p>`;
    for (const p of content.products) {
      if (!(p.sale_price > 0 && p.sale_price < p.price)) throw new Error("Invalid sale data");
      const saving = Math.floor((1 - p.sale_price / p.price) * 100 + 1e-8);
      const link = `${settings.site}/product/${encodeURIComponent(p.id)}`;
      body += `<div style="padding:24px 0;border-bottom:1px solid #e4dfd7"><h2 style="font:26px Georgia">${escapeHtml(p.name)}</h2><p><del style="color:#888">${escapeHtml(money(p.price))}</del> &nbsp; ${escapeHtml(money(p.sale_price))} · ${saving || "<1"}% off</p><a href="${escapeHtml(link)}" style="color:#25211e">Explore the piece →</a></div>`;
      parts.push(`${p.name}: ${money(p.sale_price)} (was ${money(p.price)}) · ${saving || "<1"}% off\n${link}`);
    }
  } else if (content.coupon) {
    const c = content.coupon;
    const offer = c.discount_type === "percentage" ? `${c.discount_value}% off` : `${money(c.discount_value)} off`;
    const terms = [`Full-price items only. Excludes sale items.`, ...(c.min_order_amount > 0 ? [`Minimum full-price spend: ${money(c.min_order_amount)}.`] : []),
      ...(c.ends_at ? [`Ends ${new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(c.ends_at))} SAST.`] : []),
      `Up to ${c.max_uses_per_customer} use(s) per customer.`, ...(c.max_uses ? [`Limited to ${c.max_uses} total uses, subject to remaining availability.`] : [])];
    body += `<p>A little something, just for you.</p><h2 style="font:32px Georgia">${escapeHtml(offer)}</h2><p style="letter-spacing:3px;border:1px solid #ddd;padding:20px">${escapeHtml(c.code)}</p><p style="font-size:12px;line-height:1.8">${escapeHtml(terms.join(" "))}</p>`;
    parts.push(`${offer}. Code: ${c.code}`, ...terms);
  } else throw new Error("Empty campaign");
  const shop = `${settings.site}/shop${content.coupon ? "" : "?collection=sale"}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;background:#f5f2ed;color:#25211e"><div style="max-width:560px;margin:32px auto;background:#fffdf9;padding:32px 24px;font:15px Arial;line-height:1.7"><a href="${settings.site}" style="font:28px Georgia;letter-spacing:3px;color:#25211e;text-decoration:none">MARU BY MARU</a><p style="font-size:10px;letter-spacing:2px;margin-top:28px">LETTERS FROM MARU</p><h1 style="font:38px Georgia">${subject}</h1>${body}<p style="margin:32px 0"><a href="${shop}" style="display:inline-block;padding:14px 22px;background:#25211e;color:white;font-size:11px;letter-spacing:2px;text-decoration:none">SHOP THE EDIT →</a></p><footer style="border-top:1px solid #ddd;padding-top:20px;font-size:11px;color:#777">You receive this because you joined the Maru List.<br>Maru By Maru · ${escapeHtml(settings.address)}<br><a href="mailto:${escapeHtml(settings.contact)}">${escapeHtml(settings.contact)}</a><br><a href="${escapeHtml(unsubscribe)}">Unsubscribe</a></footer></div></body></html>`;
  return { from: settings.from, to: [email], reply_to: settings.replyTo, subject, html,
    text: ["MARU BY MARU", subject, ...parts, `Shop: ${shop}`, "You receive this because you joined the Maru List.", `Maru By Maru · ${settings.address}`, settings.contact, `Unsubscribe: ${unsubscribe}`].join("\n\n"),
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

export interface MarketingJob { id: string; lock_token: string; attempts: number; first_attempt_at: string | null; payload: MarketingPayload | null; email: string; unsubscribe_token: string; content: MarketingContent }
interface Dependencies { settings: MarketingSettings; apiKey: string; fetch: typeof fetch; now: () => number;
  allowed: () => Promise<boolean>; prepare: (payload: MarketingPayload) => Promise<void>; complete: (id: string) => Promise<void>;
  fail: (status: "queued" | "failed" | "attention" | "skipped", reason: string, next: string) => Promise<void> }
export async function processMarketingEmail(job: MarketingJob, deps: Dependencies) {
  const retry = (reason: string, permanent = false) => deps.fail(permanent ? "failed" : job.attempts >= 8 ? "attention" : "queued", reason, new Date(deps.now() + Math.min(60 * 2 ** Math.min(job.attempts, 8), 3600) * 1000).toISOString());
  if (job.first_attempt_at && deps.now() - Date.parse(job.first_attempt_at) >= 23 * 3600_000) return deps.fail("attention", "Retry window expired. Check Resend.", new Date(deps.now()).toISOString());
  let payload = job.payload;
  if (!payload) {
    try { payload = buildMarketingEmail(job.content, job.email, job.unsubscribe_token, deps.settings); }
    catch { return retry("Invalid newsletter content or configuration.", true); }
    await deps.prepare(payload);
  }
  // Re-check opt-out and offer validity immediately before every network attempt.
  if (!await deps.allowed()) return deps.fail("skipped", "Unsubscribed or offer ended.", new Date(deps.now()).toISOString());
  let response: Response;
  try { response = await deps.fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `maru-newsletter/${job.id}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) }); }
  catch { return retry("Email connection interrupted; retrying safely."); }
  if (!response.ok) return retry(`Resend returned HTTP ${response.status}.`, response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status));
  let id: string;
  try { const result = await response.json(); if (typeof result.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.id)) throw new Error(); id = result.id; }
  catch { return retry("Email acknowledgement unavailable; retrying safely."); }
  await deps.complete(id);
}
