import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
const schema = z.object({ action: z.enum(["status", "start", "cancel"]), token: z.string().uuid() });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // GET cannot cancel an order: email link scanners may follow links automatically.
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text(); if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const parsed = schema.safeParse(JSON.parse(raw)); if (!parsed.success) return json({ error: "Invalid payment link or action" }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await db.rpc("order_payment_recovery", { p_token: parsed.data.token, p_action: parsed.data.action });
    if (error) throw error;
    if (data?.error) return json(data);
    if (parsed.data.action !== "start" || data.payment_status !== "pending" || !data.can_pay) return json(data);
    // Use the existing proven signer; never accept a browser amount, order ID,
    // gateway URL or return origin for reminder payments.
    const origin = new URL(Deno.env.get("ORDER_EMAIL_SITE_URL") ?? "").origin;
    if (!origin.startsWith("https://")) throw new Error();
    const { data: checkout, error: checkoutError } = await db.functions.invoke("payfast-checkout", { body: { action: "start", order_id: data.order_id, origin } });
    if (checkoutError || !checkout?.action) return json({ error: "We couldn't connect to PayFast. Check the payment status and try again." }, 503);
    return json({ ...data, checkout });
  } catch { return json({ error: "Payment recovery is temporarily unavailable. Please try again or contact Maru." }, 503); }
});
