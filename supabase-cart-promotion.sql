create table if not exists public.store_promotions (
  id text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.store_promotions (id, enabled)
values ('quantity_offer', true)
on conflict (id) do nothing;

alter table public.store_promotions enable row level security;

drop policy if exists "Public can read store promotions" on public.store_promotions;
create policy "Public can read store promotions"
on public.store_promotions for select
using (true);

drop policy if exists "Naya admins can update store promotions" on public.store_promotions;
create policy "Naya admins can update store promotions"
on public.store_promotions for update
using (public.is_naya_admin())
with check (public.is_naya_admin());

grant select on public.store_promotions to anon, authenticated;
grant update on public.store_promotions to authenticated;

alter table public.orders add column if not exists subtotal numeric(12,2);
alter table public.orders add column if not exists promotion_discount numeric(12,2) not null default 0;

create or replace function public.apply_naya_order_promotion(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
  v_quantity integer := 0;
  v_cheapest numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_order jsonb;
begin
  select enabled into v_enabled from public.store_promotions where id = 'quantity_offer';

  select
    coalesce(sum(oi.quantity),0)::integer,
    coalesce(min(coalesce(
      nullif(to_jsonb(oi)->>'unit_price','')::numeric,
      nullif(to_jsonb(oi)->>'price','')::numeric,
      nullif(to_jsonb(oi)->>'line_total','')::numeric / nullif(oi.quantity,0)
    )),0),
    coalesce(sum(coalesce(
      nullif(to_jsonb(oi)->>'unit_price','')::numeric,
      nullif(to_jsonb(oi)->>'price','')::numeric,
      nullif(to_jsonb(oi)->>'line_total','')::numeric / nullif(oi.quantity,0),
      0
    ) * oi.quantity),0)
  into v_quantity, v_cheapest, v_subtotal
  from public.order_items oi
  where oi.order_id = p_order_id;

  if v_enabled then
    if v_quantity >= 5 then v_discount := v_cheapest;
    elsif v_quantity >= 4 then v_discount := v_cheapest * 0.5;
    end if;
  end if;

  update public.orders
  set subtotal = v_subtotal,
      promotion_discount = round(v_discount,2),
      total = round(v_subtotal - v_discount,2)
  where id = p_order_id and payment_status = 'pending'
  returning to_jsonb(orders.*) into v_order;

  return v_order;
end;
$$;

revoke all on function public.apply_naya_order_promotion(uuid) from public;
grant execute on function public.apply_naya_order_promotion(uuid) to anon, authenticated;
