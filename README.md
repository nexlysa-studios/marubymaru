# MaruByMaru2

Create a modern, clean, minimalistic ecommerce website for a fashion brand called Maru by Maru.

Brand Identity

Brand name: Maru by Maru

Industry: Women’s dress fashion

Aesthetic: Minimal, elegant, refined, timeless

Color palette:

Primary background: Pure white (#FFFFFF)

Text: Deep black (#000000)

NO other colors allowed (no greys, no beige, no accent colors)

Typography: Modern serif for headings, clean sans-serif for body

Overall feel: Quiet luxury, high-end, editorial, spacious

Website Structure

1. Homepage

Minimal hero section:

Full-width editorial image of a model wearing a Maru by Maru dress

Centered headline:

“Timeless Dresses. Pure Expression.”

Subtext:

“Designed for simplicity. Crafted for presence.”

Black “Shop Now” button (white text)

Below hero:

Featured Collection (3–4 dresses displayed in grid)

“New Arrivals” section

Minimal brand story preview:

“Maru by Maru creates refined silhouettes for modern women.”

Footer:

Shop

About

Contact

Instagram

Terms & Privacy

2. Shop Page

Clean grid layout (3–4 columns)

White background

Product cards include:

Product image

Dress name

Price

“View Product” or quick add to cart

No borders, no shadows, no color accents

3. Product Page

Minimal layout:

Large product image gallery (left side)

Product details on right:

Dress name

Price

Size selector

Add to Cart button (black background, white text)

Short elegant description

Fabric & care details

Collapsible sections for:

Shipping

Returns

Size Guide

4. About Page

Editorial layout with white space:
Headline:

“Simplicity is Strength.”

Short brand story focused on:

Timeless silhouettes

Quality fabrics

Minimalism

Modern femininity

Include one large black-and-white image.

5. Cart & Checkout

Clean, distraction-free layout

White background

Black typography

Clear order summary

Minimal form fields

Secure checkout flow

Design Rules (Very Important)

Use ONLY black and white.

No gradients.

No color highlights.

No drop shadows.

No rounded playful buttons — keep edges refined and sharp.

Lots of white space.

Smooth subtle transitions (fade-in only).

Elegant hover effect: text underline or slight opacity change.

Functional Requirements

Fully responsive (mobile-first)

Ecommerce enabled (cart, checkout, product management)

CMS enabled for adding new dresses

SEO optimized structure

Fast loading

Instagram integration

Email subscription (minimal black input field)

Tone of Voice

Sophisticated

Calm

Minimal

Confident

No excessive marketing language

If possible, style inspiration should feel like:

Luxury editorial fashion

Scandinavian minimalism

High-end boutique ecommerce

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/738e32b3-9b40-4145-9ed4-80ebd6993910).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Sales and the Maru List

- In **Admin → Products → Edit**, enable **On sale** and enter a sale price below the regular price. Saving an active sale immediately dispatches a subscriber announcement after commit. A five-second queue check provides recovery without invoking the email worker when there is no due work. Delivery normally starts within a few seconds; provider throttling, retries and recipient mail servers can delay inbox arrival. Each real sale change can send an announcement; unrelated edits and ending a sale do not. Historical orders are not repriced. Apply `20261120140000_immediate_sale_notifications.sql` to replace the original five-minute grouping window.
- Discount codes only apply to full-price merchandise. Sale items do not count towards coupon minimum spend. Shipping remains R99, free from R1,500 after discounts.
- **Admin → Discount codes** has an optional **Email subscribers** checkbox (off by default), and an announcement action for existing codes. Sharing a code by email does not make it subscriber-only. A version of an offer can only be announced once; scheduled offers wait until they start.
- **Admin → Newsletter** shows subscribers, campaign previews and delivery counts. Add the real business physical/postal address before enabling sending. The footer contact email is configured through the `NEWSLETTER_CONTACT_EMAIL` Edge secret. The verified domain sender and reply-to still use the existing order-email secrets; changing `ORDER_EMAIL_ADMIN` changes the single admin test recipient and paid-order notification recipient.
- Signup is immediate with explicit consent and no verification step. Each new subscriber receives a welcome confirmation with a website unsubscribe link, and the admin receives a new-subscriber notification. The website asks for confirmation before unsubscribing; an actual unsubscribe sends a one-time confirmation to the subscriber and a notification to admin. Duplicate signups (including changed letter case) are rejected without sending extra emails. Existing customers are never automatically subscribed. Previously unsubscribed or suppressed addresses are not silently reactivated by signup; handle genuine rejoin requests with the store owner after confirming consent. Unsubscribing from newsletters does not stop order confirmations.
- Newsletter delivery uses a separate durable Supabase queue and Resend `/emails` requests, not Resend Broadcast contacts. These sends share the account's email quota. The marketing worker yields to waiting order receipts and throttles delivery. Check the Resend allowance before running large campaigns. Stored payloads and idempotency keys make retries safe; ambiguous sends stop for review before Resend's 24-hour idempotency window expires.
- New subscriptions do not receive historical announcements. Stale, changed, paused, exhausted or ended offers are skipped/cancelled before sending. Emails are typography-first and link to product pages; private product images are not exposed or embedded as expiring signed URLs.
- Marketing delivery is **paused by default**. In production the backend migrations and `newsletter`, `marketing-admin`, and `marketing-emails` functions must be deployed before publishing the frontend. The scheduler reuses the existing worker token and Vault endpoint configuration, without exposing them to browsers. No historical sale or coupon campaigns are backfilled.

### Subscription confirmation emails

Deploy `20261120130000_subscription_notifications.sql` and the `subscription-emails` function along with the updated `newsletter` and `marketing-emails` functions. The notification outbox is private, uses the existing verified sender/Resend key and `ORDER_EMAIL_ADMIN`, and has a minute-by-minute recovery scheduler plus immediate post-commit dispatch. These non-promotional action confirmations are independent of the marketing pause and postal-address requirement. They do not enable campaigns. Old subscribers are not emailed retroactively. `Admin → Newsletter → Signup & unsubscribe emails` shows recent delivery results; sent means accepted by Resend, not guaranteed inbox delivery. Retries preserve their exact content and recipient, and repeated actions do not enqueue duplicates.

To test after publishing the frontend: sign up with a fresh real address and explicit consent, check the success popup and welcome/admin emails, try the same address again to confirm the duplicate warning, then follow the welcome email's unsubscribe link. Choose **Keep me on the list** to leave without changing consent, or **Yes, unsubscribe** to stop marketing and receive the final subscriber/admin confirmations. Allow about a minute for queued delivery and check spam folders. Do not create fabricated-address signups in production: actual welcome emails now send automatically.

Validation: `npm run test`, `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`, and `npx deno check supabase/functions/newsletter/index.ts supabase/functions/marketing-admin/index.ts supabase/functions/marketing-emails/index.ts`. Run `supabase/tests/newsletter_sales.sql` and `supabase/tests/shipping_policy.sql` only inside a transaction that is rolled back; never commit synthetic fixtures or send test emails to fabricated addresses.

### Sale browsing and unpaid-order reminders

- Sale announcement emails link to `/shop?collection=sale`. The shop exposes a **Sale edit** shortcut on every screen size and a **Sale** filter in the desktop sidebar/mobile drawer. Category, size and price filters work together; sale price is used for price filtering and sorting.
- Apply `20261120150000_payment_reminders.sql` and deploy `payment-reminders`, `payment-recovery`, and the updated `payfast-checkout`. The worker reuses the existing Resend, order-email site/sender and worker secrets. No payment credentials belong in the browser. The minute scheduler remains idle when reminders are paused or no reminder is due.
- **Publish the frontend before enabling reminders.** In **Admin → Orders → Payment reminders**, select **Enable reminders** after `/payment/reminder` is live. Enabling starts with orders created afterwards; old pending/test orders are never backfilled. Pausing and enabling again starts a new window. Email links always use the production website, including orders placed through localhost.
- Each eligible order receives at most one reminder once it has been pending for 15 minutes (normally picked up within the next minute, subject to email delivery/retries). Paid, failed, cancelled, payment-reference-bearing and fulfilment-in-progress orders are excluded. Delivery history is visible in the same admin panel and on the order detail page. A queued reminder rechecks eligibility immediately before sending. An in-flight payment confirmation can still cross with a reminder; the website rechecks status before any action and explicitly warns against paying twice.
- **Pay now** opens a private website page, then continues to the existing PayFast gateway using that order's saved total. It creates no duplicate order and does not reprice historical purchases. Reminder tokens expire after 48 hours, are not exposed to frontend database queries, and reveal no customer contact/address details. **Cancel** opens a confirmation page; only an explicit button press cancels the unpaid order, so email scanners cannot cancel it by following a link. Already-signed/in-flight PayFast sessions cannot be revoked by this website action.
- Only verified PayFast ITNs mark payment as paid and trigger the existing customer/admin confirmation emails. A valid late payment after cancellation is still recorded and sends those confirmations; the order stays flagged as cancelled for the owner to review rather than silently proceeding with fulfilment. Changing the admin reminder switch does not disable payment status, cancellation links, normal checkout, or paid-order receipts. Newsletter unsubscribes do not stop transactional order reminders.
- Test after publishing: enable reminders, place a **new** order for at least R5, leave it unpaid, and wait 15–16 minutes plus provider delivery time. Follow each email action to check status; completing payment follows the existing live PayFast flow. Do not pay the same order in multiple windows. Automated checks: `npm run test`, `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`, and `npx deno check supabase/functions/payment-reminders/index.ts supabase/functions/payment-recovery/index.ts supabase/functions/payfast-checkout/index.ts`. Run `supabase/tests/payment_reminders.sql` only inside `BEGIN` / `ROLLBACK`; never commit its synthetic orders or queued emails.

### Automatic unpaid-order expiry

Apply `20261120160000_expire_unpaid_orders.sql` and deploy `order-expiry`, `payfast-checkout`, and `payment-reminders`. Once an order's **sent reminder** reaches its existing 48-hour link deadline, the minute scheduler cancels it only if payment is still pending, fulfilment is still new, and no paid timestamp or payment reference exists. Historical orders without a sent reminder, unsent reminders, paid orders, manually cancelled orders and fulfilment-in-progress orders are untouched. Pausing future reminders does not remove deadlines already communicated. The checkout signer also checks expiry before allowing a new payment form.

Cancellation and its unique customer email are queued in the same transaction. The email explains that payment confirmation was not received before the deadline, links to the shop for a new order, and asks customers who already paid to contact Maru before paying again. The private `order_cancellation_emails` outbox uses the existing Resend configuration, immutable payloads, bounded retries and idempotency protection; it rechecks payment before sending. This transactional email is independent of newsletter consent. Admin order details retain `cancellation_reason = payment_window_expired`. A PayFast session already opened cannot be revoked: a late verified payment is recorded normally, suppresses any unsent cancellation email, and leaves fulfilment cancelled for admin review. Existing paid-order customer/admin receipts still run. Run `supabase/tests/order_expiry.sql` inside `BEGIN` / `ROLLBACK` only; never commit its synthetic orders or outbox rows.
