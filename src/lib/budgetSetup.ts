import { supabase } from './supabase';
import { decimalNumber, type AllocationRow } from './budget';
export interface BudgetSetupData { salary: string; hasSettings: boolean; rows: AllocationRow[] }
export async function loadBudgetSetup(): Promise<BudgetSetupData> {
  const db = supabase!;
  const { data: allowed, error: accessError } = await db.rpc('is_allowed_user');
  if (accessError) throw new Error(accessError.message);
  if (!allowed) throw new Error('This Google account is not on your app’s email allowlist.');
  const [settings, rules, categories] = await Promise.all([
    db.from('user_settings').select('salary').maybeSingle(),
    db.from('budget_rules').select('category_id,allocation_type,allocation_value'),
    db.from('categories').select('id,name,icon,sort_order').order('sort_order').order('created_at'),
  ]);
  for (const response of [settings, rules, categories]) if (response.error) {
    if (['42703','PGRST204'].includes(response.error.code)) throw new Error('Category icons need a database update. Run supabase/migrations/006_category_icons.sql in Supabase SQL Editor.');
    throw new Error(response.error.message);
  }
  const rows: AllocationRow[] = (categories.data ?? []).flatMap(category => {
    const rule = rules.data?.find(rule => rule.category_id === category.id);
    return rule ? [{ key: category.id, categoryId: category.id, name: category.name, icon: category.icon, type: rule.allocation_type, value: String(rule.allocation_value) }] : [];
  });
  return { salary: settings.data ? String(settings.data.salary) : '', hasSettings: !!settings.data, rows: rows.length ? rows : [
    { key: 'initial-expenses', name: 'Expenses', icon: 'receipt', type: 'percentage', value: '50' },
    { key: 'initial-gas', name: 'Gas', icon: 'fuel', type: 'percentage', value: '10' },
    { key: 'initial-savings', name: 'Savings', icon: 'savings', type: 'percentage', value: '40' },
  ] };
}
export async function saveBudgetSetup(salary: string, rows: AllocationRow[], openingCredit?: string) {
  const { error } = await supabase!.rpc('save_salary_setup', {
    p_salary: decimalNumber(salary),
    p_allocations: rows.map(row => ({ category_id: row.categoryId ?? null, name: row.name.trim(), icon: row.icon ?? 'wallet', allocation_type: row.type, allocation_value: decimalNumber(row.value) })),
    p_opening_credit: openingCredit === undefined ? null : decimalNumber(openingCredit || '0'),
  });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('The salary setup database function is missing. Run supabase/migrations/002_salary_setup.sql in Supabase SQL Editor, then try saving again.');
    throw new Error(error.message);
  }
}
