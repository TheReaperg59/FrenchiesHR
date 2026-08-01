-- Shared desk pack for multi-PC sync (password/PIN-redacted JSON)
-- Desk Publish/Pull uses anon key + RLS. Pack never includes login secrets.

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
