-- Off until the new website recovery route is published. Never backfill old orders.
CREATE TABLE public.payment_reminder_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 enabled_from timestamptz NOT NULL DEFAULT now(), worker_locked_until timestamptz, worker_token uuid
);
INSERT INTO public.payment_reminder_settings(id) VALUES(true);
CREATE TABLE public.payment_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid UNIQUE NOT NULL REFERENCES public.orders(id),
 token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(), expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours',
 snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','skipped','failed','attention')),
 payload jsonb, recipient text, provider_id text UNIQUE, attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, lock_token uuid, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, delivery_status text, delivery_updated_at timestamptz
);
CREATE INDEX payment_reminders_due ON public.payment_reminders(next_attempt_at) WHERE status IN ('queued','processing');
ALTER TABLE public.payment_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reminder_settings,public.payment_reminders FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.payment_reminder_settings,public.payment_reminders TO service_role;
GRANT SELECT(id,enabled,enabled_from) ON public.payment_reminder_settings TO authenticated;
GRANT SELECT(id,order_id,status,recipient,attempts,last_error,created_at,sent_at,delivery_status,delivery_updated_at,expires_at) ON public.payment_reminders TO authenticated;
CREATE POLICY reminder_settings_admin ON public.payment_reminder_settings FOR SELECT TO authenticated USING((SELECT public.is_admin()));
CREATE POLICY reminders_admin ON public.payment_reminders FOR SELECT TO authenticated USING((SELECT public.is_admin()));

CREATE FUNCTION public.configure_payment_reminders(p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'Choose whether reminders are enabled'; END IF;
 UPDATE public.payment_reminder_settings SET enabled_from=CASE WHEN p_enabled AND NOT enabled THEN now() ELSE enabled_from END,enabled=p_enabled WHERE id;
END $$;
CREATE FUNCTION public.queue_payment_reminders() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.payment_reminders(order_id,snapshot)
 SELECT o.id,jsonb_build_object('order_number',o.order_number,'email',o.customer_email,'first_name',o.customer_first_name,'total',o.total,'created_at',o.created_at)
 FROM public.orders o CROSS JOIN public.payment_reminder_settings s
 WHERE s.id AND s.enabled AND o.created_at>=s.enabled_from AND o.created_at<=now()-interval '15 minutes'
 AND o.payment_status='pending' AND o.status='new' AND o.paid_at IS NULL AND o.payment_reference='' AND o.total>=5
 AND NOT EXISTS(SELECT 1 FROM public.payment_reminders r WHERE r.order_id=o.id)
 ORDER BY o.created_at LIMIT 200 ON CONFLICT(order_id) DO NOTHING;
END $$;
CREATE FUNCTION public.claim_payment_reminder() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job public.payment_reminders%ROWTYPE;
BEGIN
 UPDATE public.payment_reminders SET status='attention',locked_until=NULL,last_error='Retry window expired. Check Resend before resending.'
 WHERE status IN ('queued','processing') AND first_attempt_at<now()-interval '23 hours' AND (locked_until IS NULL OR locked_until<now());
 UPDATE public.payment_reminders d SET status='skipped',last_error='Order paid, cancelled, changed or link expired.' FROM public.orders o,public.payment_reminder_settings s
 WHERE d.order_id=o.id AND d.status IN ('queued','processing') AND (d.locked_until IS NULL OR d.locked_until<now())
 AND (o.payment_status<>'pending' OR o.status<>'new' OR o.paid_at IS NOT NULL OR o.payment_reference<>'' OR d.expires_at<=now() OR (d.snapshot->>'total')::numeric<>o.total OR o.created_at<s.enabled_from);
 WITH candidate AS (SELECT id FROM public.payment_reminders WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND locked_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE public.payment_reminders r SET status='processing',attempts=attempts+1,lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes'
 FROM candidate c WHERE r.id=c.id RETURNING r.* INTO v_job;
 IF v_job.id IS NULL THEN RETURN NULL; END IF;
 RETURN to_jsonb(v_job);
END $$;
CREATE FUNCTION public.payment_reminder_allowed(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.payment_reminders d JOIN public.orders o ON o.id=d.order_id CROSS JOIN public.payment_reminder_settings s
 WHERE d.id=p_id AND d.lock_token=p_token AND d.status='processing' AND d.locked_until>now() AND d.expires_at>now()
 AND s.id AND s.enabled AND o.created_at>=s.enabled_from AND o.created_at<=now()-interval '15 minutes'
 AND o.payment_status='pending' AND o.status='new' AND o.paid_at IS NULL AND o.payment_reference='' AND o.total=(d.snapshot->>'total')::numeric)
$$;
CREATE FUNCTION public.order_payment_recovery(p_token uuid,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.payment_reminders%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
 IF p_action NOT IN ('status','start','cancel') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 SELECT * INTO d FROM public.payment_reminders WHERE token=p_token;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','This payment link is invalid.','code','invalid'); END IF;
 SELECT * INTO o FROM public.orders WHERE id=d.order_id FOR UPDATE;
 -- Paid always wins, including a late verified ITN after a cancellation request.
 IF o.payment_status='paid' THEN RETURN jsonb_build_object('order_id',o.id,'order_number',o.order_number,'total',o.total,'payment_status','paid','can_pay',false); END IF;
 IF o.status='cancelled' OR o.payment_status='cancelled' THEN RETURN jsonb_build_object('order_id',o.id,'order_number',o.order_number,'total',o.total,'payment_status','cancelled','can_pay',false); END IF;
 IF d.expires_at<=now() THEN RETURN jsonb_build_object('error','This payment link has expired. Please contact Maru before paying.','code','expired'); END IF;
 IF o.payment_status<>'pending' OR o.status<>'new' OR o.paid_at IS NOT NULL OR o.payment_reference<>'' THEN
  RETURN jsonb_build_object('error','This order cannot be paid or cancelled using this reminder. Please contact Maru.','code','unavailable');
 END IF;
 IF p_action='cancel' THEN
  -- Only this authenticated-by-secret-token POST can request cancellation.
  -- Never mark an order paid here or trust a return URL as proof of payment.
  UPDATE public.orders SET status='cancelled',payment_status='cancelled' WHERE id=o.id AND payment_status='pending';
  UPDATE public.payment_reminders SET status='skipped',last_error='Customer cancelled the unpaid order.' WHERE id=d.id AND status='queued';
  RETURN jsonb_build_object('order_id',o.id,'order_number',o.order_number,'total',o.total,'payment_status','cancelled','can_pay',false);
 END IF;
 RETURN jsonb_build_object('order_id',o.id,'order_number',o.order_number,'total',o.total,'payment_status',o.payment_status,'can_pay',o.total>=5,'expires_at',d.expires_at);
END $$;
CREATE FUNCTION public.acquire_reminder_worker() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 UPDATE public.payment_reminder_settings SET worker_locked_until=now()+interval '2 minutes',worker_token=gen_random_uuid()
 WHERE id AND enabled AND (worker_locked_until IS NULL OR worker_locked_until<now()) RETURNING worker_token INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.release_reminder_worker(p_token uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.payment_reminder_settings SET worker_locked_until=NULL,worker_token=NULL WHERE id AND worker_token=p_token
$$;
CREATE FUNCTION public.finish_payment_reminder(p_id uuid,p_token uuid,p_provider_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE matched uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_provider_id,0));
 UPDATE public.payment_reminders SET status='sent',provider_id=p_provider_id,sent_at=now(),locked_until=NULL,lock_token=NULL,last_error=NULL WHERE id=p_id AND lock_token=p_token AND status='processing' RETURNING id INTO matched;
 IF matched IS NULL THEN RAISE EXCEPTION 'Email lease expired'; END IF;
 UPDATE public.payment_reminders d SET delivery_status=e.status,delivery_updated_at=e.occurred_at FROM (
 SELECT status,occurred_at FROM public.order_email_events WHERE provider_id=p_provider_id ORDER BY
 CASE status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END DESC,occurred_at DESC LIMIT 1) e WHERE d.id=p_id;
END $$;
CREATE FUNCTION public.sync_payment_reminder_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.payment_reminders SET delivery_status=NEW.status,delivery_updated_at=NEW.occurred_at WHERE provider_id=NEW.provider_id AND
 (delivery_status IS NULL OR CASE NEW.status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END >=
 CASE delivery_status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END);
 RETURN NEW;
END $$;
CREATE TRIGGER payment_reminder_events AFTER INSERT ON public.order_email_events FOR EACH ROW EXECUTE FUNCTION public.sync_payment_reminder_event();
CREATE FUNCTION public.dispatch_payment_reminders() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; endpoint text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.payment_reminder_settings WHERE id AND enabled AND (worker_locked_until IS NULL OR worker_locked_until<now())) THEN RETURN; END IF;
 PERFORM public.queue_payment_reminders();
 IF NOT EXISTS(SELECT 1 FROM public.payment_reminders WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND locked_until<now())) THEN RETURN; END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='order_email_worker_token';
 SELECT replace(decrypted_secret,'/order-emails','/payment-reminders') INTO endpoint FROM vault.decrypted_secrets WHERE name='order_email_worker_url';
 IF token IS NULL OR endpoint IS NULL THEN RETURN; END IF;
 PERFORM net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=90000);
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('configure_payment_reminders','queue_payment_reminders','claim_payment_reminder','payment_reminder_allowed','order_payment_recovery','acquire_reminder_worker','release_reminder_worker','finish_payment_reminder','sync_payment_reminder_event','dispatch_payment_reminders') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.configure_payment_reminders(boolean) TO authenticated;
SELECT cron.schedule('maru-payment-reminders','* * * * *','SELECT public.dispatch_payment_reminders()');
NOTIFY pgrst,'reload schema';
