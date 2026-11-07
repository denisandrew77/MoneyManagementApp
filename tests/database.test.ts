import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const db = new PGlite();
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const catA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const catB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const expense = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const month = "date_trunc('month',now() at time zone 'Europe/Bucharest')::date";
async function asUser(id: string, email: string) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({sub:id,email})}', false); set role authenticated;`);
}
async function scalar(sql: string) { const result = await db.query<{value: string}>(sql); return Number(result.rows[0].value); }
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  grant usage on schema public,auth to authenticated,anon;
  grant execute on all functions in schema auth to authenticated,anon;
  insert into auth.users values('${userA}'),('${userB}');`);
  await db.exec(readFileSync('supabase/migrations/001_initial_schema.sql','utf8'));
  await db.exec("insert into private.allowed_emails values ('owner@example.com'),('other@example.com');");
  await asUser(userA,'owner@example.com');
  await db.exec(`insert into public.categories(id,name) values('${catA}','Expenses'),('${catB}','Gas');`);
  await db.query('select public.save_budget_plan($1,$2::jsonb,$3)', [6000,JSON.stringify([{category_id:catA,allocation_type:'percentage',allocation_value:80},{category_id:catB,allocation_type:'fixed',allocation_value:1200}]),0]);
},30000);
afterAll(() => db.close());
describe('Database business rules and access', () => {
  it('deducts only the selected category and accounts for top-ups separately', async () => {
    await db.exec(`insert into public.top_ups(amount) values(600); insert into public.expenses(id,category_id,amount,payment_source) values('${expense}','${catA}',500,'flying_blue');`);
    expect(await scalar(`select remaining as value from public.category_budget_summary where category_id = '${catA}'`)).toBe(4300);
    expect(await scalar(`select remaining as value from public.category_budget_summary where category_id = '${catB}'`)).toBe(1200);
    expect(await scalar('select available_credit as value from public.flying_blue_summary')).toBe(100);
  });
  it('supports partial refunds and blocks over-refunding',async () => {
    await db.exec(`insert into public.refunds(expense_id,amount,destination) values('${expense}',200,'flying_blue');`);
    expect(await scalar('select available_credit as value from public.flying_blue_summary')).toBe(300);
    expect(await scalar(`select remaining as value from public.category_budget_summary where category_id = '${catA}'`)).toBe(4500);
    await expect(db.exec(`insert into public.refunds(expense_id,amount,destination) values('${expense}',301,'flying_blue')`)).rejects.toThrow(/exceed/);
    await expect(db.exec(`update public.expenses set amount=100 where id='${expense}'`)).rejects.toThrow(/below/);
    await expect(db.exec(`delete from public.expenses where id='${expense}'`)).rejects.toThrow();
  });
  it('allows negative Flying Blue credit and personal expenses leave credit unchanged',async () => {
    await db.exec(`insert into public.expenses(category_id,amount,payment_source) values('${catB}',400,'flying_blue');`);
    expect(await scalar('select available_credit as value from public.flying_blue_summary')).toBe(-100);
    await db.exec(`insert into public.expenses(category_id,amount,payment_source) values('${catB}',50,'personal');`);
    expect(await scalar('select available_credit as value from public.flying_blue_summary')).toBe(-100);
  });
  it('rejects unallocated salary and direct snapshot changes',async () => {
    await expect(db.query('select public.save_budget_plan($1,$2::jsonb)',[6000,JSON.stringify([{category_id:catA,allocation_type:'fixed',allocation_value:1000}])])).rejects.toThrow(/full salary/);
    await expect(db.exec('update public.user_settings set salary=1')).rejects.toThrow(/permission/);
  });
  it('updates only the current month and creates missing current snapshots once',async () => {
    await db.exec('reset role');
    await db.exec(`insert into public.budget_months(user_id,month,salary_snapshot) values('${userA}',(${month} - interval '1 month')::date,5000);`);
    await asUser(userA,'owner@example.com');
    await db.query('select public.save_budget_plan($1,$2::jsonb)',[7000,JSON.stringify([{category_id:catA,allocation_type:'fixed',allocation_value:5600},{category_id:catB,allocation_type:'percentage',allocation_value:20}])]);
    expect(await scalar(`select salary_snapshot as value from public.budget_months where month < ${month}`)).toBe(5000);
    await db.exec('reset role');
    await db.exec(`delete from public.budget_months where user_id = '${userA}' and month = ${month}`);
    await asUser(userA,'owner@example.com');
    await db.exec('select public.ensure_current_month(); select public.ensure_current_month();');
    expect(await scalar(`select count(*) as value from public.budget_months where month = ${month}`)).toBe(1);
  });
  it('permits a final partial refund up to the full purchase amount',async () => {
    await db.exec(`insert into public.refunds(expense_id,amount,destination) values('${expense}',300,'personal');`);
    expect(await scalar('select available_credit as value from public.flying_blue_summary')).toBe(-100);
    await expect(db.exec(`insert into public.refunds(expense_id,amount,destination) values('${expense}',0.01,'personal')`)).rejects.toThrow(/exceed/);
  });
  it('isolates users and forbids cross-user category references',async () => {
    await asUser(userB,'other@example.com');
    expect(await scalar('select count(*) as value from public.expenses')).toBe(0);
    expect(await scalar('select count(*) as value from public.flying_blue_summary')).toBe(0);
    await expect(db.exec(`insert into public.expenses(category_id,amount,payment_source) values('${catA}',10,'personal')`)).rejects.toThrow();
  });
  it('blocks unapproved emails and anonymous reads',async () => {
    await asUser(userA,'unapproved@example.com');
    expect(await scalar('select count(*) as value from public.categories')).toBe(0);
    await expect(db.exec("insert into public.categories(name) values('Unauthorized')")).rejects.toThrow(/row-level/);
    await expect(db.exec('select public.ensure_current_month()')).rejects.toThrow(/Access denied/);
    await db.exec('reset role; set role anon');
    await expect(db.exec('select * from public.expenses')).rejects.toThrow(/permission/);
  });
});
