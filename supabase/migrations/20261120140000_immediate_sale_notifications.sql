-- Dispatch on sale save, after commit via pg_net. The scheduler is recovery only.
CREATE OR REPLACE FUNCTION public.dispatch_marketing_emails() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; endpoint text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.newsletter_settings WHERE id AND sending_enabled
   AND (worker_locked_until IS NULL OR worker_locked_until<now())) THEN RETURN; END IF;
 -- Idle checks do not invoke Edge Functions or consume the email quota.
 IF NOT EXISTS(SELECT 1 FROM public.marketing_campaigns WHERE status IN ('collecting','queued') AND due_at<=now())
 AND NOT EXISTS(SELECT 1 FROM public.marketing_deliveries WHERE
   (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND locked_until<now())) THEN RETURN; END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='order_email_worker_token';
 SELECT replace(decrypted_secret,'/order-emails','/marketing-emails') INTO endpoint FROM vault.decrypted_secrets WHERE name='order_email_worker_url';
 IF token IS NULL OR endpoint IS NULL THEN RETURN; END IF;
 PERFORM net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=90000);
END $$;

CREATE OR REPLACE FUNCTION public.track_product_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;
BEGIN
 IF TG_OP='INSERT' THEN NEW.sale_revision:=CASE WHEN NEW.sale_price IS NULL THEN 0 ELSE 1 END;
 ELSIF (NEW.sale_price,NEW.price,NEW.is_active) IS DISTINCT FROM (OLD.sale_price,OLD.price,OLD.is_active) THEN NEW.sale_revision:=OLD.sale_revision+1;
 ELSE NEW.sale_revision:=OLD.sale_revision; RETURN NEW; END IF;
 IF NEW.sale_price IS NOT NULL AND NEW.is_active THEN
  INSERT INTO public.marketing_campaigns(kind,title,status,due_at)
  VALUES('sale','The Maru Sale Edit','queued',now()) RETURNING id INTO c;
  INSERT INTO public.marketing_sale_items(campaign_id,product_id,revision)
  VALUES(c,NEW.id,NEW.sale_revision) ON CONFLICT DO NOTHING;
  -- The HTTP request is transactional: it cannot execute until the saved product
  -- and campaign are committed, and a rollback cannot send an announcement.
  BEGIN PERFORM public.dispatch_marketing_emails(); EXCEPTION WHEN OTHERS THEN NULL; END;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.track_product_sale(),public.dispatch_marketing_emails() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.track_product_sale(),public.dispatch_marketing_emails() TO service_role;

-- Release only pending sale batches from the previous delay. Never resend mail
-- already sent or change scheduled coupon announcements.
UPDATE public.marketing_campaigns SET status='queued',due_at=least(due_at,now()) WHERE kind='sale' AND status='collecting';
SELECT cron.schedule('maru-marketing-emails','5 seconds','SELECT public.dispatch_marketing_emails()');
SELECT public.dispatch_marketing_emails();
NOTIFY pgrst,'reload schema';
