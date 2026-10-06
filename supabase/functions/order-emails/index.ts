import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { emailSettings, processOrderEmail, type EmailJob } from "../_shared/order-email.ts";

// Only the scheduler can invoke this worker. Browser input never supplies an
// email recipient, receipt, order total or payment status.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = Deno.env.get("ORDER_EMAIL_WORKER_TOKEN");
  const received = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (Deno.env.get("ORDER_EMAILS_ENABLED") !== "true") return new Response("Email sending is disabled", { status: 503 });
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("Missing configuration");
    const settings = emailSettings((key) => Deno.env.get(key));
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    for (let index = 0; index < 4; index++) {
      const { data, error } = await db.rpc("claim_order_email");
      if (error) throw new Error("Claim failed");
      const job = data?.[0] as EmailJob | undefined;
      if (!job) break;
      try {
        await processOrderEmail(job, {
          apiKey, settings, fetch, now: Date.now,
          prepare: async (current, payload) => {
            const { data, error } = await db.from("order_emails").update({
              payload, recipient: payload.to[0], first_attempt_at: new Date().toISOString(),
            }).eq("id", current.id).eq("lock_token", current.lock_token).is("payload", null).select("id");
            if (error || data?.length !== 1) throw new Error("Payload save failed");
          },
          complete: async (current, providerId) => {
            const { data, error } = await db.rpc("finish_order_email", {
              p_id: current.id, p_lock_token: current.lock_token, p_provider_id: providerId,
            });
            if (error || !data) throw new Error("Acknowledgement save failed");
          },
          fail: async (current, status, last_error, next_attempt_at) => {
            const { data, error } = await db.from("order_emails").update({ status, last_error, next_attempt_at,
              locked_until: null, lock_token: null }).eq("id", current.id).eq("lock_token", current.lock_token).select("id");
            if (error || data?.length !== 1) throw new Error("Retry save failed");
          },
        });
      } catch {
        console.error(JSON.stringify({ service: "order-emails", event: "job_failed", email_id: job.id }));
      }
      // Stay below Resend's default request-rate limit, including overlapping runs.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    return new Response("ok");
  } catch {
    console.error(JSON.stringify({ service: "order-emails", event: "worker_failed" }));
    return new Response("Email worker unavailable", { status: 503 });
  }
});
