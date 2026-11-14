import { supabase } from './supabase';
import { decimalNumber } from './budget';
export type TransactionKind = 'expense' | 'top_up' | 'refund';
export interface Transaction {
  kind: TransactionKind; id: string; date: string; amount: number; account: 'personal' | 'flying_blue';
  category_id: string | null; category_name: string | null; description: string | null; created_at: string; updated_at: string;
  expense_id: string | null; expense_date: string | null; expense_amount: number | null; expense_account: string | null;
  refunded_amount: number; remaining_refundable: number; refund_count: number; first_refund_date: string | null;
}
export interface HistoryFilters { month: string; kind: string; account: string; category: string }
export const HISTORY_PAGE_SIZE = 30;
function fail(error: { code?: string; message: string }): never {
  if (['PGRST202','PGRST205','42P01'].includes(error.code ?? '')) throw new Error('History setup is missing. Run supabase/migrations/005_transaction_history_and_refunds.sql in Supabase SQL Editor.');
  throw new Error(error.message);
}
export async function loadHistory(filters: HistoryFilters, page: number) {
  let query = supabase!.from('transaction_history').select('*', { count: 'exact' });
  if (filters.month) {
    const start = `${filters.month}-01`;
    const [year, month] = filters.month.split('-').map(Number);
    const end = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2,'0')}-01`;
    query = query.gte('date', start).lt('date', end);
  }
  if (filters.kind) query = query.eq('kind',filters.kind);
  if (filters.account) query = query.or(`account.eq.${filters.account},kind.eq.top_up`);
  if (filters.category) query = query.eq('category_id',filters.category);
  const { data, count, error } = await query.order('date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).order('kind').range(page*HISTORY_PAGE_SIZE,(page+1)*HISTORY_PAGE_SIZE-1);
  if (error) fail(error);
  return { count: count ?? 0, rows: (data ?? []).map(row => ({ ...row, amount:Number(row.amount), expense_amount:row.expense_amount === null ? null : Number(row.expense_amount), refunded_amount:Number(row.refunded_amount), remaining_refundable:Number(row.remaining_refundable), refund_count:Number(row.refund_count) })) as Transaction[] };
}
export async function loadHistoryCategories() {
  const { data, error } = await supabase!.from('categories').select('id,name,icon,is_archived').order('sort_order').order('name');
  if (error) fail(error);
  return data ?? [];
}
export async function editTransaction(row: Transaction, amount: string, date: string, account: string, category: string) {
  const { error } = await supabase!.rpc('edit_transaction', { p_kind:row.kind,p_id:row.id,p_expected_updated_at:row.updated_at,p_amount:decimalNumber(amount),p_date:date,p_account:account,p_category_id:category || null,p_description:row.description });
  if (error) fail(error);
}
export async function deleteTransaction(row: Transaction, deleteRefunds: boolean) {
  const { error } = await supabase!.rpc('delete_transaction', {p_kind:row.kind,p_id:row.id,p_expected_updated_at:row.updated_at,p_delete_refunds:deleteRefunds});
  if (error) fail(error);
}
export async function createRefund(id: string, row: Transaction, amount: string, full: boolean, date: string, destination: string) {
  const { data, error } = await supabase!.rpc('create_refund', {p_refund_id:id,p_expense_id:row.id,p_amount:full ? null : decimalNumber(amount),p_full:full,p_date:date,p_destination:destination});
  if (error) fail(error);
  return Number(data.amount);
}
export const kindLabel = (kind: TransactionKind) => kind === 'expense' ? 'Expense' : kind === 'top_up' ? 'Top-up' : 'Refund';
export const accountLabel = (account: string) => account === 'flying_blue' ? 'Flying Blue' : 'Personal';
