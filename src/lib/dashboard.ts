import { supabase } from './supabase';
import { currentMonth } from './format';
export interface DashboardData {
  salary: number; credit: number; topUps: number; spent: number; remaining: number;
  categories: { id: string; name: string; allowance: number; remaining: number; spent: number }[];
  expenses: { id: string; amount: number; date: string; description: string | null; payment_source: string; category_name: string }[];
  hasSettings: boolean;
}
export async function loadDashboard(): Promise<DashboardData> {
  const db = supabase!;
  const access = await db.rpc('is_allowed_user');
  if (access.error) throw new Error(access.error.message);
  if (!access.data) throw new Error('This account does not have access. Add your Google email to the database allowlist.');
  const initialization = await db.rpc('ensure_current_month');
  if (initialization.error) throw new Error(initialization.error.message);
  const month = currentMonth();
  const results = await Promise.all([
    db.from('user_settings').select('*').maybeSingle(),
    db.from('budget_months').select('*').eq('month', month).maybeSingle(),
    db.from('category_budget_summary').select('*').eq('month', month),
    db.from('flying_blue_summary').select('*').maybeSingle(),
    db.from('top_ups').select('amount').gte('date', month).lt('date', nextMonth(month)),
    db.from('expenses').select('id,amount,date,description,payment_source,category_id').gte('date', month).lt('date', nextMonth(month)).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
    db.from('categories').select('id,name'),
  ]);
  for (const result of results) if (result.error) throw new Error(result.error.message);
  const [settings, budgetMonth, budgets, credit, topUps, expenses, categories] = results;
  const rows = budgets.data ?? [];
  const salary = Number(budgetMonth.data?.salary_snapshot ?? settings.data?.salary ?? 0);
  return { salary, hasSettings: !!settings.data, credit: Number(credit.data?.available_credit ?? 0), topUps: (topUps.data ?? []).reduce((s, t) => s + Number(t.amount), 0), spent: rows.reduce((s, r) => s + Number(r.net_spent), 0), remaining: rows.length ? rows.reduce((s, r) => s + Number(r.remaining), 0) : salary,
    categories: rows.map(r => ({ id: r.category_id, name: r.category_name, allowance: Number(r.budget_amount), remaining: Number(r.remaining), spent: Number(r.net_spent) })),
    expenses: (expenses.data ?? []).map(e => ({ ...e, amount: Number(e.amount), category_name: categories.data?.find(c => c.id === e.category_id)?.name ?? 'Category' })),
  };
}
function nextMonth(month: string) { const date = new Date(`${month}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 10); }
