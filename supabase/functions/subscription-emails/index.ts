import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { marketingSettings } from "../_shared/marketing-email.ts";
import { processSubscriptionEmail, type SubscriptionJob } from "../_shared/subscription-email.ts";

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = Deno.env.get("ORDER_EMAIL_WORKER_TOKEN");
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: lease, error: leaseError } = await db.rpc("acquire_subscription_worker");
  if (leaseError) return new Response("Unavailable", { status: 503 });
  if (!lease) return new Response("Already running");
  try {
    const settings = marketingSettings(key => Deno.env.get(key));
    const adminEmail = Deno.env.get("ORDER_EMAIL_ADMIN") ?? "";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error();
    const started = Date.now();
    for (let index = 0; index < 20 && Date.now() - started < 45_000; index++) {
      const { count, error: receiptError } = await db.from("order_emails").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"]);
      if (receiptError) throw receiptError;
      if (count) break;
      const { data, error } = await db.rpc("claim_subscription_notification");
      if (error) throw error;
      if (!data) break;
      const job = data as SubscriptionJob;
      await processSubscriptionEmail(job, { settings, adminEmail, apiKey, fetch, now: Date.now,
        prepare: async payload => {
          const { data, error } = await db.from("subscription_notifications").update({ payload, recipient: payload.to[0], first_attempt_at: new Date().toISOString() }).eq("id", job.id).eq("lock_token", job.lock_token).is("payload", null).select("id");
          if (error || data?.length !== 1) throw new Error("Lease expired");
        },
        allowed: async () => { const { data, error } = await db.rpc("subscription_notification_allowed", { p_id: job.id, p_token: job.lock_token }); if (error) throw error; return data === true; },
        complete: async id => { const { error } = await db.rpc("finish_subscription_notification", { p_id: job.id, p_token: job.lock_token, p_provider_id: id }); if (error) throw error; },
        fail: async (status, last_error, next_attempt_at) => {
          const { error } = await db.from("subscription_notifications").update({ status, last_error, next_attempt_at, locked_until: null, lock_token: null }).eq("id", job.id).eq("lock_token", job.lock_token);
          if (error) throw error;
        },
      });
      await new Promise(resolve => setTimeout(resolve, 1300));
    }
    return new Response("ok");
  } catch { console.error("Subscription notification worker incomplete; queued notifications remain retryable."); return new Response("Unavailable", { status: 503 }); }
  finally { await db.rpc("release_subscription_worker", { p_token: lease }); }
});
