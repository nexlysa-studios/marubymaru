import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { marketingSettings } from "../_shared/marketing-email.ts";
import { processPaymentReminder, type ReminderJob } from "../_shared/payment-reminder.ts";
Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = Deno.env.get("ORDER_EMAIL_WORKER_TOKEN");
  const actual = Buffer.from(req.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${token}`);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: lease, error: leaseError } = await db.rpc("acquire_reminder_worker");
  if (leaseError) return new Response("Unavailable", { status: 503 });
  if (!lease) return new Response("Disabled or already running");
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY"); if (!apiKey) throw new Error();
    const settings = marketingSettings(key => Deno.env.get(key));
    const { error } = await db.rpc("queue_payment_reminders"); if (error) throw error;
    const started = Date.now();
    for (let index = 0; index < 20 && Date.now() - started < 45_000; index++) {
      const { count, error } = await db.from("order_emails").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"]);
      if (error) throw error; if (count) break;
      const { data, error: claimError } = await db.rpc("claim_payment_reminder"); if (claimError) throw claimError; if (!data) break;
      const job = data as ReminderJob;
      await processPaymentReminder(job, { apiKey, settings, fetch, now: Date.now,
        prepare: async payload => {
          const { data, error } = await db.from("payment_reminders").update({ payload, recipient: payload.to[0], first_attempt_at: new Date().toISOString() }).eq("id", job.id).eq("lock_token", job.lock_token).is("payload", null).select("id");
          if (error || data?.length !== 1) throw new Error("Lease expired");
        },
        allowed: async () => { const { data, error } = await db.rpc("payment_reminder_allowed", { p_id: job.id, p_token: job.lock_token }); if (error) throw error; return data === true; },
        complete: async id => { const { error } = await db.rpc("finish_payment_reminder", { p_id: job.id, p_token: job.lock_token, p_provider_id: id }); if (error) throw error; },
        fail: async (status, last_error, next_attempt_at) => {
          const { error } = await db.from("payment_reminders").update({ status, last_error, next_attempt_at, locked_until: null, lock_token: null }).eq("id", job.id).eq("lock_token", job.lock_token); if (error) throw error;
        },
      });
      await new Promise(resolve => setTimeout(resolve, 1300));
    }
    return new Response("ok");
  } catch { console.error("Payment reminder worker incomplete; queued reminders remain retryable."); return new Response("Unavailable", { status: 503 }); }
  finally { await db.rpc("release_reminder_worker", { p_token: lease }); }
});
