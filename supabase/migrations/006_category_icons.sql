-- Run after migrations 001–005. Saves category icons with the salary plan.
begin;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='icon') then
    alter table public.categories add column icon text not null default 'wallet'
      constraint categories_icon_check check(icon in ('wallet','receipt','fuel','savings','groceries','food','home','car','travel','health','education','gifts','entertainment','clothing','phone','work','fitness','coffee','pets','other'));
    update public.categories set icon=case lower(trim(name))
      when 'expenses' then 'receipt' when 'cheltuieli' then 'receipt'
      when 'gas' then 'fuel' when 'fuel' then 'fuel'
      when 'savings' then 'savings' else 'wallet' end;
  end if;
end; $$;
create or replace function public.save_salary_setup(
  p_salary numeric,
  p_allocations jsonb,
  p_opening_credit numeric default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid(); item jsonb; category uuid; category_name text; category_icon text;
  allocations jsonb := '[]'::jsonb; names text[] := '{}'; position integer := 0;
begin
  if not public.is_allowed_user() then raise exception 'Access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then raise exception 'Provide category allocations'; end if;
  if jsonb_array_length(p_allocations) = 0 then raise exception 'Provide category allocations'; end if;
  if p_opening_credit is not null and p_opening_credit <> round(p_opening_credit,2) then raise exception 'Starting credit must have at most two decimals'; end if;
  for item in select * from jsonb_array_elements(p_allocations) loop
    category := nullif(item->>'category_id','')::uuid;
    category_name := trim(item->>'name');
    if category_name is null or length(category_name) not between 1 and 80 then raise exception 'Each category needs a name of 1 to 80 characters'; end if;
    if lower(category_name) = any(names) then raise exception 'Category names must be unique'; end if;
    names := array_append(names,lower(category_name));
    category_icon := item->>'icon';
    if item ? 'icon' and (category_icon is null or not (category_icon = any(array['wallet','receipt','fuel','savings','groceries','food','home','car','travel','health','education','gifts','entertainment','clothing','phone','work','fitness','coffee','pets','other']))) then raise exception 'Choose a supported category icon'; end if;
    if category is null then
      -- Reuse an existing unused category when its name is entered again.
      select id into category from public.categories where user_id = uid and lower(name) = lower(category_name) order by created_at,id limit 1;
      if category is null then
        insert into public.categories(user_id,name,sort_order) values(uid,category_name,position) returning id into category;
      end if;
    end if;
    update public.categories set icon = coalesce(category_icon,icon), name = category_name, sort_order = position, is_archived = false where user_id = uid and id = category;
    if not found then raise exception 'Category does not belong to this account'; end if;
    allocations := allocations || jsonb_build_array(jsonb_build_object('category_id',category,'allocation_type',item->>'allocation_type','allocation_value',item->'allocation_value'));
    position := position + 1;
  end loop;
  perform public.save_budget_plan(p_salary,allocations,p_opening_credit);
end; $$;
revoke all on function public.save_salary_setup(numeric,jsonb,numeric) from public;
grant execute on function public.save_salary_setup(numeric,jsonb,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
