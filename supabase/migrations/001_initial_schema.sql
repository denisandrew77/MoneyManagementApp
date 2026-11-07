-- Run once in Supabase SQL Editor, on a new project.
-- Then run the allowlist INSERT shown in README.md with your Google email.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.allowed_emails (email text primary key check (email = lower(email)));

create function public.is_allowed_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from private.allowed_emails where email = lower(auth.jwt()->>'email')
  );
$$;
revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  salary numeric(14,2) not null check (salary > 0),
  opening_flying_blue_credit numeric(14,2) not null default 0,
  tracking_start_date date not null default current_date,
  timezone text not null default 'Europe/Bucharest' check (timezone = 'Europe/Bucharest'),
  created_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, id), unique(user_id, name)
);
create table public.budget_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  allocation_type text not null check (allocation_type in ('percentage','fixed')),
  allocation_value numeric(14,4) not null check (allocation_value > 0),
  foreign key(user_id,category_id) references public.categories(user_id,id),
  check (allocation_type <> 'percentage' or allocation_value <= 100),
  unique(user_id,category_id)
);
create table public.budget_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  salary_snapshot numeric(14,2) not null check (salary_snapshot > 0),
  created_at timestamptz not null default now(),
  unique(user_id,month), unique(user_id,id)
);
create table public.monthly_category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  budget_month_id uuid not null,
  category_id uuid not null,
  allocation_type text not null check (allocation_type in ('percentage','fixed')),
  allocation_value numeric(14,4) not null check (allocation_value > 0),
  budget_amount numeric(14,2) not null check (budget_amount >= 0),
  foreign key(user_id,budget_month_id) references public.budget_months(user_id,id) on delete cascade,
  foreign key(user_id,category_id) references public.categories(user_id,id),
  unique(budget_month_id,category_id)
);
create table public.top_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default (now() at time zone 'Europe/Bucharest')::date,
  description text check (length(description) <= 1000),
  created_at timestamptz not null default now()
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default (now() at time zone 'Europe/Bucharest')::date,
  payment_source text not null check (payment_source in ('personal','flying_blue')),
  description text check (length(description) <= 1000),
  created_at timestamptz not null default now(),
  foreign key(user_id,category_id) references public.categories(user_id,id),
  unique(user_id,id)
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expense_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default (now() at time zone 'Europe/Bucharest')::date,
  destination text not null check (destination in ('personal','flying_blue')),
  description text check (length(description) <= 1000),
  created_at timestamptz not null default now(),
  foreign key(user_id,expense_id) references public.expenses(user_id,id) on delete restrict
);
create index expenses_user_date on public.expenses(user_id,date);
create index expenses_category_date on public.expenses(user_id,category_id,date);
create index top_ups_user_date on public.top_ups(user_id,date);
create index refunds_user_date on public.refunds(user_id,date);
create index refunds_expense on public.refunds(user_id,expense_id);

-- Serialize refund and expense modifications on the parent expense row.
create function private.validate_refund() returns trigger
language plpgsql set search_path = '' as $$
declare purchase public.expenses; total numeric;
begin
  if TG_OP = 'UPDATE' and (new.expense_id <> old.expense_id or new.user_id <> old.user_id) then
    raise exception 'A refund cannot be moved to another expense or owner';
  end if;
  select * into purchase from public.expenses where id = new.expense_id and user_id = new.user_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if new.date < purchase.date then raise exception 'Refund cannot predate the purchase'; end if;
  select coalesce(sum(amount),0) into total from public.refunds where expense_id = new.expense_id and id <> new.id;
  if total + new.amount > purchase.amount then raise exception 'Refunds exceed the purchase amount'; end if;
  return new;
end; $$;
create trigger validate_refund before insert or update on public.refunds for each row execute function private.validate_refund();
create function private.validate_expense_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id then raise exception 'Cannot change owner'; end if;
  if exists(select 1 from public.refunds where expense_id = old.id) then
    if new.category_id <> old.category_id or new.payment_source <> old.payment_source then
      raise exception 'Remove linked refunds before changing category or payment source';
    end if;
    if new.amount < (select sum(amount) from public.refunds where expense_id = old.id) then raise exception 'Purchase amount is below its refunds'; end if;
    if exists(select 1 from public.refunds where expense_id = old.id and date < new.date) then raise exception 'Purchase cannot be dated after a refund'; end if;
  end if;
  return new;
end; $$;
create trigger validate_expense_update before update on public.expenses for each row execute function private.validate_expense_update();

-- Every exposed table checks both ownership and the server-side allowlist.
do $$
declare t text;
begin
  foreach t in array array['user_settings','categories','budget_rules','budget_months','monthly_category_budgets','top_ups','expenses','refunds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_records on public.%I for all to authenticated using ((select public.is_allowed_user()) and user_id = (select auth.uid())) with check ((select public.is_allowed_user()) and user_id = (select auth.uid()))',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end; $$;
grant insert, update, delete on public.categories, public.top_ups, public.expenses, public.refunds to authenticated;
-- Settings, default rules, and month snapshots are written only through the atomic plan RPC.

create function public.save_budget_plan(p_salary numeric, p_allocations jsonb, p_opening_credit numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); item jsonb; category uuid; kind text; val numeric; amount numeric; total numeric := 0;
  month_id uuid; this_month date := date_trunc('month', now() at time zone 'Europe/Bucharest')::date;
  item_count integer; seen uuid[] := '{}'; difference numeric;
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_salary is null or p_salary <= 0 or p_salary <> round(p_salary,2) then raise exception 'Salary must be positive, with at most two decimals'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 or p_allocations is null then raise exception 'Provide category allocations'; end if;
  item_count := jsonb_array_length(p_allocations);
  -- Validate the unrounded allocation total first; only a rounding remainder may be adjusted.
  for item in select * from jsonb_array_elements(p_allocations) loop
    category := (item->>'category_id')::uuid; kind := item->>'allocation_type'; val := (item->>'allocation_value')::numeric;
    if category is null or category = any(seen) or not exists(select 1 from public.categories where id = category and user_id = uid and not is_archived) then raise exception 'Invalid or duplicate category'; end if;
    seen := array_append(seen,category);
    if kind is null or kind not in ('percentage','fixed') or val is null or val <= 0 or val <> round(val,4) or (kind = 'percentage' and val > 100) or (kind = 'fixed' and val <> round(val,2)) then raise exception 'Invalid allocation'; end if;
    total := total + case when kind = 'percentage' then p_salary * val / 100 else val end;
  end loop;
  if abs(total - p_salary) > 0.000001 then raise exception 'Allocations must equal the full salary'; end if;
  insert into public.user_settings(user_id,salary,opening_flying_blue_credit)
    values(uid,p_salary,coalesce(p_opening_credit,0))
    on conflict(user_id) do update set salary = excluded.salary, opening_flying_blue_credit = coalesce(p_opening_credit,public.user_settings.opening_flying_blue_credit);
  insert into public.budget_months(user_id,month,salary_snapshot) values(uid,this_month,p_salary)
    on conflict(user_id,month) do update set salary_snapshot = excluded.salary_snapshot returning id into month_id;
  -- Do not remove the budget of a category with activity in the current month.
  if exists(select 1 from public.expenses e where e.user_id = uid and not(e.category_id = any(seen)) and e.date >= this_month and e.date < (this_month + interval '1 month'))
    or exists(select 1 from public.refunds r join public.expenses e on e.id = r.expense_id where r.user_id = uid and not(e.category_id = any(seen)) and r.date >= this_month and r.date < (this_month + interval '1 month'))
    then raise exception 'Keep categories with current-month activity in the plan'; end if;
  delete from public.budget_rules where user_id = uid;
  delete from public.monthly_category_budgets where budget_month_id = month_id;
  total := 0;
  for item in select * from jsonb_array_elements(p_allocations) loop
    category := (item->>'category_id')::uuid; kind := item->>'allocation_type'; val := (item->>'allocation_value')::numeric;
    amount := round(case when kind = 'percentage' then p_salary * val / 100 else val end,2);
    total := total + amount;
    insert into public.budget_rules(user_id,category_id,allocation_type,allocation_value) values(uid,category,kind,val);
    insert into public.monthly_category_budgets(user_id,budget_month_id,category_id,allocation_type,allocation_value,budget_amount) values(uid,month_id,category,kind,val,amount);
  end loop;
  difference := p_salary - total;
  -- Apply cent rounding to the largest category, deterministically.
  update public.monthly_category_budgets set budget_amount = budget_amount + difference
    where id = (select id from public.monthly_category_budgets where budget_month_id = month_id order by budget_amount desc,category_id limit 1);
end; $$;

create function public.ensure_current_month() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); saved_salary numeric; allocations jsonb;
  this_month date := date_trunc('month',now() at time zone 'Europe/Bucharest')::date;
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.budget_months where user_id = uid and month = this_month) then return; end if;
  select salary into saved_salary from public.user_settings where user_id = uid;
  if not found then return; end if;
  select jsonb_agg(jsonb_build_object('category_id',category_id,'allocation_type',allocation_type,'allocation_value',allocation_value)) into allocations from public.budget_rules where user_id = uid;
  perform public.save_budget_plan(saved_salary,allocations);
end; $$;
revoke all on function public.save_budget_plan(numeric,jsonb,numeric), public.ensure_current_month() from public;
grant execute on function public.save_budget_plan(numeric,jsonb,numeric), public.ensure_current_month() to authenticated;

-- Security-invoker views retain the underlying tables' RLS restrictions.
create view public.flying_blue_summary with (security_invoker = true) as
select s.user_id, s.opening_flying_blue_credit
 + coalesce((select sum(t.amount) from public.top_ups t where t.user_id = s.user_id),0)
 - coalesce((select sum(e.amount) from public.expenses e where e.user_id = s.user_id and e.payment_source = 'flying_blue'),0)
 + coalesce((select sum(r.amount) from public.refunds r where r.user_id = s.user_id and r.destination = 'flying_blue'),0) as available_credit
from public.user_settings s;
create view public.category_budget_summary with (security_invoker = true) as
select b.user_id,m.month,b.category_id,c.name as category_name,b.budget_amount,
 coalesce(e.spent,0) - coalesce(r.refunded,0) as net_spent,
 b.budget_amount - coalesce(e.spent,0) + coalesce(r.refunded,0) as remaining
from public.monthly_category_budgets b
join public.budget_months m on m.id = b.budget_month_id
join public.categories c on c.id = b.category_id
left join lateral (select sum(amount) as spent from public.expenses where user_id = b.user_id and category_id = b.category_id and date >= m.month and date < m.month + interval '1 month') e on true
left join lateral (select sum(ref.amount) as refunded from public.refunds ref join public.expenses ex on ex.id = ref.expense_id where ref.user_id = b.user_id and ex.category_id = b.category_id and ref.date >= m.month and ref.date < m.month + interval '1 month') r on true;
revoke all on public.flying_blue_summary,public.category_budget_summary from anon;
grant select on public.flying_blue_summary,public.category_budget_summary to authenticated;
commit;
