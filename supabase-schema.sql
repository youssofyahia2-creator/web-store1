-- VANTAGE store schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create table if not exists public.products (
  id text primary key,
  name text not null,
  price numeric not null default 0,
  currency text not null default 'EGP',
  category text not null default 'Product',
  description text not null default '',
  image text not null default '',
  sizes jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key,
  name text not null default '',
  email text not null unique,
  salt text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.orders (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null default 'new',
  payment_status text not null default 'pending',
  type text not null default 'ready',
  source text not null default 'web',
  customer_id text references public.customers(id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',
  notes text not null default '',
  product_id text not null default '',
  product_name text not null default '',
  size text not null default '',
  color text not null default '',
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  subtotal_price numeric not null default 0,
  discount_amount numeric not null default 0,
  final_price numeric not null default 0,
  currency text not null default 'egp',
  price_label text not null default '',
  custom_preview text not null default '',
  custom_shirt_color text not null default '',
  payment_session_id text not null default '',
  payment_reference text not null default ''
);

create table if not exists public.admin_account (
  id integer primary key default 1,
  username text not null,
  salt text not null,
  hash text not null,
  must_change_password boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint admin_account_singleton check (id = 1)
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_email_idx on public.orders (customer_email);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists customers_email_idx on public.customers (email);

-- The server connects with the service_role key and talks to Postgres directly,
-- bypassing RLS by design, so these tables are locked down from anon/authenticated
-- access. Nothing public-facing ever queries Supabase directly.
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.admin_account enable row level security;

-- Storage bucket for uploaded design previews (Design Studio feature).
-- Create it once from the Supabase dashboard: Storage > New bucket
--   Name: design-uploads
--   Public bucket: ON (so uploaded images can be shown directly on the site)
-- Or run this instead:
insert into storage.buckets (id, name, public)
values ('design-uploads', 'design-uploads', true)
on conflict (id) do nothing;
