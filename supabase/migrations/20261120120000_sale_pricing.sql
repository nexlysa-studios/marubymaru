-- Preserve regular prices and immutable historical orders; no sale backfill.
ALTER TABLE public.products ADD COLUMN sale_price numeric(10,2), ADD COLUMN sale_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD CONSTRAINT valid_sale_price CHECK (sale_price IS NULL OR (sale_price > 0 AND sale_price < price));
ALTER TABLE public.order_items ADD COLUMN regular_unit_price numeric(12,2), ADD COLUMN was_on_sale boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_coupon(p_code text, p_email text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_subtotal numeric := 0; v_eligible numeric := 0; v_item jsonb; v_product public.products%ROWTYPE; v_qty integer; r record;
BEGIN
 IF p_code IS NULL OR btrim(p_code) = '' OR length(p_code)>50 THEN RAISE EXCEPTION 'Enter a discount code.'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Your cart is invalid.'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Invalid quantity.'; END IF;
  v_qty := (v_item->>'quantity')::int;
  IF v_qty>10 THEN RAISE EXCEPTION 'A maximum of 10 units is allowed per item'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id=v_item->>'product_id' AND is_active FOR SHARE;
  IF NOT FOUND OR NOT (coalesce(v_item->>'size','')=ANY(v_product.sizes)) THEN RAISE EXCEPTION 'A product or size is unavailable.'; END IF;
  v_subtotal := v_subtotal + coalesce(v_product.sale_price,v_product.price)*v_qty;
  IF v_product.sale_price IS NULL THEN v_eligible := v_eligible + v_product.price*v_qty; END IF;
 END LOOP;
 IF v_eligible<=0 THEN RAISE EXCEPTION 'Discount codes do not apply to sale items.'; END IF;
 SELECT * INTO r FROM public._coupon_discount(p_code,p_email,v_eligible,false);
 RETURN jsonb_build_object('code',r.code,'discount',r.discount,'subtotal',v_subtotal,'eligible_subtotal',v_eligible);
END; $$;
REVOKE ALL ON FUNCTION public.validate_coupon(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text,text,jsonb) TO anon,authenticated;

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
  v_eligible numeric(12,2) := 0;
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
    SELECT * INTO v_product FROM public.products WHERE id = v_product_id AND is_active = true FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A product is unavailable: %', v_product_id;
    END IF;
    IF NOT (v_size = ANY(v_product.sizes)) THEN
      RAISE EXCEPTION 'Size % is unavailable for %', v_size, v_product.name;
    END IF;
    v_line_total := round(coalesce(v_product.sale_price, v_product.price) * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    IF v_product.sale_price IS NULL THEN v_eligible := v_eligible + v_line_total; END IF;
    INSERT INTO public.order_items (
      order_id, product_id, product_name, product_image_path, size, quantity, unit_price, line_total, regular_unit_price, was_on_sale
    ) VALUES (
      v_order_id, v_product.id, v_product.name, coalesce(v_product.images[1], ''),
      v_size, v_quantity, coalesce(v_product.sale_price, v_product.price), v_line_total, v_product.price, v_product.sale_price IS NOT NULL
    );
  END LOOP;

  IF nullif(btrim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN
    IF v_eligible <= 0 THEN RAISE EXCEPTION 'Discount codes do not apply to sale items.'; END IF;
    SELECT * INTO v_coupon FROM public._coupon_discount(p_coupon_code, p_customer->>'email', v_eligible, true);
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

  IF p_customer ? 'expected_total' AND (p_customer->>'expected_total')::numeric IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'Prices have changed. Please review your updated cart and discount code before paying.';
  END IF;
  RETURN jsonb_build_object(
    'id', v_order_id, 'order_number', v_order_number,
    'subtotal', v_subtotal, 'discount', v_discount,
    'shipping_amount', v_shipping, 'total', v_total
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.place_order(jsonb,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,jsonb,text) TO anon,authenticated;
NOTIFY pgrst, 'reload schema';

