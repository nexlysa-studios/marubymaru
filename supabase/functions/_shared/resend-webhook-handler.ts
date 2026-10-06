const statuses: Record<string, string> = {
  "email.sent": "sent", "email.delivered": "delivered", "email.delivery_delayed": "delayed",
  "email.bounced": "bounced", "email.complained": "complained", "email.failed": "failed", "email.suppressed": "suppressed",
};
interface Event { type: string; created_at: string; data: { email_id: string } }
interface Dependencies {
  verify: (body: string, headers: Record<string, string>) => unknown;
  record: (eventId: string, providerId: string, status: string, occurredAt: string) => Promise<void>;
}
export function createResendWebhookHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let event: Event;
    const eventId = req.headers.get("svix-id") ?? "";
    try {
      const body = await req.text();
      if (body.length > 262144) return new Response("Payload too large", { status: 413 });
      event = deps.verify(body, {
        "svix-id": eventId, "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
        "svix-signature": req.headers.get("svix-signature") ?? "",
      }) as Event;
      if (!eventId || !event?.data?.email_id || typeof event.data.email_id !== "string"
        || !Number.isFinite(Date.parse(event.created_at))) throw new Error();
    } catch { return new Response("Invalid webhook", { status: 400 }); }
    const status = statuses[event.type];
    if (!status) return new Response("ignored");
    try {
      await deps.record(eventId, event.data.email_id, status, event.created_at);
      return new Response("ok");
    } catch { return new Response("Retry later", { status: 503 }); }
  };
}
