-- Newsletter and marketing are isolated from paid-order email delivery.
CREATE TABLE public.newsletter_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), sending_enabled boolean NOT NULL DEFAULT false,
 mailing_address text NOT NULL DEFAULT '', worker_locked_until timestamptz, worker_token uuid,
 CHECK (NOT sending_enabled OR length(btrim(mailing_address)) >= 10)
);
INSERT INTO public.newsletter_settings(id) VALUES(true);
CREATE TABLE public.newsletter_subscribers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL CHECK(email=lower(btrim(email))),
 status text NOT NULL DEFAULT 'subscribed' CHECK(status IN ('subscribed','unsubscribed','suppressed')),
 consent_version text NOT NULL DEFAULT 'maru-list-v1', source text NOT NULL DEFAULT 'homepage',
 subscribed_at timestamptz NOT NULL DEFAULT now(), unsubscribed_at timestamptz,
 unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.newsletter_rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1);
CREATE TABLE public.marketing_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('sale','coupon')),
 title text NOT NULL, status text NOT NULL DEFAULT 'collecting' CHECK(status IN ('collecting','queued','sending','completed','cancelled','attention')),
 coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL, source_key text UNIQUE,
 snapshot jsonb, due_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, last_error text
);
CREATE TABLE public.marketing_sale_items (
 campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id), product_id text NOT NULL, revision integer NOT NULL,
 PRIMARY KEY(product_id, revision), UNIQUE(campaign_id,product_id,revision)
);
CREATE TABLE public.marketing_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id),
 subscriber_id uuid NOT NULL REFERENCES public.newsletter_subscribers(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','failed','attention','skipped')),
 payload jsonb, provider_id text UNIQUE, attempts integer NOT NULL DEFAULT 0,
 first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, lock_token uuid,
 last_error text, sent_at timestamptz, delivery_status text, delivery_updated_at timestamptz,
 UNIQUE(campaign_id,subscriber_id)
);
CREATE INDEX marketing_due ON public.marketing_deliveries(next_attempt_at) WHERE status IN ('queued','processing');

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['newsletter_settings','newsletter_subscribers','newsletter_rate_limits','marketing_campaigns','marketing_sale_items','marketing_deliveries'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT SELECT(id,email,status,consent_version,source,subscribed_at,unsubscribed_at,created_at) ON public.newsletter_subscribers TO authenticated;
GRANT SELECT(id,sending_enabled,mailing_address), UPDATE(sending_enabled,mailing_address) ON public.newsletter_settings TO authenticated;
GRANT SELECT ON public.marketing_campaigns TO authenticated;
GRANT SELECT(id,campaign_id,subscriber_id,status,provider_id,attempts,last_error,sent_at,delivery_status,delivery_updated_at) ON public.marketing_deliveries TO authenticated;
CREATE POLICY newsletter_admin_read ON public.newsletter_subscribers FOR SELECT TO authenticated USING((SELECT public.is_admin()));
CREATE POLICY newsletter_settings_admin ON public.newsletter_settings FOR ALL TO authenticated USING((SELECT public.is_admin())) WITH CHECK((SELECT public.is_admin()));
CREATE POLICY campaigns_admin_read ON public.marketing_campaigns FOR SELECT TO authenticated USING((SELECT public.is_admin()));
CREATE POLICY deliveries_admin_read ON public.marketing_deliveries FOR SELECT TO authenticated USING((SELECT public.is_admin()));

CREATE FUNCTION public.newsletter_join(p_email text,p_ip_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; e text:=lower(btrim(p_email));
BEGIN
 IF length(e)>320 OR e !~ '^[^@[:space:]<>]+@[^@[:space:]<>]+[.][^@[:space:]<>]+$' THEN RAISE EXCEPTION 'Enter a valid email address.'; END IF;
 INSERT INTO public.newsletter_rate_limits(key) VALUES(p_ip_hash)
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN newsletter_rate_limits.window_start < now()-interval '1 hour' THEN 1 ELSE newsletter_rate_limits.attempts+1 END,
 window_start=CASE WHEN newsletter_rate_limits.window_start < now()-interval '1 hour' THEN now() ELSE newsletter_rate_limits.window_start END
 RETURNING attempts INTO n;
 IF n>20 THEN RAISE EXCEPTION 'Please wait before trying again.'; END IF;
 -- Never silently reverse an unsubscribe or a provider suppression.
 INSERT INTO public.newsletter_subscribers(email) VALUES(e) ON CONFLICT(email) DO NOTHING;
 DELETE FROM public.newsletter_rate_limits WHERE window_start<now()-interval '2 days';
END $$;
CREATE FUNCTION public.newsletter_unsubscribe(p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.newsletter_subscribers SET status='unsubscribed',unsubscribed_at=now() WHERE unsubscribe_token=p_token AND status='subscribed';
 UPDATE public.marketing_deliveries d SET status='skipped',last_error='Unsubscribed'
 FROM public.newsletter_subscribers s WHERE d.subscriber_id=s.id AND s.unsubscribe_token=p_token AND d.status='queued';
END $$;

-- Revisions make product saves idempotent. Only real sale changes launch announcements.
CREATE FUNCTION public.track_product_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;
BEGIN
 IF TG_OP='INSERT' THEN NEW.sale_revision:=CASE WHEN NEW.sale_price IS NULL THEN 0 ELSE 1 END;
 ELSIF (NEW.sale_price,NEW.price,NEW.is_active) IS DISTINCT FROM (OLD.sale_price,OLD.price,OLD.is_active) THEN NEW.sale_revision:=OLD.sale_revision+1;
 ELSE NEW.sale_revision:=OLD.sale_revision; RETURN NEW; END IF;
 IF NEW.sale_price IS NOT NULL AND NEW.is_active THEN
  PERFORM pg_advisory_xact_lock(721389);
  SELECT id INTO c FROM public.marketing_campaigns WHERE kind='sale' AND status='collecting' AND due_at>now() ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF c IS NULL THEN
   INSERT INTO public.marketing_campaigns(kind,title,due_at) VALUES('sale','The Maru Sale Edit',now()+interval '5 minutes') RETURNING id INTO c;
  END IF;
  INSERT INTO public.marketing_sale_items(campaign_id,product_id,revision) VALUES(c,NEW.id,NEW.sale_revision) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER product_sale_events BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.track_product_sale();

CREATE FUNCTION public.marketing_coupon_content(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('code',code,'discount_type',discount_type,'discount_value',discount_value,'min_order_amount',min_order_amount,
 'starts_at',starts_at,'ends_at',ends_at,'max_uses',max_uses,'max_uses_per_customer',max_uses_per_customer)
 FROM public.coupons c WHERE id=p_id AND is_active AND (ends_at IS NULL OR ends_at>now())
 AND (max_uses IS NULL OR (SELECT count(*) FROM public.coupon_redemptions r WHERE r.coupon_id=c.id)<max_uses)
$$;
CREATE FUNCTION public.queue_coupon_announcement(p_coupon_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.coupons%ROWTYPE; body jsonb; result uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 SELECT * INTO c FROM public.coupons WHERE id=p_coupon_id FOR UPDATE;
 body:=public.marketing_coupon_content(p_coupon_id);
 IF body IS NULL THEN RAISE EXCEPTION 'Only active, unexpired codes with remaining uses can be announced.'; END IF;
 INSERT INTO public.marketing_campaigns(kind,title,status,coupon_id,source_key,snapshot,due_at)
 VALUES('coupon','A little something from Maru','queued',c.id,'coupon/'||c.id||'/'||md5(body::text),jsonb_build_object('coupon',body),greatest(now(),coalesce(c.starts_at,now())))
 ON CONFLICT(source_key) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'This version of the code has already been announced or queued.'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.cancel_marketing_campaign(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 UPDATE public.marketing_campaigns SET status='cancelled' WHERE id=p_id AND status IN ('collecting','queued');
 IF NOT FOUND THEN RAISE EXCEPTION 'Only campaigns that have not started sending can be cancelled.'; END IF;
END $$;
CREATE FUNCTION public.marketing_content(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.marketing_campaigns%ROWTYPE; body jsonb;
BEGIN
 SELECT * INTO c FROM public.marketing_campaigns WHERE id=p_id;
 IF c.kind='coupon' THEN
  body:=public.marketing_coupon_content(c.coupon_id);
  IF body IS NULL OR (body->>'starts_at')::timestamptz>now() THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('coupon',body);
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'sale_price',p.sale_price,'revision',p.sale_revision) ORDER BY p.id) INTO body
 FROM public.marketing_sale_items i JOIN public.products p ON p.id=i.product_id AND p.sale_revision=i.revision
 WHERE i.campaign_id=p_id AND p.is_active AND p.sale_price IS NOT NULL;
 IF body IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('products',body);
END $$;
CREATE FUNCTION public.expand_marketing_campaigns() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.marketing_campaigns%ROWTYPE; body jsonb;
BEGIN
 FOR c IN SELECT * FROM public.marketing_campaigns WHERE status IN ('collecting','queued') AND due_at<=now() ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 5 LOOP
  body:=public.marketing_content(c.id);
  IF body IS NULL OR (c.snapshot IS NOT NULL AND c.snapshot<>body) OR c.due_at<now()-interval '1 day' THEN
   UPDATE public.marketing_campaigns SET status='cancelled',last_error='Offer changed, ended, or announcement became stale.' WHERE id=c.id; CONTINUE;
  END IF;
  UPDATE public.marketing_campaigns SET status='sending',snapshot=body WHERE id=c.id;
  INSERT INTO public.marketing_deliveries(campaign_id,subscriber_id)
   SELECT c.id,s.id FROM public.newsletter_subscribers s WHERE status='subscribed' AND subscribed_at<=c.created_at ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
CREATE FUNCTION public.claim_marketing_delivery() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.marketing_deliveries%ROWTYPE; s public.newsletter_subscribers%ROWTYPE; c public.marketing_campaigns%ROWTYPE;
BEGIN
 UPDATE public.marketing_deliveries SET status='attention',locked_until=NULL,last_error='Retry window expired. Check Resend before resending.'
 WHERE status IN ('queued','processing') AND first_attempt_at<now()-interval '23 hours' AND (locked_until IS NULL OR locked_until<now());
 FOR d IN SELECT * FROM public.marketing_deliveries WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND locked_until<now()) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
  SELECT * INTO s FROM public.newsletter_subscribers WHERE id=d.subscriber_id;
  SELECT * INTO c FROM public.marketing_campaigns WHERE id=d.campaign_id;
  IF s.status<>'subscribed' OR c.status<>'sending' OR public.marketing_content(c.id) IS DISTINCT FROM c.snapshot THEN
   UPDATE public.marketing_deliveries SET status='skipped',last_error='Unsubscribed or offer no longer current.' WHERE id=d.id; CONTINUE;
  END IF;
  UPDATE public.marketing_deliveries SET status='processing',attempts=attempts+1,lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes' WHERE id=d.id RETURNING * INTO d;
  RETURN to_jsonb(d)||jsonb_build_object('email',s.email,'unsubscribe_token',s.unsubscribe_token,'content',c.snapshot,'kind',c.kind,'title',c.title);
 END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION public.finish_marketing_campaigns() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.marketing_campaigns c SET status=CASE WHEN EXISTS(SELECT 1 FROM public.marketing_deliveries d WHERE d.campaign_id=c.id AND d.status IN ('attention','failed')) THEN 'attention' ELSE 'completed' END,completed_at=now()
 WHERE status='sending' AND NOT EXISTS(SELECT 1 FROM public.marketing_deliveries d WHERE d.campaign_id=c.id AND d.status IN ('queued','processing'));
END $$;
CREATE FUNCTION public.acquire_marketing_worker() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 UPDATE public.newsletter_settings SET worker_token=gen_random_uuid(),worker_locked_until=now()+interval '2 minutes'
 WHERE id AND sending_enabled AND length(btrim(mailing_address))>=10 AND (worker_locked_until IS NULL OR worker_locked_until<now()) RETURNING worker_token INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.release_marketing_worker(p_token uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.newsletter_settings SET worker_locked_until=NULL,worker_token=NULL WHERE id AND worker_token=p_token
$$;
-- Retain events arriving before send acknowledgement, using the existing verified webhook.
CREATE FUNCTION public.sync_marketing_email_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.marketing_deliveries SET delivery_status=NEW.status,delivery_updated_at=NEW.occurred_at
 WHERE provider_id=NEW.provider_id AND (delivery_status IS NULL OR
  CASE NEW.status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END >=
  CASE delivery_status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 WHEN 'delayed' THEN 1 ELSE 0 END);
 IF NEW.status IN ('bounced','complained','suppressed') THEN
  UPDATE public.newsletter_subscribers s SET status='suppressed' FROM public.marketing_deliveries d WHERE d.subscriber_id=s.id AND d.provider_id=NEW.provider_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_email_delivery_event AFTER INSERT ON public.order_email_events FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_email_event();
CREATE FUNCTION public.finish_marketing_delivery(p_id uuid,p_token uuid,p_provider_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sid uuid; terminal text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_provider_id,0));
 UPDATE public.marketing_deliveries SET status='sent',provider_id=p_provider_id,sent_at=now(),locked_until=NULL,lock_token=NULL,last_error=NULL
 WHERE id=p_id AND lock_token=p_token AND status='processing' RETURNING subscriber_id INTO sid;
 IF sid IS NULL THEN RAISE EXCEPTION 'Email lease expired'; END IF;
 SELECT status INTO terminal FROM public.order_email_events WHERE provider_id=p_provider_id ORDER BY CASE status WHEN 'complained' THEN 6 WHEN 'bounced' THEN 5 WHEN 'suppressed' THEN 4 WHEN 'failed' THEN 3 WHEN 'delivered' THEN 2 ELSE 1 END DESC,occurred_at DESC LIMIT 1;
 UPDATE public.marketing_deliveries SET delivery_status=terminal WHERE id=p_id;
 IF terminal IN ('bounced','complained','suppressed') THEN UPDATE public.newsletter_subscribers SET status='suppressed' WHERE id=sid; END IF;
END $$;

-- All internal functions are service-only; only the two admin actions are browser callable.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
 WHERE n.nspname='public' AND p.proname IN ('newsletter_join','newsletter_unsubscribe','track_product_sale','marketing_coupon_content','queue_coupon_announcement','cancel_marketing_campaign','marketing_content','expand_marketing_campaigns','claim_marketing_delivery','finish_marketing_campaigns','acquire_marketing_worker','release_marketing_worker','sync_marketing_email_event','finish_marketing_delivery') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.queue_coupon_announcement(uuid), public.cancel_marketing_campaign(uuid) TO authenticated;

CREATE FUNCTION public.dispatch_marketing_emails() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; endpoint text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.newsletter_settings WHERE id AND sending_enabled) THEN RETURN; END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='order_email_worker_token';
 SELECT replace(decrypted_secret,'/order-emails','/marketing-emails') INTO endpoint FROM vault.decrypted_secrets WHERE name='order_email_worker_url';
 IF token IS NULL OR endpoint IS NULL THEN RETURN; END IF;
 PERFORM net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=90000);
END $$;
REVOKE ALL ON FUNCTION public.dispatch_marketing_emails() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('maru-marketing-emails','* * * * *','SELECT public.dispatch_marketing_emails()');
NOTIFY pgrst,'reload schema';

CREATE FUNCTION public.marketing_delivery_allowed(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.marketing_deliveries d JOIN public.newsletter_subscribers s ON s.id=d.subscriber_id JOIN public.marketing_campaigns c ON c.id=d.campaign_id
 CROSS JOIN public.newsletter_settings settings
 WHERE d.id=p_id AND d.lock_token=p_token AND d.status='processing' AND d.locked_until>now() AND s.status='subscribed' AND c.status='sending'
 AND settings.id AND settings.sending_enabled AND public.marketing_content(c.id)=c.snapshot)
$$;
REVOKE ALL ON FUNCTION public.marketing_delivery_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_delivery_allowed(uuid,uuid) TO service_role;

CREATE FUNCTION public.newsletter_admin_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 SELECT jsonb_build_object('subscribed',(SELECT count(*) FROM public.newsletter_subscribers WHERE status='subscribed'),
 'unsubscribed',(SELECT count(*) FROM public.newsletter_subscribers WHERE status='unsubscribed'),
 'suppressed',(SELECT count(*) FROM public.newsletter_subscribers WHERE status='suppressed'),
 'campaigns',coalesce((SELECT jsonb_agg(row_to_json(info)) FROM (
 SELECT c.*, (SELECT count(*) FROM public.marketing_deliveries WHERE campaign_id=c.id) AS recipients,
 (SELECT count(*) FROM public.marketing_deliveries WHERE campaign_id=c.id AND status='sent') AS sent,
 (SELECT count(*) FROM public.marketing_deliveries WHERE campaign_id=c.id AND delivery_status='delivered') AS delivered,
 (SELECT count(*) FROM public.marketing_deliveries WHERE campaign_id=c.id AND status IN ('failed','attention')) AS failed,
 (SELECT count(*) FROM public.marketing_deliveries WHERE campaign_id=c.id AND status='skipped') AS skipped
 FROM public.marketing_campaigns c ORDER BY c.created_at DESC LIMIT 50) info),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.newsletter_admin_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.newsletter_admin_summary() TO authenticated;

