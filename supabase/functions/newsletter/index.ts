import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const signup = z.object({ email: z.string().trim().email().max(320), consent: z.literal(true), website: z.string().max(500).optional() });
const uuid = z.string().uuid();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  // A GET never changes consent: link scanners must not unsubscribe readers.
  if (req.method === "GET" && url.searchParams.get("action") === "unsubscribe" && uuid.safeParse(token).success) {
    return new Response(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leave the Maru List</title><body style="font:16px Georgia;padding:48px;max-width:560px;margin:auto"><h1>Leave the Maru List</h1><p>Stop receiving sale and promotion emails. Your order confirmations are unaffected.</p><form method="POST"><button style="padding:16px;background:black;color:white;border:0">Unsubscribe</button></form></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 4096) return json({ error: "Request too large" }, 413);
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (url.searchParams.get("action") === "unsubscribe") {
      if (!uuid.safeParse(token).success) return json({ error: "Invalid unsubscribe link" }, 400);
      const { error } = await db.rpc("newsletter_unsubscribe", { p_token: token });
      if (error) throw error;
      return new Response("You have been unsubscribed from the Maru List. Order confirmations are unaffected.", { headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
    }
    const data = signup.safeParse(JSON.parse(raw));
    if (!data.success) return json({ error: "Enter a valid email and agree to receive the Maru newsletter." }, 400);
    if (data.data.website) return json({ ok: true });
    const salt = Deno.env.get("ORDER_EMAIL_WORKER_TOKEN");
    if (!salt) throw new Error("Rate limit configuration missing");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const key = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}/${ip}`)))).map(n => n.toString(16).padStart(2, "0")).join("");
    const { data: result, error } = await db.rpc("newsletter_join", { p_email: data.data.email, p_ip_hash: key });
    if (error?.message.includes("Please wait")) return json({ error: "Please wait before trying again." }, 429);
    if (error) throw error;
    if (result === "already_subscribed") return json({ code: "already_subscribed", error: "This email is already subscribed to the Maru List." }, 409);
    if (result === "unavailable") return json({ code: "unavailable", error: "This email cannot be signed up again here. Contact Maru if you would like to rejoin." }, 409);
    return json({ ok: true, status: "subscribed" });
  } catch { return json({ error: "We couldn't update your newsletter subscription. Please try again." }, 503); }
});
