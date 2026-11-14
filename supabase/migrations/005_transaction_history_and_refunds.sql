-- Run after 001–004. Adds history, version-checked editing/deletion, and refunds.
begin;
alter table public.expenses add column if not exists updated_at timestamptz not null default now();
alter table public.top_ups add column if not exists updated_at timestamptz not null default now();
alter table public.refunds add column if not exists updated_at timestamptz not null default now();
create or replace function private.touch_transaction() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=clock_timestamp(); return new; end; $$;
drop trigger if exists touch_transaction on public.expenses;
create trigger touch_transaction before update on public.expenses for each row execute function private.touch_transaction();
drop trigger if exists touch_transaction on public.top_ups;
create trigger touch_transaction before update on public.top_ups for each row execute function private.touch_transaction();
drop trigger if exists touch_transaction on public.refunds;
create trigger touch_transaction before update on public.refunds for each row execute function private.touch_transaction();

-- Refund changes also invalidate a previously opened parent expense.
create or replace function private.touch_refund_expense() returns trigger language plpgsql set search_path='' as $$
begin
  update public.expenses set updated_at=clock_timestamp()
    where id=case when TG_OP='DELETE' then old.expense_id else new.expense_id end
      and user_id=case when TG_OP='DELETE' then old.user_id else new.user_id end;
  return null;
end; $$;
drop trigger if exists touch_refund_expense on public.refunds;
create trigger touch_refund_expense after insert or update or delete on public.refunds for each row execute function private.touch_refund_expense();

create or replace view public.transaction_history with(security_invoker=true) as
with refund_totals as (
  select user_id,expense_id,sum(amount) as refunded_amount,count(*) as refund_count,min(date) as first_refund_date
  from public.refunds group by user_id,expense_id
), purchases as (
  select e.*,c.name as category_name,coalesce(r.refunded_amount,0) as refunded_amount,
    coalesce(r.refund_count,0) as refund_count,r.first_refund_date
  from public.expenses e join public.categories c on c.id=e.category_id and c.user_id=e.user_id
  left join refund_totals r on r.expense_id=e.id and r.user_id=e.user_id
)
select 'expense'::text as kind,e.id,e.user_id,e.date,e.amount,e.payment_source as account,e.category_id,e.category_name,
  e.description,e.created_at,e.updated_at,e.id as expense_id,e.date as expense_date,e.amount as expense_amount,
  e.payment_source as expense_account,e.refunded_amount,(e.amount-e.refunded_amount) as remaining_refundable,e.refund_count,e.first_refund_date
from purchases e
union all
select 'top_up',t.id,t.user_id,t.date,t.amount,'flying_blue',null::uuid,null::text,t.description,t.created_at,t.updated_at,
  null::uuid,null::date,null::numeric,null::text,0::numeric,0::numeric,0::bigint,null::date
from public.top_ups t
union all
select 'refund',r.id,r.user_id,r.date,r.amount,r.destination,e.category_id,e.category_name,r.description,r.created_at,r.updated_at,
  e.id,e.date,e.amount,e.payment_source,e.refunded_amount,(e.amount-e.refunded_amount),e.refund_count,e.first_refund_date
from public.refunds r join purchases e on e.id=r.expense_id and e.user_id=r.user_id;
revoke all on public.transaction_history from anon;
grant select on public.transaction_history to authenticated;

create or replace function public.edit_transaction(
  p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_amount numeric,p_date date,p_account text,
  p_category_id uuid default null,p_description text default null
) returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); version timestamptz; parent uuid;
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_kind is null or p_kind not in ('expense','top_up','refund') then raise exception 'Invalid transaction type'; end if;
  if p_amount is null or p_amount::text='NaN' or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Enter a positive amount with at most two decimals'; end if;
  if p_date is null or p_date>(now() at time zone 'Europe/Bucharest')::date then raise exception 'Choose today or an earlier date'; end if;
  if length(p_description)>1000 then raise exception 'Description is too long'; end if;
  if p_account is null or p_account not in ('personal','flying_blue') then raise exception 'Choose an account'; end if;
  if p_kind='expense' then
    select updated_at into version from public.expenses where user_id=uid and id=p_id for update;
  elsif p_kind='top_up' then
    select updated_at into version from public.top_ups where user_id=uid and id=p_id for update;
  else
    select expense_id into parent from public.refunds where user_id=uid and id=p_id;
    perform 1 from public.expenses where user_id=uid and id=parent for update;
    select updated_at into version from public.refunds where user_id=uid and id=p_id for update;
  end if;
  if version is null then raise exception 'Transaction not found'; end if;
  if p_expected_updated_at is null or version<>p_expected_updated_at then raise exception 'This record changed. Close and reopen it before saving'; end if;
  if p_kind='expense' then
    -- Historical corrections require a category that existed in that month's plan.
    if not exists(select 1 from public.category_budget_summary where user_id=uid and category_id=p_category_id and month=date_trunc('month',p_date)::date) then
      raise exception 'This category has no budget in the selected month';
    end if;
    update public.expenses set amount=p_amount,date=p_date,payment_source=p_account,category_id=p_category_id,description=nullif(trim(p_description),'') where user_id=uid and id=p_id;
  elsif p_kind='top_up' then
    if p_account<>'flying_blue' then raise exception 'Top-ups transfer from Personal to Flying Blue'; end if;
    update public.top_ups set amount=p_amount,date=p_date,description=nullif(trim(p_description),'') where user_id=uid and id=p_id;
  else
    update public.refunds set amount=p_amount,date=p_date,destination=p_account,description=nullif(trim(p_description),'') where user_id=uid and id=p_id;
  end if;
end; $$;

create or replace function public.create_refund(
  p_refund_id uuid,p_expense_id uuid,p_amount numeric,p_full boolean,p_date date,p_destination text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); purchase public.expenses; existing public.refunds; available numeric; refund_amount numeric;
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into purchase from public.expenses where user_id=uid and id=p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if p_refund_id is null or p_full is null then raise exception 'Invalid refund request'; end if;
  if p_destination is null or p_destination not in ('personal','flying_blue') then raise exception 'Choose the account that received the refund'; end if;
  if p_date is null or p_date<purchase.date or p_date>(now() at time zone 'Europe/Bucharest')::date then raise exception 'Refund date must be between the purchase date and today'; end if;
  select * into existing from public.refunds where user_id=uid and id=p_refund_id;
  if found then
    if existing.expense_id<>p_expense_id or existing.destination<>p_destination or existing.date<>p_date or (not p_full and existing.amount is distinct from p_amount) then
      raise exception 'This refund was already saved with different details';
    end if;
    return jsonb_build_object('refund_id',existing.id,'amount',existing.amount);
  end if;
  select purchase.amount-coalesce(sum(amount),0) into available from public.refunds where user_id=uid and expense_id=p_expense_id;
  refund_amount:=case when p_full then available else p_amount end;
  if refund_amount is null or refund_amount::text='NaN' or refund_amount<=0 or refund_amount<>round(refund_amount,2) then raise exception 'Enter a positive refund amount, or this expense is already fully refunded'; end if;
  if refund_amount>available then raise exception 'Refund exceeds the remaining refundable amount (%)',available; end if;
  insert into public.refunds(id,user_id,expense_id,amount,date,destination) values(p_refund_id,uid,p_expense_id,refund_amount,p_date,p_destination);
  return jsonb_build_object('refund_id',p_refund_id,'amount',refund_amount);
end; $$;

create or replace function public.delete_transaction(
  p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_delete_refunds boolean default false
) returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); version timestamptz; parent uuid;
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_kind is null or p_kind not in ('expense','top_up','refund') then raise exception 'Invalid transaction type'; end if;
  if p_kind='expense' then
    select updated_at into version from public.expenses where id=p_id and user_id=uid for update;
  elsif p_kind='top_up' then
    select updated_at into version from public.top_ups where id=p_id and user_id=uid for update;
  else
    select expense_id into parent from public.refunds where id=p_id and user_id=uid;
    perform 1 from public.expenses where id=parent and user_id=uid for update;
    select updated_at into version from public.refunds where id=p_id and user_id=uid for update;
  end if;
  -- A retry after a successful deletion is harmless.
  if version is null then return; end if;
  if p_expected_updated_at is null or version<>p_expected_updated_at then raise exception 'This record changed. Close and reopen it before deleting'; end if;
  if p_kind='expense' then
    if exists(select 1 from public.refunds where user_id=uid and expense_id=p_id) then
      if p_delete_refunds is distinct from true then raise exception 'Confirm deletion of the linked refunds as well'; end if;
      delete from public.refunds where user_id=uid and expense_id=p_id;
    end if;
    delete from public.expenses where user_id=uid and id=p_id;
  elsif p_kind='top_up' then delete from public.top_ups where user_id=uid and id=p_id;
  else delete from public.refunds where user_id=uid and id=p_id;
  end if;
end; $$;
revoke all on function public.edit_transaction(text,uuid,timestamptz,numeric,date,text,uuid,text),
  public.create_refund(uuid,uuid,numeric,boolean,date,text),public.delete_transaction(text,uuid,timestamptz,boolean) from public;
grant execute on function public.edit_transaction(text,uuid,timestamptz,numeric,date,text,uuid,text),
  public.create_refund(uuid,uuid,numeric,boolean,date,text),public.delete_transaction(text,uuid,timestamptz,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
