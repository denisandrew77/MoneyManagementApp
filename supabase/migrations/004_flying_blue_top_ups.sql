-- Run after migrations 001–003. Safe to re-run.
-- Top-ups increase Flying Blue credit only; no category or salary changes.
begin;
create or replace function public.save_top_up(p_top_up_id uuid,p_amount numeric,p_date date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid:=auth.uid(); existing public.top_ups; credit numeric;
  today date:=(now() at time zone 'Europe/Bucharest')::date;
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_top_up_id is null or p_amount is null or p_amount::text='NaN' or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Enter a positive amount with at most two decimals';
  end if;
  if p_date is null or p_date>today then raise exception 'Choose today or an earlier date'; end if;
  if not exists(select 1 from public.user_settings where user_id=uid) then raise exception 'Set up your salary and starting credit first'; end if;
  select * into existing from public.top_ups where id=p_top_up_id and user_id=uid for update;
  if found then
    if existing.amount<>p_amount or existing.date<>p_date then raise exception 'This top-up was already saved with different details. Start a new top-up'; end if;
  else
    insert into public.top_ups(id,user_id,amount,date) values(p_top_up_id,uid,p_amount,p_date);
  end if;
  select available_credit into credit from public.flying_blue_summary where user_id=uid;
  return jsonb_build_object('top_up_id',p_top_up_id,'available_credit',credit);
end; $$;
revoke all on function public.save_top_up(uuid,numeric,date) from public;
grant execute on function public.save_top_up(uuid,numeric,date) to authenticated;
notify pgrst,'reload schema';
commit;
