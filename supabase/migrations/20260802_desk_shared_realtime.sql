-- Enable Supabase Realtime "doorbell" for shared desk packs.
-- After this runs, desks listening on desk_shared_state get pinged when Publish updates the row.
-- Run in SQL Editor once (desk_shared_state must already exist from 20260801_desk_shared_state.sql).

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
