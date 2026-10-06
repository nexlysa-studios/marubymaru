import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:svix@1.76.1";
import { createResendWebhookHandler } from "../_shared/resend-webhook-handler.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return createResendWebhookHandler({
    verify: (body, headers) => new Webhook(secret).verify(body, headers),
    record: async (eventId, providerId, status, occurredAt) => {
      const { error } = await db.rpc("record_order_email_event", {
        p_event_id: eventId, p_provider_id: providerId, p_status: status, p_occurred_at: occurredAt,
      });
      if (error) {
        console.error(JSON.stringify({ service: "resend-webhook", event: "event_save_failed" }));
        throw new Error("Event save failed");
      }
    },
  })(req);
});
