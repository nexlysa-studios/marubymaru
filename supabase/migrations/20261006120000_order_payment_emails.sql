-- Durable outbox. No historical orders are backfilled or emailed by this migration.
CREATE TABLE public.order_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('customer_payment', 'admin_payment')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'attention')),
  recipient text,
  provider_id text UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  locked_until timestamptz,
  lock_token uuid,
  last_error text,
  snapshot jsonb NOT NULL,
  payload jsonb,
  sent_at timestamptz,
  delivery_status text CHECK (delivery_status IN ('sent','delivered','delayed','bounced','complained','failed','suppressed')),
  delivery_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);
CREATE INDEX order_emails_due_idx ON public.order_emails(next_attempt_at) WHERE status IN ('queued','processing');
ALTER TABLE public.order_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_emails TO service_role;
-- Only metadata is exposed to admins, never the stored email body/snapshot.
GRANT SELECT (id, order_id, kind, status, recipient, provider_id, attempts, last_error,
  sent_at, delivery_status, delivery_updated_at, created_at) ON public.order_emails TO authenticated;
CREATE POLICY "Admins can read email status" ON public.order_emails FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE TABLE public.order_email_events (
  event_id text PRIMARY KEY,
  provider_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','delivered','delayed','bounced','complained','failed','suppressed')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_email_events_provider_idx ON public.order_email_events(provider_id);
ALTER TABLE public.order_email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_email_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_email_events TO service_role;

CREATE FUNCTION public.queue_paid_order_emails() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_snapshot jsonb;
BEGIN
  -- PayFast's service-role ITN is the payment authority. Fulfilment edits do not enqueue mail.
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    v_snapshot := jsonb_build_object(
      'order', to_jsonb(NEW) - 'admin_notes',
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'size', i.size, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'line_total', i.line_total
      ) ORDER BY i.created_at, i.id) FROM public.order_items i WHERE i.order_id = NEW.id), '[]'::jsonb)
    );
    INSERT INTO public.order_emails(order_id, kind, snapshot)
    VALUES (NEW.id, 'customer_payment', v_snapshot), (NEW.id, 'admin_payment', v_snapshot)
    ON CONFLICT (order_id, kind) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_paid_order_emails() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_paid_order_emails AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_paid_order_emails();

-- Preserve the existing admin fulfilment workflow, but never let a browser mark
-- an order paid or change its receipt amounts. ITN uses service_role and retains access.
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (status, admin_notes) ON public.orders TO authenticated;

CREATE FUNCTION public.claim_order_email() RETURNS SETOF public.order_emails
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Resend idempotency expires at 24h. Stop uncertain retries before that boundary.
  UPDATE public.order_emails SET status = 'attention', locked_until = NULL,
    last_error = 'Automatic retries stopped. Check Resend before resending to avoid duplicates.'
  WHERE status IN ('queued','processing') AND first_attempt_at < now() - interval '23 hours'
    AND (locked_until IS NULL OR locked_until < now());
  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.order_emails
    WHERE ((status = 'queued' AND next_attempt_at <= now())
      OR (status = 'processing' AND locked_until < now()))
      AND (first_attempt_at IS NULL OR first_attempt_at >= now() - interval '23 hours')
    ORDER BY next_attempt_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.order_emails e SET status = 'processing', lock_token = gen_random_uuid(),
    locked_until = now() + interval '2 minutes', attempts = attempts + 1
  FROM candidate c WHERE e.id = c.id RETURNING e.*;
END;
$$;

-- Called by both the send acknowledgement and webhook path, under a shared
-- advisory lock. Events arriving before a send acknowledgement are not lost.
CREATE FUNCTION public.sync_order_email_delivery(p_provider_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.order_emails e SET delivery_status = latest.status, delivery_updated_at = latest.occurred_at
  FROM (
    SELECT status, occurred_at FROM public.order_email_events WHERE provider_id = p_provider_id
    ORDER BY CASE status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4
      WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END DESC,
      occurred_at DESC LIMIT 1
  ) latest WHERE e.provider_id = p_provider_id;
END;
$$;

CREATE FUNCTION public.finish_order_email(p_id uuid, p_lock_token uuid, p_provider_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider_id, 0));
  UPDATE public.order_emails SET status = 'sent', provider_id = p_provider_id,
    sent_at = now(), locked_until = NULL, lock_token = NULL, last_error = NULL
  WHERE id = p_id AND lock_token = p_lock_token AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.sync_order_email_delivery(p_provider_id);
  RETURN v_count = 1;
END;
$$;

CREATE FUNCTION public.record_order_email_event(p_event_id text, p_provider_id text, p_status text, p_occurred_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider_id, 0));
  INSERT INTO public.order_email_events(event_id, provider_id, status, occurred_at)
  VALUES (p_event_id, p_provider_id, p_status, p_occurred_at) ON CONFLICT DO NOTHING;
  PERFORM public.sync_order_email_delivery(p_provider_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_order_email_delivery(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_order_email(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_order_email_event(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_email() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_order_email_delivery(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_order_email(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_order_email_event(text, text, text, timestamptz) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- No credentials in migrations. Provision order_email_worker_token and
-- order_email_worker_url in Vault before activating sending in Edge secrets.
CREATE FUNCTION public.dispatch_order_emails() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token text; v_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.order_emails WHERE status IN ('queued','processing') AND next_attempt_at <= now()) THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'order_email_worker_token';
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'order_email_worker_url';
  IF v_token IS NULL OR v_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_token),
    body := '{}'::jsonb, timeout_milliseconds := 90000);
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_order_emails() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('maru-order-emails', '* * * * *', 'SELECT public.dispatch_order_emails()');
