-- Run within BEGIN/ROLLBACK only. pg_net dispatches are rolled back with fixtures.
DO $$
DECLARE result text; sid uuid; token uuid; job jsonb; lease uuid;
BEGIN
 result:=public.newsletter_join(' LIFECYCLE-TEST@example.invalid ','subscription-test-ip');
 IF result<>'subscribed' THEN RAISE EXCEPTION 'First signup rejected'; END IF;
 SELECT id,unsubscribe_token INTO sid,token FROM public.newsletter_subscribers WHERE email='lifecycle-test@example.invalid';
 IF (SELECT count(*) FROM public.subscription_notifications WHERE subscriber_id=sid)<>2 THEN RAISE EXCEPTION 'Expected welcome and admin signup emails'; END IF;
 result:=public.newsletter_join('lifecycle-test@example.invalid','subscription-test-ip');
 IF result<>'already_subscribed' OR (SELECT count(*) FROM public.subscription_notifications WHERE subscriber_id=sid)<>2 THEN RAISE EXCEPTION 'Duplicate signup sent additional emails'; END IF;
 lease:=public.acquire_subscription_worker();
 IF lease IS NULL OR public.acquire_subscription_worker() IS NOT NULL THEN RAISE EXCEPTION 'Worker concurrency lock failed'; END IF;
 PERFORM public.release_subscription_worker(lease);
 UPDATE public.subscription_notifications SET next_attempt_at=now()+interval '1 day' WHERE subscriber_id=sid AND kind<>'welcome';
 job:=public.claim_subscription_notification();
 IF job->>'kind'<>'welcome' OR NOT public.subscription_notification_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Cannot claim welcome'; END IF;
 PERFORM public.newsletter_unsubscribe(token);
 IF public.subscription_notification_allowed((job->>'id')::uuid,(job->>'lock_token')::uuid) THEN RAISE EXCEPTION 'Welcome allowed after unsubscribe'; END IF;
 IF (SELECT count(*) FROM public.subscription_notifications WHERE subscriber_id=sid)<>4 THEN RAISE EXCEPTION 'Missing unsubscribe confirmations'; END IF;
 PERFORM public.newsletter_unsubscribe(token);
 IF (SELECT count(*) FROM public.subscription_notifications WHERE subscriber_id=sid)<>4 THEN RAISE EXCEPTION 'Repeated unsubscribe duplicated confirmations'; END IF;
 result:=public.newsletter_join('lifecycle-test@example.invalid','subscription-test-ip');
 IF result<>'unavailable' OR (SELECT status FROM public.newsletter_subscribers WHERE id=sid)<>'unsubscribed' THEN RAISE EXCEPTION 'Duplicate signup reactivated consent'; END IF;
 -- Preview/config pause must not gate action confirmations.
 IF NOT EXISTS(SELECT 1 FROM public.subscription_notifications WHERE subscriber_id=sid AND kind='goodbye' AND status='queued') THEN RAISE EXCEPTION 'Unsubscribe receipt not queued'; END IF;
 IF has_table_privilege('anon','public.subscription_notifications','SELECT') OR has_column_privilege('authenticated','public.subscription_notifications','snapshot','SELECT') OR has_column_privilege('authenticated','public.subscription_notifications','payload','SELECT') THEN RAISE EXCEPTION 'Private tokens or payloads exposed'; END IF;
 IF has_function_privilege('authenticated','public.claim_subscription_notification()','EXECUTE') THEN RAISE EXCEPTION 'Browser can consume notifications'; END IF;
END $$;
