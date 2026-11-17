-- Atomic sale recording for SmartStock.
-- Run after 0001_initial_schema.sql.
-- SECURITY INVOKER ensures the caller's RLS policies remain in force.

create or replace function public.record_sale(
  p_business_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_payment text default 'Cash'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_sale public.sales%rowtype;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least one' using errcode = '22023';
  end if;

  if p_payment not in ('Cash', 'POS', 'Transfer') then
    raise exception 'Unsupported payment method' using errcode = '22023';
  end if;

  if not public.is_business_member(p_business_id) then
    raise exception 'You do not have access to this business' using errcode = '42501';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if v_product.stock < p_quantity then
    raise exception 'Not enough stock available' using errcode = '22023';
  end if;

  update public.products
  set stock = stock - p_quantity
  where id = p_product_id and business_id = p_business_id;

  insert into public.sales (
    business_id, product_id, product_name, quantity, total, profit, payment
  ) values (
    p_business_id,
    p_product_id,
    v_product.name,
    p_quantity,
    v_product.price * p_quantity,
    (v_product.price - v_product.cost) * p_quantity,
    p_payment
  )
  returning * into v_sale;

  return jsonb_build_object(
    'product', to_jsonb(v_product) || jsonb_build_object('stock', v_product.stock - p_quantity),
    'sale', to_jsonb(v_sale)
  );
end;
$$;

revoke all on function public.record_sale(uuid, uuid, integer, text) from public;
grant execute on function public.record_sale(uuid, uuid, integer, text) to authenticated;
