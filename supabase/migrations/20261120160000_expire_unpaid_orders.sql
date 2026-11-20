-- Expiry follows the existing reminder's 48-hour link deadline, not order age.
-- Unsent reminders and historical orders without a sent reminder are untouched.
ALTER TABLE public.orders ADD COLUMN cancellation_reason text NOT NULL DEFAULT '';
CREATE TABLE public.order_cancellation_emails (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid UNIQUE NOT NULL REFERENCES public.orders(id),
 snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','skipped','failed','attention')),
 payload jsonb, recipient text, provider_id text UNIQUE, attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, lock_token uuid, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX order_cancellation_emails_due ON public.order_cancellation_emails(next_attempt_at) WHERE status IN ('queued','processing');
ALTER TABLE public.order_cancellation_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_cancellation_emails FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.order_cancellation_emails TO service_role;
GRANT SELECT(id,order_id,status,recipient,last_error,created_at,sent_at) ON public.order_cancellation_emails TO authenticated;
CREATE POLICY cancellation_email_admin ON public.order_cancellation_emails FOR SELECT TO authenticated USING((SELECT public.is_admin()));

CREATE FUNCTION public.expire_unpaid_orders(p_order_id uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 -- The order row lock serialises expiry with verified ITNs. Re-check the latest
 -- payment/fulfilment state after taking the lock; never overwrite paid orders.
 WITH due AS (
  SELECT o.id FROM public.orders o JOIN public.payment_reminders r ON r.order_id=o.id
  WHERE (p_order_id IS NULL OR o.id=p_order_id) AND r.status='sent' AND r.sent_at IS NOT NULL AND r.expires_at<=now()
   AND o.payment_status='pending' AND o.status='new' AND o.paid_at IS NULL AND o.payment_reference=''
  ORDER BY r.expires_at LIMIT 200 FOR UPDATE OF o
 ), cancelled AS (
  UPDATE public.orders o SET status='cancelled',payment_status='cancelled',cancellation_reason='payment_window_expired'
  FROM due WHERE o.id=due.id AND o.payment_status='pending' AND o.status='new' AND o.paid_at IS NULL AND o.payment_reference=''
  RETURNING o.*
 ) INSERT INTO public.order_cancellation_emails(order_id,snapshot)
 SELECT id,jsonb_build_object('order_number',order_number,'email',customer_email,'first_name',customer_first_name,'total',total,'created_at',created_at)
 FROM cancelled ON CONFLICT(order_id) DO NOTHING;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;

CREATE FUNCTION public.claim_cancellation_email() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.order_cancellation_emails%ROWTYPE;
BEGIN
 UPDATE public.order_cancellation_emails SET status='attention',locked_until=NULL,last_error='Retry window expired. Check Resend before resending.'
 WHERE status IN ('queued','processing') AND first_attempt_at<now()-interval '23 hours' AND (locked_until IS NULL OR locked_until<now());
 UPDATE public.order_cancellation_emails e SET status='skipped',locked_until=NULL,last_error='Order payment or cancellation status changed.'
 FROM public.orders o WHERE e.order_id=o.id AND e.status IN ('queued','processing') AND (e.locked_until IS NULL OR e.locked_until<now())
 AND (o.payment_status<>'cancelled' OR o.status<>'cancelled' OR o.paid_at IS NOT NULL OR o.payment_reference<>'' OR o.cancellation_reason<>'payment_window_expired');
 WITH candidate AS (SELECT id FROM public.order_cancellation_emails WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND locked_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE public.order_cancellation_emails e SET status='processing',attempts=attempts+1,lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes'
 FROM candidate c WHERE e.id=c.id RETURNING e.* INTO job;
 IF job.id IS NULL THEN RETURN NULL; END IF;
 RETURN to_jsonb(job);
END $$;
CREATE FUNCTION public.cancellation_email_allowed(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.order_cancellation_emails e JOIN public.orders o ON o.id=e.order_id
 WHERE e.id=p_id AND e.lock_token=p_token AND e.status='processing' AND e.locked_until>now()
 AND o.status='cancelled' AND o.payment_status='cancelled' AND o.paid_at IS NULL AND o.payment_reference='' AND o.cancellation_reason='payment_window_expired')
$$;
CREATE FUNCTION public.dispatch_order_expiry() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; endpoint text;
BEGIN
 -- Existing sent reminder deadlines remain valid even if future reminders are paused.
 PERFORM public.expire_unpaid_orders();
 IF NOT EXISTS(SELECT 1 FROM public.order_cancellation_emails WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND locked_until<now())) THEN RETURN; END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='order_email_worker_token';
 SELECT replace(decrypted_secret,'/order-emails','/order-expiry') INTO endpoint FROM vault.decrypted_secrets WHERE name='order_email_worker_url';
 IF token IS NULL OR endpoint IS NULL THEN RETURN; END IF;
 PERFORM net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=90000);
END $$;
REVOKE ALL ON FUNCTION public.expire_unpaid_orders(uuid),public.claim_cancellation_email(),public.cancellation_email_allowed(uuid,uuid),public.dispatch_order_expiry() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders(uuid),public.claim_cancellation_email(),public.cancellation_email_allowed(uuid,uuid),public.dispatch_order_expiry() TO service_role;
SELECT cron.schedule('maru-order-expiry','* * * * *','SELECT public.dispatch_order_expiry()');
NOTIFY pgrst,'reload schema';
