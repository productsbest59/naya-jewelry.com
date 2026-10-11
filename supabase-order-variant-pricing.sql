-- Release with the USD pricing changes. Existing orders and currency stay intact.
-- Keep the existing RPC signature/privileges. Prices come from products, never unitPrice.
create or replace function public.create_naya_order(p_customer jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if coalesce(trim(p_customer->>'fullName'),'') = ''
     or coalesce(trim(p_customer->>'email'),'') = ''
     or coalesce(trim(p_customer->>'phone'),'') = ''
     or coalesce(trim(p_customer->>'country'),'') = ''
     or coalesce(trim(p_customer->>'city'),'') = ''
     or coalesce(trim(p_customer->>'address'),'') = '' then
    raise exception 'Missing required customer details';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
  v_order_number := 'NY-' || to_char(now(),'MMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
  insert into public.orders (order_number,customer_name,customer_email,customer_phone,country,city,address,postal_code,customer_note,currency,subtotal,shipping_amount,total)
  values (v_order_number,trim(p_customer->>'fullName'),trim(p_customer->>'email'),trim(p_customer->>'phone'),trim(p_customer->>'country'),trim(p_customer->>'city'),trim(p_customer->>'address'),coalesce(trim(p_customer->>'postalCode'),''),coalesce(trim(p_customer->>'notes'),''),'ILS',0,0,0)
  returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := greatest(1,least(20,coalesce((v_item->>'quantity')::integer,1)));
    select * into v_product from public.products where id=(v_item->>'productId')::uuid and active=true;
    if not found then raise exception 'Product is unavailable'; end if;
    -- Match the same merged size/style label used by the storefront. A zero
    -- optional variant price means "use base price", not a free product.
    select case when coalesce(nullif(variant.value->>'price','')::numeric,0)>0
      then (variant.value->>'price')::numeric else v_product.price_ils end
    into v_unit_price
    from jsonb_array_elements(coalesce(v_product.variants,'[]'::jsonb)) with ordinality variant(value,position)
    where (coalesce(variant.value->>'color','')='' or variant.value->>'color'=coalesce(v_item->>'color',''))
      and (concat_ws(' - ',nullif(variant.value->>'size',''),nullif(variant.value->>'style',''))=''
        or concat_ws(' - ',nullif(variant.value->>'size',''),nullif(variant.value->>'style',''))=coalesce(v_item->>'size',''))
    order by variant.position limit 1;
    v_unit_price := coalesce(v_unit_price,v_product.price_ils);
    if v_unit_price < 0 then raise exception 'Invalid variant price'; end if;
    insert into public.order_items (order_id,product_id,sku,product_name_he,product_name_en,unit_price,quantity,selected_options,primary_image_path)
    values (v_order_id,v_product.id,v_product.sku,v_product.name_he,v_product.name_en,v_unit_price,v_quantity,jsonb_build_object('color',coalesce(v_item->>'color',''),'size',coalesce(v_item->>'size',''),'style',coalesce(v_item->>'style','')),coalesce((select storage_path from public.product_images where product_id=v_product.id and is_primary limit 1),''));
    v_total := v_total+(v_unit_price*v_quantity);
  end loop;
  update public.orders set subtotal=v_total,total=v_total where id=v_order_id;
  return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'total_ils',v_total,'payment_status','pending','fulfillment_status','new');
end;
$function$;
