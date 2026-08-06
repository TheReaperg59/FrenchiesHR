-- Frenchie's HR pending updates & shared desk sync
-- Combined migration using a fresh timestamp to prevent version 20260801 migration collisions

-- 1. Shared desk state table for multi-PC sync
create table if not exists public.desk_shared_state (
  id text primary key default 'frenchies',
  rev bigint not null default 0,
  pack jsonb not null default '{}'::jsonb,
  shared_at timestamptz not null default timezone('utc', now()),
  build text not null default '',
  updated_by text not null default ''
);

alter table public.desk_shared_state enable row level security;

drop policy if exists "desk_shared_select" on public.desk_shared_state;
create policy "desk_shared_select"
  on public.desk_shared_state
  for select
  to anon, authenticated
  using (true);

drop policy if exists "desk_shared_insert" on public.desk_shared_state;
create policy "desk_shared_insert"
  on public.desk_shared_state
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "desk_shared_update" on public.desk_shared_state;
create policy "desk_shared_update"
  on public.desk_shared_state
  for update
  to anon, authenticated
  using (true)
  with check (true);

comment on table public.desk_shared_state is 'Frenchie shared desk pack (PINs redacted) for multi-PC Publish/Pull';

-- 2. Add income kind column to register_sales
alter table public.register_sales
  add column if not exists kind text;

update public.register_sales
set kind = 'register'
where kind is null or kind = '';

alter table public.register_sales
  alter column kind set default 'register';

alter table public.register_sales
  alter column kind set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'register_sales_kind_check'
  ) then
    alter table public.register_sales
      add constraint register_sales_kind_check
      check (kind in ('register', 'tips', 'event', 'deposit', 'rebate', 'other'));
  end if;
end $$;

comment on column public.register_sales.kind is 'Maps to desk Income kind (register, tips, event, deposit, rebate, other)';

-- 3. Add tips_to_pool and notes columns to register_sales
alter table public.register_sales
  add column if not exists tips_to_pool integer;

alter table public.register_sales
  add column if not exists notes text;

update public.register_sales
set tips_to_pool = 0
where tips_to_pool is null;

update public.register_sales
set notes = ''
where notes is null;

alter table public.register_sales
  alter column tips_to_pool set default 0;

alter table public.register_sales
  alter column tips_to_pool set not null;

alter table public.register_sales
  alter column notes set default '';

alter table public.register_sales
  alter column notes set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'register_sales_tips_to_pool_check'
  ) then
    alter table public.register_sales
      add constraint register_sales_tips_to_pool_check
      check (tips_to_pool >= 0);
  end if;
end $$;

comment on column public.register_sales.tips_to_pool is 'Desk Tips → pool ($); used when kind = tips';
comment on column public.register_sales.notes is 'Optional notes from Discord modal / sync';

-- 4. Enable Supabase Realtime for desk_shared_state
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'desk_shared_state'
  ) then
    alter publication supabase_realtime add table public.desk_shared_state;
  end if;
end $$;

comment on table public.desk_shared_state is
  'Frenchie shared desk pack (PINs/webhooks redacted; Supabase URL+anon included for live listen)';
