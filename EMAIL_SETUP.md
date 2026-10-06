# Maru transactional order emails

## Deployment state (6 October 2026)

- The supplied `RESEND_API_KEY` was saved in Supabase secrets, never in source files.
- The key is **sending-only**. Resend rejects domain/webhook management calls with `401 restricted_api_key`; this does not make it invalid for sending. Create the delivery webhook in the Resend dashboard.
- Automatic sending is **enabled** (`ORDER_EMAILS_ENABLED=true`). Saved settings were verified by comparing their hashes; Resend accepted the admin setup-test email.
- The email migration, minute-by-minute scheduler, encrypted scheduler credentials, `order-emails` and `resend-webhook` functions are deployed.
- Sender: `Maru By Maru <orders@marubymaru.co.za>`.
- Admin recipient and reply-to: `orders@marubymaru.co.za`.
- Store/admin links use `https://marubymaru.co.za`.
- Deploy the frontend changes through your normal Netlify workflow to see the Order emails panel.
- No historical orders were backfilled and no real payments were initiated during setup. One clearly labelled setup test was accepted by Resend for the admin inbox, separate from order confirmations (provider ID `01a11093-5b05-7c5f-8119-a39107b5f6a4`). Inbox delivery is not yet verified.

## Finish activation

1. `RESEND_API_KEY` is already stored in Supabase **Edge Functions → Secrets**. A sending-only key scoped to the verified domain is enough to send. Keep keys out of `.env`, `VITE_*`, source control and chat. Domain/webhook management needs a full-access key or the Resend dashboard. Since the key was shared in chat, rotate it directly in Resend/Supabase before public launch.
2. In Resend **Webhooks**, add this endpoint:

   ```text
   https://ewfxapllzhuniwqvsyxm.supabase.co/functions/v1/resend-webhook
   ```

   Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` and `email.suppressed` (where available).
3. Copy the webhook signing secret into Supabase as `RESEND_WEBHOOK_SECRET`. This is a separate `whsec_...` secret, not the API key. The endpoint rejects unverified payloads and expired signatures.
4. Confirm `orders@marubymaru.co.za` is a real monitored mailbox or forwarding address. Verifying a sending domain with Resend does **not** create a mailbox for replies/admin notifications.
5. Check any queued records in Admin → Orders → an order → Order emails. Orders newly paid after this migration are queued even while sending is disabled; enabling the worker sends those queued confirmations.
6. `ORDER_EMAILS_ENABLED=true` is already set for this project. If you paused sending while configuring the webhook, restore it afterward. Secret updates do not require redeploying the functions.
7. Complete one controlled checkout (PayFast is currently live, so this charges real money). Confirm both messages arrive, all receipt values match the order, the order is Paid and the two email records progress from Queued → Sent → Delivered. Delivery may take longer than sending. A Resend delivery event means recipient-server acceptance, not that someone read the email.

Inspect Resend's error type, not just its HTTP status: `401 restricted_api_key` on a management endpoint means a sending-only key cannot perform that action. It does not establish whether sending is broken.

## How it works

1. The existing, verified PayFast ITN marks an order paid. No changes were made to its payment-validation logic or the checkout/return flow.
2. A database trigger atomically stores two email jobs and a receipt snapshot. Unique `(order_id, kind)` prevents duplicate ITNs or fulfilment edits from creating duplicate emails. Private admin notes are excluded. No customer data or prices are accepted from a browser for sending.
3. Supabase Cron runs every minute and invokes `order-emails` using a dedicated random bearer token from Vault. The worker checks the matching Edge secret. The endpoint is not publicly usable despite `verify_jwt=false`.
4. The worker claims a job under a lease, stores the exact email body and recipient, and sends HTML plus plain text via Resend. It sends up to four messages per invocation. No private product-image URLs are embedded: expiring image links would make older receipts break.
5. Each job uses a stable Resend idempotency key. Transient errors are retried with backoff. Permanent rejections become Failed. Eight failed attempts or 23 hours of uncertain sending becomes Needs review; Resend's idempotency window is only 24 hours, so automatic retries must not continue indefinitely.
6. Signed Resend webhooks update delivery metadata. Event IDs are deduplicated; callbacks arriving before send acknowledgement are retained. A late `sent` event does not overwrite `delivered`, and bounce/complaint outcomes remain visible.

Payments are never undone or changed by email errors. Emails do not promise shipping dates, mark dispatch or claim a refund. Only future transitions to Paid enqueue these payment confirmations. Admin browser permissions are restricted to updating fulfilment status and private notes; payment flags and receipt totals remain server-managed.

## Admin tracking and recovery

The new Order emails section is visible only inside the existing admin order page. It refreshes every 15 seconds and has a manual refresh button. Database RLS permits admins to read status metadata only; anonymous and non-admin users cannot read it. Email bodies, snapshots and event internals are not exposed through the browser API.

- **Queued / Sending:** allow the next scheduler run; check that sending is enabled.
- **Sent:** Resend accepted the API request, but no delivery confirmation has arrived yet. Check the webhook setup if this never advances.
- **Delivery delayed:** Resend is still attempting delivery. Do not create another send.
- **Failed:** inspect the Resend HTTP code and configuration/address.
- **Bounced / Suppressed / Marked as spam:** investigate the recipient; do not automatically resend.
- **Needs review:** inspect the Resend log using the recorded provider ID or `maru-payment/<email-job-id>` idempotency key before any manual action. Do not blindly reset it: a message may have been delivered even if acknowledgement was lost.

Do not edit a stored payload while retrying the same key, delete queue rows to force a resend, or manually mark orders paid to trigger emails. No bulk resend/backfill button is included, to avoid accidentally emailing earlier sandbox orders or duplicate confirmations.

Disable only email sending with `ORDER_EMAILS_ENABLED=false`; PayFast continues to work and future paid orders remain queued. Keep the scheduler token synchronized between Edge secrets (`ORDER_EMAIL_WORKER_TOKEN`) and Vault (`order_email_worker_token`). Vault also contains `order_email_worker_url`.

## Deployment notes

The existing database had some manually applied migrations missing from its migration history. Only `20261006120000_order_payment_emails.sql` was applied and recorded during this change; unrelated migration history was not modified. Do not blindly run `db push --include-all` against this database.

```powershell
supabase functions deploy order-emails --project-ref ewfxapllzhuniwqvsyxm --no-verify-jwt --use-api
supabase functions deploy resend-webhook --project-ref ewfxapllzhuniwqvsyxm --no-verify-jwt --use-api
```

For a fresh environment, apply the migrations first, configure the Edge secrets and provision the two Vault secrets before enabling sending. Never put the service-role key, Resend key or scheduler token in the frontend.

## Verification

```powershell
npm.cmd test
npx.cmd tsc --noEmit -p tsconfig.app.json
npm.cmd run build
npx.cmd --yes deno check --no-lock --node-modules-dir=none supabase/functions/order-emails/index.ts supabase/functions/resend-webhook/index.ts
npx.cmd --yes deno test --no-lock --node-modules-dir=none supabase/tests/resend-webhook.test.ts
```

`supabase/tests/order_payment_emails.sql` contains synthetic SQL tests: always run inside `BEGIN` / `ROLLBACK`, never commit the fixtures. Database checks were run against the project in a rollback-only transaction before deployment.

References: [Resend sending](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions).
