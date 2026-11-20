import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { marketingSettings, processMarketingEmail, type MarketingJob } from "../_shared/marketing-email.ts";

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = Deno.env.get("ORDER_EMAIL_WORKER_TOKEN");
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: lease, error: leaseError } = await db.rpc("acquire_marketing_worker");
  if (leaseError) return new Response("Unavailable", { status: 503 });
  if (!lease) return new Response("Disabled or already running");
  try {
    const settings = marketingSettings(key => Deno.env.get(key));
    const { data: policy, error } = await db.from("newsletter_settings").select("mailing_address").eq("id", true).single();
    if (error || !policy?.mailing_address) throw new Error();
    settings.address = policy.mailing_address;
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error();
    const { error: expandError } = await db.rpc("expand_marketing_campaigns");
    if (expandError) throw expandError;
    const started = Date.now();
    for (let index = 0; index < 20 && Date.now() - started < 45_000; index++) {
      // Payment receipts take precedence when both queues share a Resend account.
      const { count: receiptsWaiting, error: receiptsError } = await db.from("order_emails")
        .select("id", { head: true, count: "exact" }).in("status", ["queued", "processing"]);
      if (receiptsError) throw receiptsError;
      if (receiptsWaiting) break;
      const { count: confirmationsWaiting, error: confirmationsError } = await db.from("subscription_notifications")
        .select("id", { head: true, count: "exact" }).in("status", ["queued", "processing"]);
      if (confirmationsError) throw confirmationsError;
      if (confirmationsWaiting) break;
      const { data, error } = await db.rpc("claim_marketing_delivery");
      if (error) throw error;
      if (!data) break;
      const job = data as MarketingJob;
      await processMarketingEmail(job, { settings, apiKey, fetch, now: Date.now,
        prepare: async payload => {
          const { data, error } = await db.from("marketing_deliveries").update({ payload, first_attempt_at: new Date().toISOString() }).eq("id", job.id).eq("lock_token", job.lock_token).is("payload", null).select("id");
          if (error || data?.length !== 1) throw new Error("Lease expired");
        },
        allowed: async () => {
          const { data, error } = await db.rpc("marketing_delivery_allowed", { p_id: job.id, p_token: job.lock_token });
          if (error) throw error;
          return data === true;
        },
        complete: async id => { const { error } = await db.rpc("finish_marketing_delivery", { p_id: job.id, p_token: job.lock_token, p_provider_id: id }); if (error) throw error; },
        fail: async (status, last_error, next_attempt_at) => {
          const { error } = await db.from("marketing_deliveries").update({ status, last_error, next_attempt_at, locked_until: null, lock_token: null }).eq("id", job.id).eq("lock_token", job.lock_token);
          if (error) throw error;
        },
      });
      await new Promise(resolve => setTimeout(resolve, 1300));
    }
    const { error: finishError } = await db.rpc("finish_marketing_campaigns");
    if (finishError) throw finishError;
    return new Response("ok");
  } catch { console.error("Marketing worker could not complete; queued jobs remain retryable."); return new Response("Unavailable", { status: 503 }); }
  finally { await db.rpc("release_marketing_worker", { p_token: lease }); }
});
