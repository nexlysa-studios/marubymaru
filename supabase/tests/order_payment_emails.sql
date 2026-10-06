-- Run inside a transaction and ROLLBACK. Never commit these synthetic fixtures.
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_email public.order_emails%ROWTYPE; v_claim public.order_emails%ROWTYPE; v_count integer;
BEGIN
  INSERT INTO public.orders(id, order_number, customer_first_name, customer_last_name, customer_email, customer_phone,
    shipping_address_line_1, shipping_city, shipping_province, shipping_postal_code, subtotal, total)
  VALUES (v_id, 'EMAIL-TEST-' || v_id, 'Email', 'Test', 'delivered@resend.dev', '0000000000', 'Test address', 'Test city', 'Test province', '0000', 100, 100);
  INSERT INTO public.order_items(order_id, product_name, size, quantity, unit_price, line_total)
  VALUES (v_id, 'Test dress', 'M', 1, 100, 100);
  IF EXISTS (SELECT 1 FROM public.order_emails WHERE order_id = v_id) THEN RAISE EXCEPTION 'Unpaid order queued emails'; END IF;
  UPDATE public.orders SET payment_status='paid', payment_reference='123456789', paid_at=now() WHERE id=v_id;
  SELECT count(*) INTO v_count FROM public.order_emails WHERE order_id=v_id;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected exactly two emails'; END IF;
  UPDATE public.orders SET payment_status='paid', status='processing' WHERE id=v_id;
  SELECT count(*) INTO v_count FROM public.order_emails WHERE order_id=v_id;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Duplicate ITN queued duplicate emails'; END IF;
  SELECT * INTO v_email FROM public.order_emails WHERE order_id=v_id AND kind='customer_payment';
  IF v_email.snapshot->'order' ? 'admin_notes' THEN RAISE EXCEPTION 'Private notes leaked'; END IF;
  UPDATE public.order_items SET product_name='Changed later' WHERE order_id=v_id;
  IF (SELECT snapshot->'items'->0->>'product_name' FROM public.order_emails WHERE id=v_email.id) <> 'Test dress' THEN
    RAISE EXCEPTION 'Snapshot was not immutable'; END IF;
  UPDATE public.order_emails SET next_attempt_at='1900-01-01' WHERE id=v_email.id;
  SELECT * INTO v_claim FROM public.claim_order_email();
  IF v_claim.id <> v_email.id OR v_claim.lock_token IS NULL OR v_claim.attempts <> 1 THEN RAISE EXCEPTION 'Claim failed'; END IF;
  IF public.finish_order_email(v_claim.id, gen_random_uuid(), 'test-wrong-lease') THEN RAISE EXCEPTION 'Wrong lease accepted'; END IF;
  -- Delivery arrives BEFORE send acknowledgement; late sent/delayed cannot downgrade it.
  PERFORM public.record_order_email_event('test-event-'||v_id, 'test-provider-'||v_id, 'delivered', now());
  IF NOT public.finish_order_email(v_claim.id, v_claim.lock_token, 'test-provider-'||v_id) THEN RAISE EXCEPTION 'Finish failed'; END IF;
  PERFORM public.record_order_email_event('test-late-'||v_id, 'test-provider-'||v_id, 'sent', now()+interval '1 minute');
  PERFORM public.record_order_email_event('test-event-'||v_id, 'test-provider-'||v_id, 'delivered', now());
  SELECT * INTO v_email FROM public.order_emails WHERE id=v_claim.id;
  IF v_email.status <> 'sent' OR v_email.delivery_status <> 'delivered' THEN RAISE EXCEPTION 'Delivery race mishandled'; END IF;
  PERFORM public.record_order_email_event('test-bounce-'||v_id, 'test-provider-'||v_id, 'bounced', now());
  IF (SELECT delivery_status FROM public.order_emails WHERE id=v_claim.id) <> 'bounced' THEN RAISE EXCEPTION 'Bounce lost'; END IF;
  IF has_table_privilege('anon','public.order_emails','SELECT') THEN RAISE EXCEPTION 'Anonymous email access'; END IF;
  IF has_column_privilege('authenticated','public.order_emails','payload','SELECT') THEN RAISE EXCEPTION 'Payload exposed'; END IF;
  IF has_column_privilege('authenticated','public.orders','payment_status','UPDATE') THEN RAISE EXCEPTION 'Browser can mark paid'; END IF;
  IF NOT has_column_privilege('authenticated','public.orders','status','UPDATE') THEN RAISE EXCEPTION 'Admin fulfilment broken'; END IF;
  IF has_function_privilege('authenticated','public.claim_order_email()','EXECUTE') THEN RAISE EXCEPTION 'Browser can claim emails'; END IF;
END;
$$;
