-- Action confirmations are transactional and independent of the marketing pause.
-- No historical subscriptions are backfilled or emailed.
CREATE TABLE public.subscription_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscriber_id uuid NOT NULL REFERENCES public.newsletter_subscribers(id),
 kind text NOT NULL CHECK(kind IN ('welcome','admin_subscribed','goodbye','admin_unsubscribed')),
 snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','failed','attention','skipped')),
 payload jsonb, recipient text, provider_id text UNIQUE, attempts integer NOT NULL DEFAULT 0,
 first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, lock_token uuid,
 last_error text, sent_at timestamptz, delivery_status text, delivery_updated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(subscriber_id,kind)
);
CREATE INDEX subscription_notifications_due ON public.subscription_notifications(next_attempt_at) WHERE status IN ('queued','processing');
CREATE TABLE public.subscription_worker_lock(id boolean PRIMARY KEY DEFAULT true CHECK(id), locked_until timestamptz, token uuid);
INSERT INTO public.subscription_worker_lock(id) VALUES(true);
ALTER TABLE public.subscription_worker_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_worker_lock FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.subscription_worker_lock TO service_role;
ALTER TABLE public.subscription_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_notifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.subscription_notifications TO service_role;
GRANT SELECT(id,subscriber_id,kind,status,recipient,provider_id,attempts,last_error,sent_at,delivery_status,delivery_updated_at,created_at) ON public.subscription_notifications TO authenticated;
CREATE POLICY subscription_notifications_admin ON public.subscription_notifications FOR SELECT TO authenticated USING((SELECT public.is_admin()));

CREATE FUNCTION public.dispatch_subscription_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; endpoint text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.subscription_notifications WHERE status IN ('queued','processing') AND next_attempt_at<=now()) THEN RETURN; END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='order_email_worker_token';
 SELECT replace(decrypted_secret,'/order-emails','/subscription-emails') INTO endpoint FROM vault.decrypted_secrets WHERE name='order_email_worker_url';
 IF token IS NULL OR endpoint IS NULL THEN RETURN; END IF;
 PERFORM net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=90000);
END $$;

CREATE FUNCTION public.queue_subscription_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE body jsonb;
BEGIN
 body:=jsonb_build_object('email',NEW.email,'unsubscribe_token',NEW.unsubscribe_token,'occurred_at',now());
 IF TG_OP='INSERT' AND NEW.status='subscribed' THEN
  INSERT INTO public.subscription_notifications(subscriber_id,kind,snapshot) VALUES(NEW.id,'welcome',body),(NEW.id,'admin_subscribed',body) ON CONFLICT DO NOTHING;
 ELSIF TG_OP='UPDATE' AND OLD.status='subscribed' AND NEW.status='unsubscribed' THEN
  INSERT INTO public.subscription_notifications(subscriber_id,kind,snapshot) VALUES(NEW.id,'goodbye',body),(NEW.id,'admin_unsubscribed',body) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_change_notifications AFTER INSERT OR UPDATE OF status ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.queue_subscription_notifications();

-- Return an explicit result for a duplicate without inserting or sending again.
DROP FUNCTION public.newsletter_join(text,text);
CREATE FUNCTION public.newsletter_join(p_email text,p_ip_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; e text:=lower(btrim(p_email)); inserted_id uuid; existing_status text;
BEGIN
 IF length(e)>320 OR e !~ '^[^@[:space:]<>]+@[^@[:space:]<>]+[.][^@[:space:]<>]+$' THEN RAISE EXCEPTION 'Enter a valid email address.'; END IF;
 INSERT INTO public.newsletter_rate_limits(key) VALUES(p_ip_hash)
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN newsletter_rate_limits.window_start < now()-interval '1 hour' THEN 1 ELSE newsletter_rate_limits.attempts+1 END,
 window_start=CASE WHEN newsletter_rate_limits.window_start < now()-interval '1 hour' THEN now() ELSE newsletter_rate_limits.window_start END RETURNING attempts INTO n;
 IF n>20 THEN RAISE EXCEPTION 'Please wait before trying again.'; END IF;
 INSERT INTO public.newsletter_subscribers(email) VALUES(e) ON CONFLICT(email) DO NOTHING RETURNING id INTO inserted_id;
 DELETE FROM public.newsletter_rate_limits WHERE window_start<now()-interval '2 days';
 IF inserted_id IS NOT NULL THEN
  -- pg_net starts after commit; cron provides recovery if dispatch is unavailable.
  BEGIN PERFORM public.dispatch_subscription_notifications(); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN 'subscribed';
 END IF;
 SELECT status INTO existing_status FROM public.newsletter_subscribers WHERE email=e;
 RETURN CASE WHEN existing_status='subscribed' THEN 'already_subscribed' ELSE 'unavailable' END;
END $$;
CREATE OR REPLACE FUNCTION public.newsletter_unsubscribe(p_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean;
BEGIN
 UPDATE public.newsletter_subscribers SET status='unsubscribed',unsubscribed_at=now() WHERE unsubscribe_token=p_token AND status='subscribed';
 changed:=FOUND;
 UPDATE public.marketing_deliveries d SET status='skipped',last_error='Unsubscribed'
 FROM public.newsletter_subscribers s WHERE d.subscriber_id=s.id AND s.unsubscribe_token=p_token AND d.status='queued';
 IF changed THEN BEGIN PERFORM public.dispatch_subscription_notifications(); EXCEPTION WHEN OTHERS THEN NULL; END; END IF;
END $$;

CREATE FUNCTION public.claim_subscription_notification() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.subscription_notifications%ROWTYPE;
BEGIN
 UPDATE public.subscription_notifications SET status='attention',locked_until=NULL,last_error='Retry window expired. Check Resend before resending.'
 WHERE status IN ('queued','processing') AND first_attempt_at<now()-interval '23 hours' AND (locked_until IS NULL OR locked_until<now());
 WITH candidate AS (
  SELECT id FROM public.subscription_notifications WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND locked_until<now())
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE public.subscription_notifications n SET status='processing',attempts=attempts+1,lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes'
 FROM candidate c WHERE n.id=c.id RETURNING n.* INTO result;
 IF result.id IS NULL THEN RETURN NULL; END IF;
 RETURN to_jsonb(result);
END $$;
CREATE FUNCTION public.acquire_subscription_worker() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 UPDATE public.subscription_worker_lock SET locked_until=now()+interval '2 minutes',token=gen_random_uuid()
 WHERE id AND (locked_until IS NULL OR locked_until<now()) RETURNING token INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.release_subscription_worker(p_token uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.subscription_worker_lock SET locked_until=NULL,token=NULL WHERE id AND token=p_token
$$;
CREATE FUNCTION public.subscription_notification_allowed(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.subscription_notifications n JOIN public.newsletter_subscribers s ON s.id=n.subscriber_id
 WHERE n.id=p_id AND n.lock_token=p_token AND n.status='processing' AND n.locked_until>now()
 AND (n.kind<>'welcome' OR s.status='subscribed'))
$$;
CREATE FUNCTION public.finish_subscription_notification(p_id uuid,p_token uuid,p_provider_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE matched uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_provider_id,0));
 UPDATE public.subscription_notifications SET status='sent',provider_id=p_provider_id,sent_at=now(),locked_until=NULL,lock_token=NULL,last_error=NULL
 WHERE id=p_id AND lock_token=p_token AND status='processing' RETURNING id INTO matched;
 IF matched IS NULL THEN RAISE EXCEPTION 'Email lease expired'; END IF;
 UPDATE public.subscription_notifications n SET delivery_status=e.status,delivery_updated_at=e.occurred_at FROM (
  SELECT status,occurred_at FROM public.order_email_events WHERE provider_id=p_provider_id
  ORDER BY CASE status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END DESC,occurred_at DESC LIMIT 1
 ) e WHERE n.id=p_id;
 UPDATE public.newsletter_subscribers s SET status='suppressed' FROM public.subscription_notifications n
 WHERE n.id=p_id AND n.subscriber_id=s.id AND n.kind IN ('welcome','goodbye') AND n.delivery_status IN ('bounced','complained','suppressed');
END $$;
CREATE FUNCTION public.sync_subscription_notification_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.subscription_notifications SET delivery_status=NEW.status,delivery_updated_at=NEW.occurred_at WHERE provider_id=NEW.provider_id AND
 (delivery_status IS NULL OR CASE NEW.status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END >=
 CASE delivery_status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END);
 IF NEW.status IN ('bounced','complained','suppressed') THEN
  UPDATE public.newsletter_subscribers s SET status='suppressed' FROM public.subscription_notifications n
  WHERE n.subscriber_id=s.id AND n.provider_id=NEW.provider_id AND n.kind IN ('welcome','goodbye');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_notification_event AFTER INSERT ON public.order_email_events FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_notification_event();

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('newsletter_join','newsletter_unsubscribe','dispatch_subscription_notifications','queue_subscription_notifications','claim_subscription_notification','subscription_notification_allowed','finish_subscription_notification','sync_subscription_notification_event','acquire_subscription_worker','release_subscription_worker') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
SELECT cron.schedule('maru-subscription-notifications','* * * * *','SELECT public.dispatch_subscription_notifications()');
NOTIFY pgrst,'reload schema';
