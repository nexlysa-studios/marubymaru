-- Always wrap this file in BEGIN / ROLLBACK. Never commit fixtures.
DO $$
DECLARE due uuid:=gen_random_uuid(); young uuid:=gen_random_uuid(); paid uuid:=gen_random_uuid(); fulfilling uuid:=gen_random_uuid(); unsent uuid:=gen_random_uuid(); manual uuid:=gen_random_uuid(); job jsonb; token uuid;
BEGIN
 INSERT INTO public.orders(id,order_number,customer_first_name,customer_last_name,customer_email,customer_phone,shipping_address_line_1,shipping_city,shipping_province,shipping_postal_code,total,payment_status,status)
 SELECT id,'EXPIRY-TEST-'||id,'Expiry','Test','expiry-test@example.invalid','0000000000','Test','Test','Test','0000',749,payment,fulfilment
 FROM (VALUES(due,'pending','new'),(young,'pending','new'),(paid,'paid','confirmed'),(fulfilling,'pending','processing'),(unsent,'pending','new'),(manual,'cancelled','cancelled')) AS fixtures(id,payment,fulfilment);
 INSERT INTO public.payment_reminders(order_id,snapshot,status,sent_at,expires_at)
 SELECT id,'{}'::jsonb,CASE WHEN id=unsent THEN 'queued' ELSE 'sent' END,CASE WHEN id=unsent THEN NULL ELSE now()-interval '48 hours' END,CASE WHEN id=young THEN now()+interval '1 second' ELSE now() END
 FROM unnest(ARRAY[due,young,paid,fulfilling,unsent,manual]) id;
 PERFORM public.expire_unpaid_orders(); PERFORM public.expire_unpaid_orders();
 IF (SELECT payment_status FROM public.orders WHERE id=due)<>'cancelled' OR (SELECT cancellation_reason FROM public.orders WHERE id=due)<>'payment_window_expired' THEN RAISE EXCEPTION 'Due order not expired'; END IF;
 IF (SELECT count(*) FROM public.order_cancellation_emails WHERE order_id=ANY(ARRAY[due,young,paid,fulfilling,unsent,manual]))<>1 THEN RAISE EXCEPTION 'Duplicate or ineligible cancellation email'; END IF;
 IF (SELECT payment_status FROM public.orders WHERE id=young)<>'pending' OR (SELECT payment_status FROM public.orders WHERE id=paid)<>'paid' OR (SELECT status FROM public.orders WHERE id=fulfilling)<>'processing' OR (SELECT payment_status FROM public.orders WHERE id=unsent)<>'pending' THEN RAISE EXCEPTION 'Protected order changed'; END IF;
 SELECT r.token INTO token FROM public.payment_reminders r WHERE order_id=due;
 IF (public.order_payment_recovery(token,'start')->>'can_pay')::boolean THEN RAISE EXCEPTION 'Expired cancelled order can pay'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_emails WHERE order_id=due) THEN RAISE EXCEPTION 'Expiry queued paid confirmations'; END IF;
 UPDATE public.order_cancellation_emails SET next_attempt_at='1900-01-01',created_at='1900-01-01' WHERE order_id=due;
 job:=public.claim_cancellation_email();
 IF job->>'order_id'<>due::text OR NOT public.cancellation_email_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Cancellation email claim/guard failed'; END IF;
 UPDATE public.orders SET payment_status='paid',paid_at=now(),payment_reference='expiry-test-late-paid' WHERE id=due;
 IF public.cancellation_email_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Cancellation email allowed after late payment'; END IF;
 PERFORM public.expire_unpaid_orders(due);
 IF (SELECT payment_status FROM public.orders WHERE id=due)<>'paid' OR (SELECT count(*) FROM public.order_emails WHERE order_id=due)<>2 THEN RAISE EXCEPTION 'Late payment/receipts not preserved'; END IF;
 IF has_function_privilege('anon','public.expire_unpaid_orders(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.claim_cancellation_email()','EXECUTE') OR has_column_privilege('authenticated','public.order_cancellation_emails','payload','SELECT') THEN RAISE EXCEPTION 'Outbox privileges too broad'; END IF;
END $$;
