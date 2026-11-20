-- Run inside BEGIN/ROLLBACK only. Never commit fixtures or queued reminders.
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); young uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); paid uuid:=gen_random_uuid(); cancelled uuid:=gen_random_uuid(); processing uuid:=gen_random_uuid(); failed uuid:=gen_random_uuid(); job jsonb; token_a uuid; token_b uuid; result jsonb; lease uuid;
BEGIN
 UPDATE public.payment_reminder_settings SET enabled=true,enabled_from=now()-interval '30 minutes';
 INSERT INTO public.orders(id,order_number,customer_first_name,customer_last_name,customer_email,customer_phone,shipping_address_line_1,shipping_city,shipping_province,shipping_postal_code,total,created_at,payment_status,status)
 SELECT id,'REMINDER-TEST-'||id,'Reminder','Test','reminder-test@example.invalid','0000000000','Test','Test','Test','0000',749,created,payment,fulfilment
 FROM (VALUES(a,now()-interval '15 minutes','pending','new'),(b,now()-interval '16 minutes','pending','new'),(young,now()-interval '14 minutes','pending','new'),(legacy,now()-interval '1 hour','pending','new'),(paid,now()-interval '20 minutes','paid','confirmed'),(cancelled,now()-interval '20 minutes','cancelled','cancelled'),(processing,now()-interval '20 minutes','pending','processing'),(failed,now()-interval '20 minutes','failed','new')) AS cases(id,created,payment,fulfilment);
 PERFORM public.queue_payment_reminders(); PERFORM public.queue_payment_reminders();
 IF (SELECT count(*) FROM public.payment_reminders WHERE order_id=ANY(ARRAY[a,b,young,legacy,paid,cancelled,processing,failed]))<>2 THEN RAISE EXCEPTION 'Eligibility or duplicate guard failed'; END IF;
 SELECT token INTO token_a FROM public.payment_reminders WHERE order_id=a;
 SELECT token INTO token_b FROM public.payment_reminders WHERE order_id=b;
 result:=public.order_payment_recovery(token_b,'status');
 IF result->>'payment_status'<>'pending' OR (SELECT payment_status FROM public.orders WHERE id=b)<>'pending' THEN RAISE EXCEPTION 'Status mutated order'; END IF;
 result:=public.order_payment_recovery(token_b,'start');
 IF (result->>'total')::numeric<>749 OR result->>'order_id'<>b::text OR (SELECT count(*) FROM public.orders WHERE id=b)<>1 THEN RAISE EXCEPTION 'Resume changed total or duplicated order'; END IF;
 result:=public.order_payment_recovery(token_b,'cancel');
 IF result->>'payment_status'<>'cancelled' OR (SELECT status FROM public.orders WHERE id=b)<>'cancelled' THEN RAISE EXCEPTION 'Cancellation failed'; END IF;
 result:=public.order_payment_recovery(token_b,'start');
 IF (result->>'can_pay')::boolean THEN RAISE EXCEPTION 'Cancelled order is payable'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_emails WHERE order_id=b) THEN RAISE EXCEPTION 'Cancelled order sent paid confirmations'; END IF;
 -- A valid late COMPLETE notification must still win and notify both parties.
 UPDATE public.orders SET payment_status='paid',payment_reference='reminder-test-paid',paid_at=now() WHERE id=b;
 result:=public.order_payment_recovery(token_b,'cancel');
 IF result->>'payment_status'<>'paid' OR (SELECT payment_status FROM public.orders WHERE id=b)<>'paid' THEN RAISE EXCEPTION 'Cancellation downgraded paid order'; END IF;
 IF (SELECT count(*) FROM public.order_emails WHERE order_id=b)<>2 THEN RAISE EXCEPTION 'Existing paid confirmation trigger not preserved'; END IF;
 UPDATE public.payment_reminders SET next_attempt_at='1900-01-01' WHERE order_id=a;
 lease:=public.acquire_reminder_worker();
 IF lease IS NULL OR public.acquire_reminder_worker() IS NOT NULL THEN RAISE EXCEPTION 'Worker concurrency guard failed'; END IF;
 PERFORM public.release_reminder_worker(lease);
 job:=public.claim_payment_reminder();
 IF job->>'order_id'<>a::text OR NOT public.payment_reminder_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Claim or pre-send check failed'; END IF;
 UPDATE public.orders SET payment_status='paid',paid_at=now(),payment_reference='reminder-test-paid-2' WHERE id=a;
 IF public.payment_reminder_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Reminder allowed after payment'; END IF;
 UPDATE public.orders SET payment_status='pending',paid_at=NULL,payment_reference='' WHERE id=a;
 UPDATE public.payment_reminders SET expires_at=now()-interval '1 minute' WHERE order_id=a;
 result:=public.order_payment_recovery(token_a,'cancel');
 IF result->>'code'<>'expired' OR (SELECT payment_status FROM public.orders WHERE id=a)<>'pending' THEN RAISE EXCEPTION 'Expired link mutated order'; END IF;
 IF (public.order_payment_recovery(gen_random_uuid(),'status'))->>'code'<>'invalid' THEN RAISE EXCEPTION 'Invalid token accepted'; END IF;
 IF has_function_privilege('anon','public.order_payment_recovery(uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.claim_payment_reminder()','EXECUTE') THEN RAISE EXCEPTION 'Private recovery functions browser callable'; END IF;
 IF has_column_privilege('authenticated','public.payment_reminders','token','SELECT') OR has_column_privilege('authenticated','public.payment_reminders','payload','SELECT') OR has_table_privilege('anon','public.payment_reminders','SELECT') THEN RAISE EXCEPTION 'Reminder token privacy broken'; END IF;
END $$;
