import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
const db=new PGlite();
const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const category='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const gas='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const purchase='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const currentPurchase='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const topUp='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const refund='ffffffff-ffff-4fff-8fff-ffffffffffff';
const month="date_trunc('month',now() at time zone 'Europe/Bucharest')::date";
const today="(now() at time zone 'Europe/Bucharest')::date";
const previous=`(${month}-interval '1 month')::date`;
async function signIn(id=user,email='owner@example.com') { await db.exec(`reset role;select set_config('request.jwt.claims','${JSON.stringify({sub:id,email})}',false);set role authenticated;`); }
async function scalar(sql:string) {return Number((await db.query<{value:string}>(sql)).rows[0].value);}
async function guard<T>(operation:()=>Promise<T>) {
  await db.exec('savepoint expected_failure');
  try { const result=await operation(); await db.exec('release savepoint expected_failure'); return result; }
  catch(error) { await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure'); throw error; }
}
async function balance(cat=category) {return scalar(`select remaining as value from public.category_budget_summary where month=${month} and category_id='${cat}'`);}
async function credit() {return scalar('select available_credit as value from public.flying_blue_summary');}
async function edit(kind:string,id:string,amount:number,date:string,account:string,cat=category) {
  const table=kind==='expense'?'expenses':kind==='top_up'?'top_ups':'refunds';
  await db.exec(`select public.edit_transaction('${kind}','${id}',(select updated_at from public.${table} where id='${id}'),${amount},${date},'${account}','${cat}')`);
}
async function remove(kind:string,id:string,linked=false) {
  const table=kind==='expense'?'expenses':kind==='top_up'?'top_ups':'refunds';
  await db.exec(`select public.delete_transaction('${kind}','${id}',(select updated_at from public.${table} where id='${id}'),${linked})`);
}
async function refundPartial(amount:number,destination='flying_blue') {await db.exec(`select public.create_refund('${refund}','${purchase}',${amount},false,${today},'${destination}')`);}
beforeAll(async()=>{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;
    insert into auth.users values('${user}'),('${other}');`);
  for(const file of ['001_initial_schema.sql','002_salary_setup.sql','003_expenses_and_budget_carryover.sql','004_flying_blue_top_ups.sql','005_transaction_history_and_refunds.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  await db.exec(`insert into private.allowed_emails values('owner@example.com'),('other@example.com');
    insert into public.user_settings(user_id,salary) values('${user}',1000);
    insert into public.categories(id,user_id,name) values('${category}','${user}','Expenses'),('${gas}','${user}','Gas');
    insert into public.budget_months(user_id,month,salary_snapshot) values('${user}',${previous},1000),('${user}',${month},1000);
    insert into public.monthly_category_budgets(user_id,budget_month_id,category_id,allocation_type,allocation_value,budget_amount)
      select '${user}',id,'${category}','fixed',600,600 from public.budget_months;
    insert into public.monthly_category_budgets(user_id,budget_month_id,category_id,allocation_type,allocation_value,budget_amount)
      select '${user}',id,'${gas}','fixed',400,400 from public.budget_months;
    insert into public.expenses(id,user_id,category_id,amount,date,payment_source) values
      ('${purchase}','${user}','${category}',900,${previous},'flying_blue'),('${currentPurchase}','${user}','${category}',50,${today},'personal');
    insert into public.top_ups(id,user_id,amount,date) values('${topUp}','${user}',1000,${today});`);
  await db.exec(readFileSync('supabase/migrations/006_category_icons.sql','utf8'));
},30000);
beforeEach(async()=>{await db.exec('begin');await signIn();});
afterEach(async()=>{await db.exec('rollback');await db.exec('reset role');});
afterAll(()=>db.close());
describe('History, correction and refund workflows',()=>{
  it('backfills category icons and persists icon changes without changing balances',async()=>{
    expect((await db.query<{icon:string}>(`select icon from public.categories where id='${category}'`)).rows[0].icon).toBe('receipt');
    expect((await db.query<{icon:string}>(`select icon from public.categories where id='${gas}'`)).rows[0].icon).toBe('fuel');
    const allocations=[
      {category_id:category,name:'Expenses',icon:'groceries',allocation_type:'fixed',allocation_value:600},
      {category_id:gas,name:'Gas',icon:'car',allocation_type:'fixed',allocation_value:400},
    ];
    await db.query('select public.save_salary_setup($1,$2::jsonb)',[1000,JSON.stringify(allocations)]);
    expect((await db.query<{icon:string}>(`select icon from public.categories where id='${category}'`)).rows[0].icon).toBe('groceries');
    expect(await balance()).toBe(250);expect(await credit()).toBe(100);
    const withoutIcons=allocations.map(({icon,...row})=>row);
    await db.query('select public.save_salary_setup($1,$2::jsonb)',[1000,JSON.stringify(withoutIcons)]);
    expect((await db.query<{icon:string}>(`select icon from public.categories where id='${category}'`)).rows[0].icon).toBe('groceries');
  });
  it('rejects unsupported icons and rolls category changes back atomically',async()=>{
    const allocations=[
      {category_id:category,name:'Renamed',icon:'home',allocation_type:'fixed',allocation_value:600},
      {category_id:gas,name:'Gas',icon:'invalid-icon',allocation_type:'fixed',allocation_value:400},
    ];
    await expect(guard(()=>db.query('select public.save_salary_setup($1,$2::jsonb)',[1000,JSON.stringify(allocations)]))).rejects.toThrow(/supported category icon/);
    const saved=(await db.query<{name:string;icon:string}>(`select name,icon from public.categories where id='${category}'`)).rows[0];
    expect(saved).toEqual({name:'Expenses',icon:'receipt'});
    await expect(guard(()=>db.exec(`update public.categories set icon='unknown' where id='${category}'`))).rejects.toThrow(/categories_icon_check/);
  });
  it('returns unified records and live refundable totals across months',async()=>{
    await refundPartial(200);
    expect(await scalar('select count(*) as value from public.transaction_history')).toBe(4);
    expect(await scalar(`select remaining_refundable as value from public.transaction_history where id='${purchase}'`)).toBe(700);
    expect(await scalar(`select refund_count as value from public.transaction_history where id='${purchase}'`)).toBe(1);
    expect(await scalar(`select count(*) as value from public.transaction_history where date>=${month}`)).toBe(3);
  });
  it('supports partial then full remaining refund and applies the receiving account correctly',async()=>{
    await refundPartial(200);
    expect(await credit()).toBe(300);expect(await balance()).toBe(450);
    await db.exec(`select public.create_refund(gen_random_uuid(),'${purchase}',null,true,${today},'personal')`);
    expect(await scalar(`select sum(amount) as value from public.refunds where expense_id='${purchase}'`)).toBe(900);
    expect(await balance()).toBe(1150);expect(await credit()).toBe(300);
    await expect(guard(()=>db.exec(`select public.create_refund(gen_random_uuid(),'${purchase}',1,false,${today},'personal')`))).rejects.toThrow(/exceeds/);
  });
  it('makes full-refund retries idempotent and blocks oversized partial refunds',async()=>{
    const sql=`select public.create_refund('${refund}','${purchase}',null,true,${today},'flying_blue')`;
    await db.exec(sql);await db.exec(sql);
    expect(await scalar('select count(*) as value from public.refunds')).toBe(1);
    expect(await credit()).toBe(1000);
  });
  it('recalculates historical category debt and credit when expenses are edited or deleted',async()=>{
    await edit('expense',purchase,1000,previous,'flying_blue');
    expect(await balance()).toBe(150);expect(await credit()).toBe(0);
    await edit('expense',purchase,1000,previous,'personal',gas);
    expect(await balance()).toBe(550);expect(await balance(gas)).toBe(-200);expect(await credit()).toBe(1000);
    await remove('expense',purchase);
    expect(await balance(gas)).toBe(400);expect(await balance()).toBe(550);
  });
  it('edits and deletes top-ups without touching category budgets',async()=>{
    await edit('top_up',topUp,1200,today,'flying_blue');
    expect(await credit()).toBe(300);expect(await balance()).toBe(250);
    await remove('top_up',topUp);expect(await credit()).toBe(-900);expect(await balance()).toBe(250);
  });
  it('edits and deletes refunds and keeps account and category effects consistent',async()=>{
    await refundPartial(200);
    await edit('refund',refund,300,today,'personal');
    expect(await balance()).toBe(550);expect(await credit()).toBe(100);
    await remove('refund',refund);expect(await balance()).toBe(250);expect(await credit()).toBe(100);
  });
  it('requires explicit linked-refund deletion and removes the expense/refunds atomically',async()=>{
    await refundPartial(200);
    await expect(guard(()=>remove('expense',purchase))).rejects.toThrow(/Confirm deletion/);
    expect(await scalar('select count(*) as value from public.refunds')).toBe(1);
    await remove('expense',purchase,true);
    expect(await scalar('select count(*) as value from public.refunds')).toBe(0);
    expect(await balance()).toBe(550);expect(await credit()).toBe(1000);
    await db.exec(`select public.delete_transaction('expense','${purchase}',now(),true)`);
  });
  it('enforces refund bounds, purchase dates and safe expense corrections',async()=>{
    await expect(guard(()=>refundPartial(901))).rejects.toThrow(/exceeds/);
    await refundPartial(200);
    await expect(guard(()=>edit('expense',purchase,100,previous,'flying_blue'))).rejects.toThrow(/below/);
    await expect(guard(()=>edit('expense',purchase,900,previous,'personal'))).rejects.toThrow(/Remove linked/);
    await expect(guard(()=>edit('refund',refund,901,today,'flying_blue'))).rejects.toThrow(/exceed/);
    await expect(guard(()=>edit('refund',refund,200,`(${previous}-1)`,'flying_blue'))).rejects.toThrow(/predate/);
    await expect(guard(()=>edit('top_up',topUp,10,`${today}+1`,'flying_blue'))).rejects.toThrow(/earlier date/);
  });
  it('rejects stale edits and invalidates expense versions when a refund changes',async()=>{
    const original=(await db.query<{version:string}>(`select updated_at::text as version from public.expenses where id='${purchase}'`)).rows[0].version;
    await refundPartial(200);
    await expect(guard(()=>db.query('select public.delete_transaction($1,$2,$3,true)',['expense',purchase,original]))).rejects.toThrow(/record changed/);
    await expect(guard(()=>db.query(`select public.edit_transaction('expense',$1,$2,900,${previous},'flying_blue','${category}')`,[purchase,original]))).rejects.toThrow(/record changed/);
  });
  it('isolates history, parent expenses, corrections and refunds by owner',async()=>{
    await signIn(other,'other@example.com');
    expect(await scalar('select count(*) as value from public.transaction_history')).toBe(0);
    await expect(guard(()=>db.exec(`select public.create_refund(gen_random_uuid(),'${purchase}',100,false,${today},'personal')`))).rejects.toThrow(/not found/);
    await expect(guard(()=>db.exec(`select public.edit_transaction('top_up','${topUp}',now(),50,${today},'flying_blue')`))).rejects.toThrow(/not found/);
    await db.exec(`select public.delete_transaction('expense','${purchase}',now(),true)`);
    await signIn();expect(await scalar(`select count(*) as value from public.expenses where id='${purchase}'`)).toBe(1);
    await signIn(user,'unapproved@example.com');
    expect(await scalar('select count(*) as value from public.transaction_history')).toBe(0);
    await expect(guard(()=>db.exec(`select public.delete_transaction('expense','${purchase}',now(),true)`))).rejects.toThrow(/Access denied/);
    await db.exec('reset role;set role anon');
    await expect(guard(()=>db.exec('select * from public.transaction_history'))).rejects.toThrow(/permission/);
  });
});
