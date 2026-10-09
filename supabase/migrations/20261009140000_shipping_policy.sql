-- One backend-owned policy, read-only to storefront clients.
-- Existing orders and their signed PayFast totals are intentionally untouched.
CREATE TABLE public.shipping_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  flat_rate numeric(12,2) NOT NULL CHECK (flat_rate >= 0),
  free_shipping_threshold numeric(12,2) NOT NULL CHECK (free_shipping_threshold > 0)
);
INSERT INTO public.shipping_settings (id, flat_rate, free_shipping_threshold) VALUES (true, 99, 1500);
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shipping_settings TO anon, authenticated;
GRANT ALL ON public.shipping_settings TO service_role;
CREATE POLICY "Storefront reads shipping policy" ON public.shipping_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.place_order(p_customer jsonb, p_items jsonb, p_coupon_code text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_product_id text;
  v_size text;
  v_quantity integer;
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_code text := '';
  v_coupon record;
  v_total numeric(12,2);
  v_shipping numeric(12,2);
BEGIN
  IF p_customer IS NULL OR jsonb_typeof(p_customer) <> 'object' THEN
    RAISE EXCEPTION 'Customer details are required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'An order must contain between 1 and 50 items';
  END IF;
  IF nullif(btrim(p_customer->>'first_name'), '') IS NULL
     OR nullif(btrim(p_customer->>'last_name'), '') IS NULL
     OR nullif(btrim(p_customer->>'email'), '') IS NULL
     OR nullif(btrim(p_customer->>'phone'), '') IS NULL
     OR nullif(btrim(p_customer->>'address_line_1'), '') IS NULL
     OR nullif(btrim(p_customer->>'city'), '') IS NULL
     OR nullif(btrim(p_customer->>'province'), '') IS NULL
     OR nullif(btrim(p_customer->>'postal_code'), '') IS NULL THEN
    RAISE EXCEPTION 'Complete all required customer and delivery fields';
  END IF;
  IF char_length(p_customer->>'first_name') > 100
     OR char_length(p_customer->>'last_name') > 100
     OR char_length(p_customer->>'email') > 320
     OR char_length(p_customer->>'phone') > 50
     OR char_length(p_customer->>'address_line_1') > 250
     OR char_length(coalesce(p_customer->>'address_line_2', '')) > 250
     OR char_length(p_customer->>'city') > 120
     OR char_length(p_customer->>'province') > 120
     OR char_length(p_customer->>'postal_code') > 30
     OR char_length(coalesce(p_customer->>'country', '')) > 120
     OR char_length(coalesce(p_customer->>'notes', '')) > 1000
     OR char_length(coalesce(p_coupon_code, '')) > 50 THEN
    RAISE EXCEPTION 'One or more customer fields are too long';
  END IF;
  IF lower(p_customer->>'email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;

  v_order_number := 'MBM-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' ||
    upper(substring(replace(v_order_id::text, '-', '') FROM 1 FOR 10));

  INSERT INTO public.orders (
    id, order_number, customer_first_name, customer_last_name, customer_email, customer_phone,
    shipping_address_line_1, shipping_address_line_2, shipping_city, shipping_province,
    shipping_postal_code, shipping_country, customer_notes
  ) VALUES (
    v_order_id, v_order_number,
    btrim(p_customer->>'first_name'), btrim(p_customer->>'last_name'),
    lower(btrim(p_customer->>'email')), btrim(p_customer->>'phone'),
    btrim(p_customer->>'address_line_1'), btrim(coalesce(p_customer->>'address_line_2', '')),
    btrim(p_customer->>'city'), btrim(p_customer->>'province'), btrim(p_customer->>'postal_code'),
    coalesce(nullif(btrim(p_customer->>'country'), ''), 'South Africa'),
    btrim(coalesce(p_customer->>'notes', ''))
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := nullif(btrim(v_item->>'product_id'), '');
    v_size := nullif(btrim(v_item->>'size'), '');
    IF v_product_id IS NULL OR v_size IS NULL
       OR coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'An order item is invalid';
    END IF;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity > 10 THEN
      RAISE EXCEPTION 'A maximum of 10 units is allowed per item';
    END IF;
    SELECT * INTO v_product FROM public.products WHERE id = v_product_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A product is unavailable: %', v_product_id;
    END IF;
    IF NOT (v_size = ANY(v_product.sizes)) THEN
      RAISE EXCEPTION 'Size % is unavailable for %', v_size, v_product.name;
    END IF;
    v_line_total := round(v_product.price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    INSERT INTO public.order_items (
      order_id, product_id, product_name, product_image_path, size, quantity, unit_price, line_total
    ) VALUES (
      v_order_id, v_product.id, v_product.name, coalesce(v_product.images[1], ''),
      v_size, v_quantity, v_product.price, v_line_total
    );
  END LOOP;

  IF nullif(btrim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public._coupon_discount(p_coupon_code, p_customer->>'email', v_subtotal, true);
    v_discount := v_coupon.discount;
    v_code := v_coupon.code;
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_email, customer_name, discount_amount)
    VALUES (v_coupon.coupon_id, v_order_id, lower(btrim(p_customer->>'email')),
      btrim(p_customer->>'first_name') || ' ' || btrim(p_customer->>'last_name'), v_discount);
  END IF;

  -- Eligibility is based on the merchandise total AFTER the validated discount.
  -- No price, discount or shipping amount supplied by the browser is trusted.
  SELECT CASE WHEN greatest(v_subtotal - v_discount, 0) >= s.free_shipping_threshold
              THEN 0 ELSE s.flat_rate END
  INTO v_shipping FROM public.shipping_settings s WHERE s.id = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shipping rates are unavailable. Please try again later.'; END IF;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      discount_code = v_code,
      discount_amount = v_discount,
      shipping_amount = v_shipping,
      total = greatest(v_subtotal - v_discount, 0) + v_shipping
  WHERE id = v_order_id
  RETURNING total INTO v_total;

  RETURN jsonb_build_object(
    'id', v_order_id, 'order_number', v_order_number,
    'subtotal', v_subtotal, 'discount', v_discount,
    'shipping_amount', v_shipping, 'total', v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
