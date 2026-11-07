export type AllocationType = 'percentage' | 'fixed';
export interface AllocationRow { key: string; categoryId?: string; name: string; type: AllocationType; value: string }
const SCALE = 1_000_000n;
export function decimalUnits(raw: string, decimals: number): bigint | null {
  const text = raw.trim().replace(',', '.');
  if (!new RegExp(`^\\d{1,12}(?:\\.\\d{0,${decimals}})?$`).test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
}
export function decimalNumber(raw: string) { return Number(raw.trim().replace(',', '.')); }
export function allocationNumerator(salaryCents: bigint, row: AllocationRow): bigint | null {
  const units = decimalUnits(row.value, row.type === 'fixed' ? 2 : 4);
  if (units === null || units <= 0n || (row.type === 'percentage' && units > SCALE)) return null;
  return row.type === 'fixed' ? units * SCALE : salaryCents * units;
}
export function analyzePlan(salary: string, rows: AllocationRow[]) {
  const salaryCents = decimalUnits(salary, 2);
  const salaryValid = salaryCents !== null && salaryCents > 0n && salaryCents <= 99_999_999_999_999n;
  let allocated = 0n;
  let valuesValid = true;
  for (const row of rows) {
    const amount = allocationNumerator(salaryCents ?? 0n, row);
    if (amount === null) valuesValid = false;
    else allocated += amount;
  }
  const difference = (salaryCents ?? 0n) * SCALE - allocated;
  const names = rows.map(r => r.name.trim().toLocaleLowerCase());
  const namesValid = names.every(name => name.length > 0 && name.length <= 80) && new Set(names).size === names.length;
  // Match the database's tolerance of 0.000001 lei; do not hide unallocated fractions by rounding to cents.
  const fullyAllocated = difference >= -100n && difference <= 100n;
  return { salaryValid, valuesValid, namesValid, fullyAllocated, valid: salaryValid && valuesValid && namesValid && rows.length > 0 && fullyAllocated,
    salary: Number(salaryCents ?? 0n) / 100, allocated: Number(allocated) / Number(SCALE) / 100, difference: Number(difference) / Number(SCALE) / 100 };
}
export function previewAllocation(salary: string, row: AllocationRow) {
  const cents = decimalUnits(salary, 2) ?? 0n;
  const amount = allocationNumerator(cents, row);
  const value = amount === null ? 0 : Number(amount) / Number(SCALE) / 100;
  return { amount: value, percentage: cents > 0n ? value / (Number(cents) / 100) * 100 : 0 };
}
