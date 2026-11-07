-- Run after migrations 001 and 002. Safe to re-run.
-- Only negative category balances roll forward. Unused positive allowance resets.
begin;
create or replace view public.category_budget_summary with (security_invoker = true) as
with recursive
category_starts as (
  select b.user_id,b.category_id,min(m.month) as first_month
  from public.monthly_category_budgets b join public.budget_months m on m.id=b.budget_month_id
  group by b.user_id,b.category_id
),
monthly_spending as (
  select user_id,category_id,date_trunc('month',date)::date as month,sum(amount) as spent
  from public.expenses group by user_id,category_id,date_trunc('month',date)::date
),
monthly_refunds as (
  select r.user_id,e.category_id,date_trunc('month',r.date)::date as month,sum(r.amount) as refunded
  from public.refunds r join public.expenses e on e.id=r.expense_id and e.user_id=r.user_id
  group by r.user_id,e.category_id,date_trunc('month',r.date)::date
),
monthly_values as (
  select c.user_id,c.category_id,g.month::date as month,c.first_month,
    coalesce(b.budget_amount,0)::numeric as budget_amount,
    (coalesce(e.spent,0)-coalesce(r.refunded,0))::numeric as net_spent,
    b.id is not null as is_allocated
  from category_starts c
  cross join lateral generate_series(c.first_month,
    greatest(date_trunc('month',now() at time zone 'Europe/Bucharest')::date,
      (select max(month) from public.budget_months where user_id=c.user_id)),interval '1 month') g(month)
  -- For unopened months, use the most recent saved plan. An explicitly saved plan
  -- without this category assigns it zero; its outstanding deficit is still retained.
  left join lateral (select id from public.budget_months where user_id=c.user_id and month<=g.month::date order by month desc limit 1) m on true
  left join public.monthly_category_budgets b on b.user_id=c.user_id and b.category_id=c.category_id and b.budget_month_id=m.id
  left join monthly_spending e on e.user_id=c.user_id and e.category_id=c.category_id and e.month=g.month::date
  left join monthly_refunds r on r.user_id=c.user_id and r.category_id=c.category_id and r.month=g.month::date
),
balances(user_id,category_id,month,budget_amount,net_spent,remaining,carry_in,is_allocated) as (
  select user_id,category_id,month,budget_amount,net_spent,
    (budget_amount-net_spent)::numeric,0::numeric,is_allocated
  from monthly_values where month=first_month
  union all
  select v.user_id,v.category_id,v.month,v.budget_amount,v.net_spent,
    (v.budget_amount+least(p.remaining,0)-v.net_spent)::numeric,
    least(p.remaining,0)::numeric,v.is_allocated
  from balances p join monthly_values v on v.user_id=p.user_id and v.category_id=p.category_id and v.month=(p.month+interval '1 month')::date
)
select b.user_id,b.month,b.category_id,c.name as category_name,b.budget_amount::numeric(14,2) as budget_amount,b.net_spent,b.remaining,
  b.carry_in,(b.budget_amount+b.carry_in)::numeric as available_budget
from balances b join public.categories c on c.id=b.category_id and c.user_id=b.user_id
where b.is_allocated or b.carry_in<0 or b.net_spent<>0;
grant select on public.category_budget_summary to authenticated;

-- Idempotent expense creation: a retried request with the same ID cannot double-charge.
-- RLS applies to every read/write; overspending is deliberately allowed.
create or replace function public.save_expense(
  p_expense_id uuid,p_amount numeric,p_category_id uuid,p_payment_source text,p_date date,p_description text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid:=auth.uid(); existing public.expenses;
  this_month date:=date_trunc('month',now() at time zone 'Europe/Bucharest')::date;
  today date:=(now() at time zone 'Europe/Bucharest')::date;
  category_remaining numeric; clean_description text:=nullif(trim(p_description),'');
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_expense_id is null or p_amount is null or p_amount::text='NaN' or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Enter a positive amount with at most two decimals'; end if;
  if p_payment_source is null or p_payment_source not in ('personal','flying_blue') then raise exception 'Choose Personal or Flying Blue'; end if;
  if p_date is null or p_date<this_month or p_date>today then raise exception 'Choose a date in the current month, up to today'; end if;
  if length(clean_description)>1000 then raise exception 'Description is too long'; end if;
  perform public.ensure_current_month();
  if not exists(select 1 from public.category_budget_summary where user_id=uid and month=this_month and category_id=p_category_id) then raise exception 'Set up a budget for this category first'; end if;
  select * into existing from public.expenses where id=p_expense_id and user_id=uid;
  if found then
    if existing.amount<>p_amount or existing.category_id<>p_category_id or existing.payment_source<>p_payment_source or existing.date<>p_date or existing.description is distinct from clean_description then
      raise exception 'This expense was already saved with different details. Start a new expense';
    end if;
  else
    insert into public.expenses(id,user_id,amount,category_id,payment_source,date,description)
    values(p_expense_id,uid,p_amount,p_category_id,p_payment_source,p_date,clean_description);
  end if;
  select remaining into category_remaining from public.category_budget_summary where user_id=uid and month=this_month and category_id=p_category_id;
  return jsonb_build_object('expense_id',p_expense_id,'remaining',category_remaining,'over_budget',category_remaining<0);
end; $$;
revoke all on function public.save_expense(uuid,numeric,uuid,text,date,text) from public;
grant execute on function public.save_expense(uuid,numeric,uuid,text,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
