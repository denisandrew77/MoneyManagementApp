-- Run after migrations 001–006. Safe to re-run.
-- Every category carries its full remaining balance, including positive surplus.
-- Existing month allowances/transactions are unchanged; derived balances recalculate
-- from the earliest recorded category budget, including past positive leftovers.
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
  -- without this category assigns it zero; its full carried balance is still retained.
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
    (v.budget_amount+p.remaining-v.net_spent)::numeric,
    p.remaining::numeric,v.is_allocated
  from balances p join monthly_values v on v.user_id=p.user_id and v.category_id=p.category_id and v.month=(p.month+interval '1 month')::date
)
select b.user_id,b.month,b.category_id,c.name as category_name,b.budget_amount::numeric(14,2) as budget_amount,b.net_spent,b.remaining,
  b.carry_in,(b.budget_amount+b.carry_in)::numeric as available_budget
from balances b join public.categories c on c.id=b.category_id and c.user_id=b.user_id
where b.is_allocated or b.carry_in<>0 or b.net_spent<>0;
grant select on public.category_budget_summary to authenticated;

notify pgrst,'reload schema';
commit;
