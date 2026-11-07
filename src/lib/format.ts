export const money = (value: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(value);
export function currentMonth() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-01`;
}
