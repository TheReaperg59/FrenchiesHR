-- Frenchie's register sales feed (Discord modal → desk Income pull)
-- Run via: supabase db push   or paste in SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.register_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default (timezone('utc', now()))::date,
  station text not null default '',
  amount integer not null check (amount > 0),
  source text not null default 'Register',
  paid_by text not null default '',
  discord_user_id text,
  discord_msg_id text unique,
  interaction_id text unique,
  status text not null default 'pending' check (status in ('pending', 'booked')),
  booked_at timestamptz,
  desk_income_id integer,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists register_sales_pending_created_idx
  on public.register_sales (created_at asc)
  where status = 'pending';

alter table public.register_sales enable row level security;

-- Desk (anon key) may only read rows waiting to be booked
drop policy if exists "register_sales_select_pending" on public.register_sales;
create policy "register_sales_select_pending"
  on public.register_sales
  for select
  to anon, authenticated
  using (status = 'pending');

-- No direct insert/update/delete for anon — Edge Function uses service role
-- Booking goes through RPC below

create or replace function public.book_register_sale(p_id uuid, p_desk_income_id integer)
returns public.register_sales
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.register_sales;
begin
  update public.register_sales
  set
    status = 'booked',
    booked_at = timezone('utc', now()),
    desk_income_id = coalesce(p_desk_income_id, desk_income_id)
  where id = p_id
    and status = 'pending'
  returning * into row_out;

  if row_out.id is null then
    select * into row_out from public.register_sales where id = p_id;
  end if;

  return row_out;
end;
$$;

revoke all on function public.book_register_sale(uuid, integer) from public;
grant execute on function public.book_register_sale(uuid, integer) to anon, authenticated;

comment on table public.register_sales is 'Discord /register modal drops awaiting desk Income booking';
comment on function public.book_register_sale is 'Idempotent pending→booked claim used by the Frenchie desk after local income insert';
