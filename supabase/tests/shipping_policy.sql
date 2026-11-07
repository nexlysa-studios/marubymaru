-- Synthetic fixtures only. Run inside BEGIN/ROLLBACK, never commit this file.
INSERT INTO public.products (id, name, price, sizes, is_active) VALUES
  ('shipping-test-one', 'Shipping test', 1, ARRAY['M'], true),
  ('shipping-test-below', 'Shipping test', 1499.99, ARRAY['M'], true),
  ('shipping-test-threshold', 'Shipping test', 1500, ARRAY['M'], true),
  ('shipping-test-above', 'Shipping test', 1500.01, ARRAY['M'], true),
  ('shipping-test-coupon', 'Shipping test', 1600, ARRAY['M'], true);
INSERT INTO public.coupons (code, discount_type, discount_value) VALUES
  ('SHIPPING-TEST-150', 'fixed', 150), ('SHIPPING-TEST-100', 'fixed', 100);

SET LOCAL ROLE anon;
DO $$
DECLARE
  v_customer jsonb := '{"first_name":"Shipping","last_name":"Test","email":"shipping-check@example.invalid","phone":"0000000000","address_line_1":"Test only","city":"Test","province":"Test","postal_code":"0000","shipping_amount":0,"total":1}';
  v_case record;
  v_result jsonb;
  v_items jsonb;
BEGIN
  IF (SELECT flat_rate FROM public.shipping_settings WHERE id) <> 99 OR
     (SELECT free_shipping_threshold FROM public.shipping_settings WHERE id) <> 1500 THEN
    RAISE EXCEPTION 'Incorrect shipping policy';
  END IF;
  FOR v_case IN SELECT * FROM (VALUES
    ('shipping-test-one', 1::numeric, 99::numeric, 100::numeric),
    ('shipping-test-below', 1499.99, 99, 1598.99),
    ('shipping-test-threshold', 1500, 0, 1500),
    ('shipping-test-above', 1500.01, 0, 1500.01)
  ) AS cases(product_id, subtotal, shipping, total)
  LOOP
    -- Fake browser prices/totals must never influence the DB calculation.
    v_items := jsonb_build_array(jsonb_build_object('product_id', v_case.product_id,
      'size', 'M', 'quantity', 1, 'price', 0.01, 'shipping_amount', 0));
    v_result := public.place_order(v_customer, v_items, NULL);
    IF (v_result->>'subtotal')::numeric <> v_case.subtotal OR
       (v_result->>'shipping_amount')::numeric <> v_case.shipping OR
       (v_result->>'total')::numeric <> v_case.total THEN
      RAISE EXCEPTION 'Wrong server quote for %: %', v_case.product_id, v_result;
    END IF;
  END LOOP;

  v_items := '[{"product_id":"shipping-test-coupon","size":"M","quantity":1}]';
  v_result := public.place_order(v_customer, v_items, 'SHIPPING-TEST-150');
  IF (v_result->>'discount')::numeric <> 150 OR (v_result->>'shipping_amount')::numeric <> 99 OR
     (v_result->>'total')::numeric <> 1549 THEN RAISE EXCEPTION 'Post-discount threshold failed'; END IF;
  v_result := public.place_order(v_customer, v_items, 'SHIPPING-TEST-100');
  IF (v_result->>'shipping_amount')::numeric <> 0 OR (v_result->>'total')::numeric <> 1500 THEN
    RAISE EXCEPTION 'Exact threshold after discount failed';
  END IF;

  -- Existing per-customer coupon limits still use lowercased email, not name.
  BEGIN
    PERFORM public.place_order(v_customer || '{"email":"SHIPPING-CHECK@example.invalid","first_name":"Different"}', v_items, 'SHIPPING-TEST-150');
    RAISE EXCEPTION 'Coupon reuse accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'You have already used this discount code%' THEN RAISE; END IF;
  END;

  IF has_table_privilege('anon', 'public.shipping_settings', 'UPDATE') OR
     has_table_privilege('authenticated', 'public.shipping_settings', 'UPDATE') OR
     has_table_privilege('anon', 'public.shipping_settings', 'INSERT') OR
     has_table_privilege('authenticated', 'public.shipping_settings', 'DELETE') THEN
    RAISE EXCEPTION 'Browser may change shipping policy';
  END IF;
  IF has_column_privilege('authenticated', 'public.orders', 'payment_status', 'UPDATE') THEN
    RAISE EXCEPTION 'Browser may mark orders paid';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_email = 'shipping-check@example.invalid'
    AND (o.total <> o.subtotal - o.discount_amount + o.shipping_amount OR o.payment_status <> 'pending')) THEN
    RAISE EXCEPTION 'Stored order totals or payment status incorrect';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_emails e JOIN public.orders o ON o.id = e.order_id
    WHERE o.customer_email = 'shipping-check@example.invalid') THEN
    RAISE EXCEPTION 'Unpaid shipping test queued emails';
  END IF;
END;
$$;
