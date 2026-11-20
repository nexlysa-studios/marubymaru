import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { buildMarketingEmail, marketingSettings, type MarketingContent } from "../_shared/marketing-email.ts";
const bodySchema = z.object({ action: z.enum(["preview", "test"]), campaign_id: z.string().uuid(), request_id: z.string().uuid().optional() });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("authorization") ?? "";
    const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await userDb.auth.getUser();
    if (error || !user) return json({ error: "Sign in first" }, 401);
    const { data: admin, error: adminError } = await userDb.rpc("is_admin");
    if (adminError || !admin) return json({ error: "Administrator access required" }, 403);
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    const parsed = bodySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json({ error: "Invalid request" }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: policy } = await db.from("newsletter_settings").select("mailing_address").eq("id", true).single();
    const { data: campaign } = await db.from("marketing_campaigns").select("snapshot,created_at").eq("id", parsed.data.campaign_id).single();
    if (!campaign) return json({ error: "Campaign not found" }, 404);
    const { data: fresh, error: contentError } = await db.rpc("marketing_content", { p_id: parsed.data.campaign_id });
    if (contentError) throw contentError;
    const content = (campaign.snapshot ?? fresh) as MarketingContent | null;
    if (!content) return json({ error: "No currently available offer to preview. Scheduled codes can be previewed once active." }, 400);
    const settings = marketingSettings(key => Deno.env.get(key));
    settings.address = policy?.mailing_address || "[Business postal address required before sending]";
    const adminEmail = Deno.env.get("ORDER_EMAIL_ADMIN") ?? "";
    const payload = buildMarketingEmail(content, adminEmail, "00000000-0000-4000-8000-000000000000", settings);
    const { count } = await db.from("newsletter_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed").lte("subscribed_at", campaign.created_at);
    if (parsed.data.action === "preview") return json({ html: payload.html, subject: payload.subject, recipients: count ?? 0, admin_email: adminEmail });
    if (!policy?.mailing_address || policy.mailing_address.trim().length < 10) return json({ error: "Add the business postal address in Newsletter settings before sending a test." }, 400);
    if (!parsed.data.request_id) return json({ error: "A request ID is required" }, 400);
    payload.subject = `[TEST] ${payload.subject}`;
    // Single fixed server-side recipient; no arbitrary email address accepted.
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json", "Idempotency-Key": `maru-marketing-test/${parsed.data.request_id}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return json({ error: "Resend could not accept the test email. Please check the provider log before retrying." }, 502);
    return json({ ok: true, recipient: adminEmail });
  } catch { return json({ error: "Newsletter preview is temporarily unavailable." }, 503); }
});
