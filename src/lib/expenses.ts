import { supabase } from './supabase';
import { decimalNumber, decimalUnits } from './budget';
export type PaymentSource = 'personal' | 'flying_blue';
export function expensePreview(amount: string, remaining: number) {
  const units = decimalUnits(amount, 2);
  const valid = units !== null && units > 0n && units <= 99_999_999_999_999n;
  const amountCents = valid ? Number(units) : 0;
  const afterCents = Math.round(remaining * 100) - amountCents;
  return { valid, amount: amountCents / 100, after: afterCents / 100, overBudget: valid && afterCents < 0 };
}
export interface ExpenseInput { id: string; amount: string; categoryId: string; paymentSource: PaymentSource; date: string; description: string }
export async function saveExpense(input: ExpenseInput): Promise<{ remaining: number; overBudget: boolean }> {
  const { data, error } = await supabase!.rpc('save_expense', {
    p_expense_id: input.id, p_amount: decimalNumber(input.amount), p_category_id: input.categoryId,
    p_payment_source: input.paymentSource, p_date: input.date, p_description: input.description.trim() || null,
  });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Expense setup is missing. Run supabase/migrations/003_expenses_and_budget_carryover.sql in Supabase SQL Editor, then try again.');
    throw new Error(error.message);
  }
  return { remaining: Number(data.remaining), overBudget: Boolean(data.over_budget) };
}
