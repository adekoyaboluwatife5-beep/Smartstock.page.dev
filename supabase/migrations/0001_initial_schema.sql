-- SmartStock initial Supabase schema
-- Apply this migration in the Supabase SQL Editor.
-- All tenant data is scoped by business_id and protected with RLS.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  type text not null default 'Supermarket',
  currency text not null default 'NGN',
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'Starter',
  subscription_status text not null default 'setup',
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  sku text not null default '',
  category text not null default 'Other',
  stock integer not null default 0 check (stock >= 0),
  price numeric(14,2) not null check (price > 0),
  cost numeric(14,2) not null default 0 check (cost >= 0),
  threshold integer not null default 5 check (threshold >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  total numeric(14,2) not null check (total >= 0),
  profit numeric(14,2) not null,
  payment text not null default 'Cash' check (payment in ('Cash', 'POS', 'Transfer')),
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_id_idx on public.memberships(user_id);
create index if not exists products_business_id_idx on public.products(business_id);
create index if not exists sales_business_created_idx on public.sales(business_id, created_at desc);

-- SECURITY DEFINER avoids recursive membership-policy evaluation.
create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = target_business_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;

alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;

drop policy if exists "members can view their businesses" on public.businesses;
create policy "members can view their businesses"
on public.businesses for select to authenticated
using (public.is_business_member(id));

drop policy if exists "authenticated users can create their own business" on public.businesses;
create policy "authenticated users can create their own business"
on public.businesses for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "owners can update their businesses" on public.businesses;
create policy "owners can update their businesses"
on public.businesses for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "members can view memberships in their businesses" on public.memberships;
create policy "members can view memberships in their businesses"
on public.memberships for select to authenticated
using (user_id = auth.uid() or public.is_business_member(business_id));

drop policy if exists "business owners can add memberships" on public.memberships;
create policy "business owners can add memberships"
on public.memberships for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = auth.uid()
  )
);

drop policy if exists "owners can remove memberships" on public.memberships;
create policy "owners can remove memberships"
on public.memberships for delete to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_id = auth.uid()
  )
);

drop policy if exists "members can view products" on public.products;
create policy "members can view products"
on public.products for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists "members can add products" on public.products;
create policy "members can add products"
on public.products for insert to authenticated
with check (public.is_business_member(business_id));

drop policy if exists "members can update products" on public.products;
create policy "members can update products"
on public.products for update to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists "members can delete products" on public.products;
create policy "members can delete products"
on public.products for delete to authenticated
using (public.is_business_member(business_id));

drop policy if exists "members can view sales" on public.sales;
create policy "members can view sales"
on public.sales for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists "members can record sales" on public.sales;
create policy "members can record sales"
on public.sales for insert to authenticated
with check (
  public.is_business_member(business_id)
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.business_id = business_id
  )
);

-- No public/anon policies are created. Authenticated access is membership-scoped.
