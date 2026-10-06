export interface ReceiptOrder {
  id: string;
  order_number: string;
  payment_status: string;
  payment_reference: string;
  paid_at: string;
  created_at: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address_line_1: string;
  shipping_address_line_2: string;
  shipping_city: string;
  shipping_province: string;
  shipping_postal_code: string;
  shipping_country: string;
  customer_notes: string;
  subtotal: number;
  discount_amount: number;
  discount_code: string | null;
  shipping_amount: number;
  total: number;
}
export interface ReceiptItem { product_name: string; size: string; quantity: number; unit_price: number; line_total: number }
export interface ReceiptSnapshot { order: ReceiptOrder; items: ReceiptItem[] }
export type EmailKind = "customer_payment" | "admin_payment";
export interface EmailSettings { from: string; adminEmail: string; replyTo: string; siteUrl: string }
export interface EmailPayload { from: string; to: string[]; reply_to: string; subject: string; html: string; text: string }

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function emailSettings(getEnv: (key: string) => string | undefined): EmailSettings {
  const from = getEnv("ORDER_EMAIL_FROM")?.trim() ?? "";
  const adminEmail = getEnv("ORDER_EMAIL_ADMIN")?.trim() ?? "";
  const replyTo = getEnv("ORDER_EMAIL_REPLY_TO")?.trim() ?? "";
  const site = new URL(getEnv("ORDER_EMAIL_SITE_URL") ?? "");
  const fromAddress = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  if (!email.test(fromAddress) || /[\r\n]/.test(from) || !email.test(adminEmail) || !email.test(replyTo)
    || site.protocol !== "https:" || site.username || site.password) throw new Error("Invalid email configuration");
  return { from, adminEmail, replyTo, siteUrl: site.origin };
}
const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "long", timeStyle: "short", timeZone: "Africa/Johannesburg",
}).format(new Date(value)) + " SAST";

export function buildOrderEmail(snapshot: ReceiptSnapshot, kind: EmailKind, settings: EmailSettings): EmailPayload {
  const { order: o, items } = snapshot;
  if (o.payment_status !== "paid" || !o.payment_reference || !o.paid_at || !items.length || !email.test(o.customer_email)) {
    throw new Error("Invalid paid-order snapshot");
  }
  const admin = kind === "admin_payment";
  const title = admin ? "A new Maru order." : "Thank you for your order.";
  const intro = admin ? "Payment has been confirmed by PayFast. Your next order is ready to prepare."
    : `Dear ${o.customer_first_name}, your payment is confirmed. Thank you for choosing Maru By Maru. We look forward to preparing your pieces.`;
  const address = [o.customer_first_name + " " + o.customer_last_name, o.shipping_address_line_1,
    o.shipping_address_line_2, `${o.shipping_city}, ${o.shipping_province}`, o.shipping_postal_code, o.shipping_country].filter(Boolean);
  const totals: [string, number][] = [["Subtotal", o.subtotal]];
  if (Number(o.discount_amount) > 0) totals.push([`Discount${o.discount_code ? ` (${o.discount_code})` : ""}`, -Number(o.discount_amount)]);
  totals.push(["Delivery", o.shipping_amount], ["Total paid (ZAR)", o.total]);
  const url = admin ? `${settings.siteUrl}/admin/orders/${encodeURIComponent(o.id)}` : `${settings.siteUrl}/shop`;
  const action = admin ? "VIEW ORDER IN ADMIN" : "EXPLORE MARU";
  const label = (text: string) => `<p style="margin:0 0 12px;font:10px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#77716b">${text}</p>`;
  const itemHtml = items.map((i) => `<tr><td style="padding:18px 0;border-bottom:1px solid #e8e2da;vertical-align:top">
    <p style="margin:0 0 7px;font:20px Georgia,serif;color:#25211e;overflow-wrap:anywhere">${escapeHtml(i.product_name)}</p>
    <p style="margin:0;font:12px Arial,sans-serif;line-height:1.8;color:#77716b">Size ${escapeHtml(i.size)} &nbsp;·&nbsp; Qty ${i.quantity}<br>${escapeHtml(money(i.unit_price))} each</p>
    </td><td style="padding:18px 0 18px 12px;border-bottom:1px solid #e8e2da;text-align:right;vertical-align:top;font:13px Arial,sans-serif;white-space:nowrap">${escapeHtml(money(i.line_total))}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
    <body style="margin:0;padding:0;background:#f5f2ed;color:#25211e">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">Payment confirmed · ${escapeHtml(o.order_number)} · ${escapeHtml(money(o.total))}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ed"><tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fffdf9;border:1px solid #e8e2da">
      <tr><td style="padding:34px 24px;text-align:center;border-bottom:1px solid #e8e2da">
        <a href="${escapeHtml(settings.siteUrl)}" style="text-decoration:none;color:#25211e;font:30px Georgia,serif;letter-spacing:3px">MARU BY MARU</a>
        <p style="margin:12px 0 0;font:9px Arial,sans-serif;letter-spacing:3px;color:#77716b">REFINED SILHOUETTES. TIMELESS EXPRESSION.</p>
      </td></tr>
      <tr><td style="padding:34px 24px 24px">${label(admin ? "NEW PAID ORDER" : "PAYMENT CONFIRMED")}
        <h1 style="margin:0;font:36px Georgia,serif;line-height:1.2;font-weight:normal">${title}</h1>
        <p style="margin:20px 0 0;font:14px Arial,sans-serif;line-height:1.9;color:#655f58">${escapeHtml(intro)}</p>
      </td></tr>
      <tr><td style="padding:0 24px 26px"><div style="padding:20px;background:#f5f2ed">
        ${label("YOUR ORDER")}
        <p style="margin:0;font:21px Georgia,serif;overflow-wrap:anywhere">${escapeHtml(o.order_number)}</p>
        <p style="margin:12px 0 0;font:12px Arial,sans-serif;line-height:1.9;color:#655f58;overflow-wrap:anywhere">Placed: ${escapeHtml(date(o.created_at))}<br>Paid: ${escapeHtml(date(o.paid_at))}<br>Method: PayFast<br>Payment reference: ${escapeHtml(o.payment_reference)}</p>
      </div></td></tr>
      <tr><td style="padding:0 24px 30px">${label("THE PIECES")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemHtml}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px">${totals.map(([name, value], index) => `<tr><td style="padding:8px 0;font:${index === totals.length - 1 ? "20px Georgia,serif" : "12px Arial,sans-serif"}">${escapeHtml(name)}</td><td style="padding:8px 0;text-align:right;font:${index === totals.length - 1 ? "20px Georgia,serif" : "12px Arial,sans-serif"};white-space:nowrap">${escapeHtml(money(value))}</td></tr>`).join("")}</table>
      </td></tr>
      <tr><td style="padding:0 24px 28px">${label("DELIVERY DETAILS")}
        <p style="margin:0;font:13px Arial,sans-serif;line-height:1.9;color:#655f58">${address.map(escapeHtml).join("<br>")}</p>
        ${admin ? `<p style="font:13px Arial,sans-serif;line-height:1.9;overflow-wrap:anywhere">${escapeHtml(o.customer_email)}<br>${escapeHtml(o.customer_phone)}</p>` : ""}
        ${o.customer_notes ? `<p style="margin:18px 0 0;font:12px Arial,sans-serif;line-height:1.9;color:#655f58"><strong>Delivery notes</strong><br>${escapeHtml(o.customer_notes).replace(/\n/g, "<br>")}</p>` : ""}
      </td></tr>
      <tr><td style="padding:0 24px 34px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:17px 24px;background:#25211e;color:#fffdf9;text-decoration:none;font:10px Arial,sans-serif;letter-spacing:2px">${action}</a>
        <p style="margin:22px 0 0;font:12px Arial,sans-serif;line-height:1.9;color:#77716b">${admin ? "Admin sign-in is required to manage this order." : "Questions about your order? Reply to this email and include your order number."}</p>
      </td></tr>
      <tr><td style="padding:22px 24px;border-top:1px solid #e8e2da;text-align:center;font:11px Arial,sans-serif;line-height:1.9;color:#77716b">Maru By Maru<br><a href="mailto:${escapeHtml(settings.replyTo)}" style="color:#655f58">${escapeHtml(settings.replyTo)}</a><br>This is your payment confirmation, not a dispatch notification.</td></tr>
    </table></td></tr></table></body></html>`;
  const text = ["MARU BY MARU", title, intro, "", `Order: ${o.order_number}`, `Placed: ${date(o.created_at)}`,
    `Paid: ${date(o.paid_at)}`, `PayFast reference: ${o.payment_reference}`, "", "YOUR PIECES",
    ...items.map((i) => `${i.product_name} | Size ${i.size} | Qty ${i.quantity} | ${money(i.unit_price)} each | ${money(i.line_total)}`),
    "", ...totals.map(([name, value]) => `${name}: ${money(value)}`), "", "DELIVERY DETAILS", ...address,
    ...(admin ? [`Email: ${o.customer_email}`, `Phone: ${o.customer_phone}`] : []),
    ...(o.customer_notes ? [`Delivery notes: ${o.customer_notes}`] : []), "", `${action}: ${url}`,
    `Contact: ${settings.replyTo}`, "This is your payment confirmation, not a dispatch notification."].join("\n");
  return { from: settings.from, to: [admin ? settings.adminEmail : o.customer_email], reply_to: settings.replyTo,
    subject: `${admin ? "New paid order" : "Your Maru order is confirmed"} | ${o.order_number.replace(/[\r\n]/g, " ")}`, html, text };
}

export interface EmailJob {
  id: string; lock_token: string; kind: EmailKind; snapshot: ReceiptSnapshot;
  payload: EmailPayload | null; attempts: number; first_attempt_at: string | null;
}
interface WorkerDependencies {
  apiKey: string; settings: EmailSettings; fetch: typeof fetch;
  prepare: (job: EmailJob, payload: EmailPayload) => Promise<void>;
  complete: (job: EmailJob, providerId: string) => Promise<void>;
  fail: (job: EmailJob, status: "queued" | "failed" | "attention", reason: string, nextAttempt: string) => Promise<void>;
  now: () => number;
}
export async function processOrderEmail(job: EmailJob, deps: WorkerDependencies): Promise<void> {
  const retry = (reason: string, permanent = false) => deps.fail(job,
    permanent ? "failed" : job.attempts >= 8 ? "attention" : "queued", reason,
    new Date(deps.now() + Math.min(60 * 2 ** Math.min(job.attempts, 8), 3600) * 1000).toISOString());
  if (job.first_attempt_at && deps.now() - Date.parse(job.first_attempt_at) >= 23 * 3600 * 1000) {
    await deps.fail(job, "attention", "Retry window expired. Check Resend before resending.", new Date(deps.now()).toISOString());
    return;
  }
  let payload = job.payload;
  if (!payload) {
    try { payload = buildOrderEmail(job.snapshot, job.kind, deps.settings); }
    catch { await retry("Invalid receipt data. Review the order before sending.", true); return; }
    // Save exact content/recipients BEFORE talking to Resend so every retry is identical.
    await deps.prepare(job, payload);
  }
  let response: Response;
  try {
    response = await deps.fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json",
        "Idempotency-Key": `maru-payment/${job.id}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
  } catch { await retry("Resend connection interrupted; retrying safely."); return; }
  if (!response.ok) {
    // Do not persist provider bodies: they can echo addresses or other personal data.
    await retry(`Resend returned HTTP ${response.status}.`, response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status));
    return;
  }
  let providerId: string;
  try {
    const result = await response.json();
    if (typeof result.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.id)) throw new Error();
    providerId = result.id;
  } catch { await retry("Resend acknowledgement was unreadable; retrying safely."); return; }
  // If this fails, the lease expires and the same idempotency key is retried.
  await deps.complete(job, providerId);
}
