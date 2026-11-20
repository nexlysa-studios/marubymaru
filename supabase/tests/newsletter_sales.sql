-- Run within BEGIN/ROLLBACK. No real messages or persistent fixtures.
DO $$
DECLARE
 customer jsonb := '{"first_name":"Sale","last_name":"Test","email":"sale-test@example.invalid","phone":"0000000000","address_line_1":"Test","city":"Test","province":"Test","postal_code":"0000"}';
 mixed jsonb := '[{"product_id":"newsletter-test-sale","size":"M","quantity":1},{"product_id":"newsletter-test-full","size":"M","quantity":1}]';
 quote jsonb; placed jsonb; c uuid; campaign uuid; subscriber uuid; token uuid; job jsonb; rev integer; admin_id uuid:=gen_random_uuid(); before_count integer;
BEGIN
 INSERT INTO auth.users(id,email) VALUES(admin_id,'newsletter-admin-test@example.invalid');
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_id,'admin');
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM public.newsletter_join('  NEWSLETTER-TEST@example.invalid  ','newsletter-test-ip');
 PERFORM public.newsletter_join('newsletter-test@example.invalid','newsletter-test-ip');
 IF (SELECT count(*) FROM public.newsletter_subscribers WHERE email='newsletter-test@example.invalid')<>1 THEN RAISE EXCEPTION 'Signup not normalized/idempotent'; END IF;
 SELECT id,unsubscribe_token INTO subscriber,token FROM public.newsletter_subscribers WHERE email='newsletter-test@example.invalid';
 INSERT INTO public.products(id,name,price,sale_price,sizes) VALUES('newsletter-test-sale','Sale test',800,600,ARRAY['M']);
 INSERT INTO public.products(id,name,price,sizes) VALUES('newsletter-test-full','Full test',400,ARRAY['M']);
 SELECT sale_revision INTO rev FROM public.products WHERE id='newsletter-test-sale';
 SELECT count(*) INTO before_count FROM public.marketing_sale_items WHERE product_id='newsletter-test-sale';
 UPDATE public.products SET description='Unrelated edit' WHERE id='newsletter-test-sale';
 IF (SELECT sale_revision FROM public.products WHERE id='newsletter-test-sale')<>rev OR (SELECT count(*) FROM public.marketing_sale_items WHERE product_id='newsletter-test-sale')<>before_count THEN RAISE EXCEPTION 'Unrelated edit duplicated event'; END IF;
 INSERT INTO public.coupons(code,discount_type,discount_value) VALUES('NEWSLETTERTEST10','percentage',10) RETURNING id INTO c;
 quote:=public.validate_coupon('NEWSLETTERTEST10',customer->>'email',mixed);
 IF (quote->>'subtotal')::numeric<>1000 OR (quote->>'eligible_subtotal')::numeric<>400 OR (quote->>'discount')::numeric<>40 THEN RAISE EXCEPTION 'Mixed sale discount wrong: %',quote; END IF;
 placed:=public.place_order(customer||'{"expected_total":1059}',mixed,'NEWSLETTERTEST10');
 IF (placed->>'total')::numeric<>1059 OR (placed->>'shipping_amount')::numeric<>99 THEN RAISE EXCEPTION 'Mixed order pricing wrong'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=(placed->>'id')::uuid AND product_id='newsletter-test-sale' AND unit_price=600 AND regular_unit_price=800 AND was_on_sale) THEN RAISE EXCEPTION 'Sale snapshot wrong'; END IF;
 BEGIN
  PERFORM public.validate_coupon('NEWSLETTERTEST10','other@example.invalid','[{"product_id":"newsletter-test-sale","size":"M","quantity":1}]');
  RAISE EXCEPTION 'Sale-only coupon accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Discount codes do not apply%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.place_order(customer||'{"email":"changed@example.invalid","expected_total":1}',mixed,NULL);
  RAISE EXCEPTION 'Stale price accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Prices have changed%' THEN RAISE; END IF; END;
 INSERT INTO public.coupons(code,discount_type,discount_value,min_order_amount) VALUES('NEWSLETTERTESTMIN','fixed',500,500);
 BEGIN
  PERFORM public.validate_coupon('NEWSLETTERTESTMIN','other@example.invalid',mixed);
  RAISE EXCEPTION 'Sale counted toward minimum';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This code requires a minimum order%' THEN RAISE; END IF; END;
 INSERT INTO public.coupons(code,discount_type,discount_value) VALUES('NEWSLETTERTESTFIXED','fixed',500);
 quote:=public.validate_coupon('NEWSLETTERTESTFIXED','other@example.invalid',mixed);
 IF (quote->>'discount')::numeric<>400 THEN RAISE EXCEPTION 'Fixed discount leaked onto sale'; END IF;

 campaign:=public.queue_coupon_announcement(c);
 BEGIN
  PERFORM public.queue_coupon_announcement(c);
  RAISE EXCEPTION 'Duplicate announcement accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This version of the code%' THEN RAISE; END IF; END;
 -- Real world signup times differ; a new signup must not receive historical campaigns.
 INSERT INTO public.newsletter_subscribers(email,subscribed_at) VALUES('newsletter-new-test@example.invalid',now()+interval '1 minute');
 UPDATE public.newsletter_settings SET mailing_address='Synthetic address for rollback test only',sending_enabled=true;
 PERFORM public.expand_marketing_campaigns();
 IF NOT EXISTS(SELECT 1 FROM public.marketing_deliveries WHERE campaign_id=campaign AND subscriber_id=subscriber) THEN RAISE EXCEPTION 'Subscriber excluded'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketing_deliveries d JOIN public.newsletter_subscribers s ON s.id=d.subscriber_id WHERE campaign_id=campaign AND s.email='newsletter-new-test@example.invalid') THEN RAISE EXCEPTION 'New signup received historical campaign'; END IF;
 job:=public.claim_marketing_delivery();
 IF job IS NULL THEN RAISE EXCEPTION 'Queue not claimable'; END IF;
 IF NOT public.marketing_delivery_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Active job rejected'; END IF;
 PERFORM public.newsletter_unsubscribe(token);
 IF public.marketing_delivery_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Unsubscribe ignored during send'; END IF;
 PERFORM public.newsletter_join('newsletter-test@example.invalid','newsletter-test-ip');
 IF (SELECT status FROM public.newsletter_subscribers WHERE id=subscriber)<>'unsubscribed' THEN RAISE EXCEPTION 'Signup reversed unsubscribe'; END IF;
 UPDATE public.coupons SET is_active=false WHERE id=c;
 IF public.marketing_content(campaign) IS NOT NULL THEN RAISE EXCEPTION 'Paused code still announced'; END IF;
 IF has_table_privilege('anon','public.newsletter_subscribers','SELECT') OR has_column_privilege('authenticated','public.newsletter_subscribers','unsubscribe_token','SELECT') THEN RAISE EXCEPTION 'Subscriber privacy broken'; END IF;
 IF has_function_privilege('authenticated','public.claim_marketing_delivery()','EXECUTE') OR has_function_privilege('anon','public.newsletter_join(text,text)','EXECUTE') THEN RAISE EXCEPTION 'Internal APIs browser callable'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_emails WHERE order_id=(placed->>'id')::uuid) THEN RAISE EXCEPTION 'Unpaid order sent receipts'; END IF;
END $$;
