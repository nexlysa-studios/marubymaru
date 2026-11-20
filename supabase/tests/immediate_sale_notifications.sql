-- BEGIN/ROLLBACK only: pg_net requests and synthetic campaigns must not commit.
DO $$
DECLARE c uuid; initial_count integer; rev integer;
BEGIN
 INSERT INTO public.products(id,name,price,sale_price,sizes,is_active)
 VALUES('immediate-sale-test','Immediate sale test',800,600,ARRAY['M'],true);
 SELECT campaign_id INTO c FROM public.marketing_sale_items WHERE product_id='immediate-sale-test';
 IF NOT EXISTS(SELECT 1 FROM public.marketing_campaigns WHERE id=c AND status='queued' AND due_at<=now()) THEN RAISE EXCEPTION 'Sale is not immediately eligible'; END IF;
 SELECT count(*) INTO initial_count FROM public.marketing_sale_items WHERE product_id='immediate-sale-test';
 SELECT sale_revision INTO rev FROM public.products WHERE id='immediate-sale-test';
 UPDATE public.products SET description='Unrelated edit' WHERE id='immediate-sale-test';
 IF (SELECT count(*) FROM public.marketing_sale_items WHERE product_id='immediate-sale-test')<>initial_count THEN RAISE EXCEPTION 'Unrelated save duplicates emails'; END IF;
 IF (SELECT sale_revision FROM public.products WHERE id='immediate-sale-test')<>rev THEN RAISE EXCEPTION 'Unrelated save changed revision'; END IF;
 UPDATE public.products SET sale_price=NULL WHERE id='immediate-sale-test';
 IF public.marketing_content(c) IS NOT NULL THEN RAISE EXCEPTION 'Ended sale remains sendable'; END IF;
 IF (SELECT count(*) FROM public.marketing_sale_items WHERE product_id='immediate-sale-test')<>initial_count THEN RAISE EXCEPTION 'Ending sale announced another campaign'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='maru-marketing-emails' AND schedule='5 seconds' AND active) THEN RAISE EXCEPTION 'Fast recovery schedule missing'; END IF;
 IF has_function_privilege('authenticated','public.dispatch_marketing_emails()','EXECUTE') THEN RAISE EXCEPTION 'Browser can invoke private worker dispatch'; END IF;
END $$;
