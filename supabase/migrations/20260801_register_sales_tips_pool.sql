-- Tips → pool + notes so Discord /register mirrors the desk Log income form
-- Safe to re-run.

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
