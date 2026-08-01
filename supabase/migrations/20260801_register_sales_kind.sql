-- Add income kind so Discord /register can book register, tips, event, deposit, rebate, other
-- Safe to re-run.

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
