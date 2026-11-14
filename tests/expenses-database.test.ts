import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const gas = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const retired = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const firstPurchase = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const month = "date_trunc('month',now() at time zone 'Europe/Bucharest')::date";
const today = "(now() at time zone 'Europe/Bucharest')::date";
async function signIn(id=owner,email='owner@example.com') {
  await db.exec(`reset role; select set_config('request.jwt.claims','${JSON.stringify({sub:id,email})}',false); set role authenticated;`);
}
async function value(sql: string) { return Number((await db.query<{ value: string }>(sql)).rows[0].value); }
async function balance(category: string, offset=0, column='remaining') {
  return value(`select ${column} as value from public.category_budget_summary where category_id='${category}' and month=(${month}+interval '${offset} month')::date`);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema public,auth to authenticated,anon; grant execute on all functions in schema auth to authenticated,anon;
    insert into auth.users values('${owner}'),('${outsider}');`);
  for (const migration of ['001_initial_schema.sql','002_salary_setup.sql','003_expenses_and_budget_carryover.sql','004_flying_blue_top_ups.sql','007_positive_budget_carryover.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
  }
  await db.exec(`insert into private.allowed_emails values('owner@example.com'),('other@example.com');
    insert into public.user_settings(user_id,salary) values('${owner}',1000);
    insert into public.categories(id,user_id,name) values('${gas}','${owner}','Gas'),('${other}','${owner}','Other'),('${retired}','${owner}','Retired');
    insert into public.budget_months(user_id,month,salary_snapshot) select '${owner}',(${month}+n*interval '1 month')::date,1000 from (values(-3),(-1),(0)) offsets(n);
    insert into public.monthly_category_budgets(user_id,budget_month_id,category_id,allocation_type,allocation_value,budget_amount)
      select '${owner}',m.id,c.id,'fixed',500,500 from public.budget_months m cross join public.categories c where c.id in ('${gas}','${other}');
    insert into public.monthly_category_budgets(user_id,budget_month_id,category_id,allocation_type,allocation_value,budget_amount)
      select '${owner}',id,'${retired}','fixed',200,200 from public.budget_months where month=(${month}-interval '3 months')::date;
    insert into public.expenses(id,user_id,category_id,amount,date,payment_source) values
      ('${firstPurchase}','${owner}','${gas}',1300,(${month}-interval '3 months')::date,'personal'),
      (gen_random_uuid(),'${owner}','${gas}',600,(${month}-interval '1 month')::date,'personal'),
      (gen_random_uuid(),'${owner}','${other}',100,(${month}-interval '3 months')::date,'personal'),
      (gen_random_uuid(),'${owner}','${retired}',450,(${month}-interval '3 months')::date,'personal');`);
  await signIn();
},30000);
afterAll(() => db.close());
describe('Expense creation and full category carryover', () => {
  it('carries deficits and positive surplus, including unopened months',async () => {
    expect(await balance(gas,-3)).toBe(-800);
    expect(await balance(gas,-2)).toBe(-300);
    expect(await balance(gas,-1)).toBe(-400);
    expect(await balance(gas)).toBe(100);
    expect(await balance(gas,0,'carry_in')).toBe(-400);
    expect(await balance(other,-3)).toBe(400);
    expect(await balance(other,-2)).toBe(900);
    expect(await balance(other)).toBe(1900);
    expect(await balance(other,0,'carry_in')).toBe(1400);
  });
  it('keeps outstanding debt even when a category is removed from later plans',async () => {
    expect(await balance(retired,-2)).toBe(-50);
    expect(await balance(retired)).toBe(-50);
    expect(await balance(retired,0,'budget_amount')).toBe(0);
  });
  it('allows an expense beyond the remaining allowance and makes retries idempotent',async () => {
    const id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const sql=`select public.save_expense('${id}',250,'${gas}','flying_blue',${today},'Fuel') as result`;
    const result=(await db.query<{result:{remaining:number;over_budget:boolean}}>(sql)).rows[0].result;
    expect(Number(result.remaining)).toBe(-150); expect(result.over_budget).toBe(true);
    await db.exec(sql);
    expect(await value(`select count(*) as value from public.expenses where id='${id}'`)).toBe(1);
    expect(await balance(gas)).toBe(-150);
    expect(await balance(other)).toBe(1900);
    expect(await balance(other,0,'carry_in')).toBe(1400);
    expect(await value('select available_credit as value from public.flying_blue_summary')).toBe(-250);
    await expect(db.exec(`select public.save_expense('${id}',251,'${gas}','flying_blue',${today},'Fuel')`)).rejects.toThrow(/different details/);
  });
  it('allows further spending while negative and carries the larger deficit into the next month',async () => {
    await db.exec(`select public.save_expense(gen_random_uuid(),50,'${gas}','personal',${today},null)`);
    expect(await balance(gas)).toBe(-200);
    await db.exec('reset role');
    await db.exec(`insert into public.budget_months(user_id,month,salary_snapshot) values('${owner}',(${month}+interval '1 month')::date,1000);
      insert into public.monthly_category_budgets(user_id,budget_month_id,category_id,allocation_type,allocation_value,budget_amount)
      select '${owner}',id,'${gas}','fixed',500,500 from public.budget_months where month=(${month}+interval '1 month')::date;`);
    await signIn();
    expect(await balance(gas,1)).toBe(300);
    expect(await balance(gas,1,'carry_in')).toBe(-200);
    expect(await balance(other,1)).toBe(1900);
    expect(await balance(other,1,'budget_amount')).toBe(0);
    expect(await value(`select sum(remaining) as value from public.category_budget_summary where month=${month}`)).toBe(1650);
  });
  it('applies refunds in their received month and recalculates subsequent debt',async () => {
    await db.exec(`insert into public.refunds(expense_id,amount,date,destination) values('${firstPurchase}',100,${today},'personal')`);
    expect(await balance(gas)).toBe(-100);
    expect(await balance(gas,1)).toBe(400);
    expect(await balance(gas,-1)).toBe(-400);
  });
  it('preserves carry-in when the current salary split is changed and refreshed repeatedly',async () => {
    await db.query('select public.save_budget_plan($1,$2::jsonb)',[1000,JSON.stringify([
      {category_id:gas,allocation_type:'fixed',allocation_value:700},
      {category_id:other,allocation_type:'fixed',allocation_value:300},
    ])]);
    await db.exec('select public.ensure_current_month(); select public.ensure_current_month()');
    expect(await balance(gas,0,'carry_in')).toBe(-400);
    expect(await balance(gas)).toBe(100);
    expect(await balance(gas,1)).toBe(600);
    expect(await balance(gas,-1)).toBe(-400);
    expect(await balance(retired)).toBe(-50);
  });
  it('adds Flying Blue credit without changing category budgets and safely retries top-ups',async () => {
    const beforeGas = await balance(gas);
    const beforeOther = await balance(other);
    const beforeCredit = await value('select available_credit as value from public.flying_blue_summary');
    const id='ffffffff-ffff-4fff-8fff-ffffffffffff';
    await db.exec(`select public.save_top_up('${id}',600,${today}); select public.save_top_up('${id}',600,${today})`);
    expect(await value('select available_credit as value from public.flying_blue_summary')).toBe(beforeCredit+600);
    expect(await value(`select count(*) as value from public.top_ups where id='${id}'`)).toBe(1);
    expect(await balance(gas)).toBe(beforeGas);
    expect(await balance(other)).toBe(beforeOther);
    expect(await value('select salary as value from public.user_settings')).toBe(1000);
    await expect(db.exec(`select public.save_top_up('${id}',601,${today})`)).rejects.toThrow(/different details/);
    await expect(db.exec(`select public.save_top_up(gen_random_uuid(),0,${today})`)).rejects.toThrow(/positive amount/);
    await expect(db.exec(`select public.save_top_up(gen_random_uuid(),1.001,${today})`)).rejects.toThrow(/two decimals/);
    await expect(db.exec(`select public.save_top_up(gen_random_uuid(),1,${today}+1)`)).rejects.toThrow(/earlier date/);
  });
  it('validates amount and date without treating a low budget as an error',async () => {
    await expect(db.exec(`select public.save_expense(gen_random_uuid(),1.001,'${gas}','personal',${today},null)`)).rejects.toThrow(/two decimals/);
    await expect(db.exec(`select public.save_expense(gen_random_uuid(),1,'${gas}','personal',(${month}-interval '1 day')::date,null)`)).rejects.toThrow(/current month/);
    await expect(db.exec(`select public.save_expense(gen_random_uuid(),1,'${gas}','personal',${today}+1,null)`)).rejects.toThrow(/current month/);
  });
  it('protects view results and expense writes across users and unapproved accounts',async () => {
    await signIn(outsider,'other@example.com');
    expect(await value('select count(*) as value from public.category_budget_summary')).toBe(0);
    await expect(db.exec(`select public.save_expense(gen_random_uuid(),1,'${gas}','personal',${today},null)`)).rejects.toThrow(/budget for this category/);
    expect(await value('select count(*) as value from public.top_ups')).toBe(0);
    await expect(db.exec(`select public.save_top_up(gen_random_uuid(),600,${today})`)).rejects.toThrow(/Set up/);
    await signIn(owner,'unapproved@example.com');
    expect(await value('select count(*) as value from public.category_budget_summary')).toBe(0);
    await expect(db.exec(`select public.save_expense(gen_random_uuid(),1,'${gas}','personal',${today},null)`)).rejects.toThrow(/Access denied/);
    await expect(db.exec(`select public.save_top_up(gen_random_uuid(),600,${today})`)).rejects.toThrow(/Access denied/);
  });
});
