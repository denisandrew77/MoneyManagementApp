import { supabase } from './supabase';
import { decimalNumber, decimalUnits } from './budget';
export function topUpPreview(raw: string, credit: number) {
  const cents = decimalUnits(raw, 2);
  const valid = cents !== null && cents > 0n && cents <= 99_999_999_999_999n;
  const amountCents = valid ? Number(cents) : 0;
  return { valid, amount: amountCents / 100, after: (Math.round(credit * 100) + amountCents) / 100 };
}
export async function saveTopUp(id: string, amount: string, date: string) {
  const { data, error } = await supabase!.rpc('save_top_up', { p_top_up_id: id, p_amount: decimalNumber(amount), p_date: date });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Top-up setup is missing. Run supabase/migrations/004_flying_blue_top_ups.sql in Supabase SQL Editor, then try again.');
    throw new Error(error.message);
  }
  return Number(data.available_credit);
}
