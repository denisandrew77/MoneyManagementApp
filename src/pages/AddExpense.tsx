import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Plane, WalletCards } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { AppShell } from '../components/AppShell';
import { useAppUpdates } from '../components/AppUpdates';
import { useAuth } from '../components/AuthProvider';
import { loadDashboard, type DashboardData } from '../lib/dashboard';
import { currentMonth, money, todayInBucharest } from '../lib/format';
import { expensePreview, saveExpense, type PaymentSource } from '../lib/expenses';
export function AddExpense() {
  const { session } = useAuth();
  const query = useQuery({ queryKey: ['dashboard', session?.user.id, currentMonth()], queryFn: loadDashboard });
  return <AppShell><main className="dashboard expense-page"><h1 className="expense-title">Add expense</h1>
    {query.isPending ? <div className="empty-panel" role="status">Loading your budgets…</div> : query.isError && !query.data ? <div className="empty-panel"><p role="alert">{query.error.message}</p><button className="primary-button" onClick={() => query.refetch()}>Try again</button></div> : !query.data.hasSettings || !query.data.categories.length ? <div className="empty-panel"><h2>Give your salary a plan first.</h2><p>Set your salary and category budgets before recording an expense.</p><Link className="primary-button inline-button" to="/budget">Set up salary & budgets</Link></div> : <ExpenseForm data={query.data}/>}
  </main></AppShell>;
}
function ExpenseForm({ data }: { data: DashboardData }) {
  const queryClient = useQueryClient();
  const { setUpdateBlocked } = useAppUpdates();
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('flying_blue');
  const [date, setDate] = useState(todayInBucharest);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const requestId = useRef<string | null>(null);
  const [result, setResult] = useState<{ remaining: number; category: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const category = data.categories.find(c => c.id === categoryId);
  const preview = expensePreview(amount, category?.remaining ?? 0);
  const valid = preview.valid && !!category && date >= currentMonth() && date <= todayInBucharest();
  useEffect(() => { setUpdateBlocked(dirty || busy); return () => setUpdateBlocked(false); }, [dirty, busy, setUpdateBlocked]);
  function changed() { setDirty(true); setError(null); }
  function newExpense() {
    requestId.current = null; setResult(null); setAmount(''); setDate(todayInBucharest()); setDirty(false); setError(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!valid || saving.current || result) return;
    saving.current = true; setBusy(true); setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const saved = await saveExpense({ id: requestId.current, amount, categoryId, paymentSource, date, description: '' });
      setResult({ remaining: saved.remaining, category: category!.name }); setDirty(false);
      // Show confirmed success before fetching fresh totals; a refresh failure is not a failed save.
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save this expense. Please try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  if (result) return <section className="white-panel expense-confirmation"><span className="confirmation-icon"><Check size={30}/></span><h2>Expense saved.</h2><p>{money(preview.amount)} paid from {paymentSource === 'personal' ? 'Personal' : 'Flying Blue'}, assigned to {result.category}.</p><div className={result.remaining < 0 ? 'expense-warning' : 'save-success'}><strong>{money(result.remaining)} remaining in {result.category}.</strong>{result.remaining < 0 && <p>This shortfall will reduce next month’s allowance for this category.</p>}</div><div className="expense-actions"><button type="button" className="primary-button" onClick={newExpense}>Add another expense</button><Link to="/" className="setup-link">View overview →</Link></div></section>;
  return <form onSubmit={submit} aria-busy={busy} className="expense-form">
    <fieldset className="budget-fieldset" disabled={busy}>
      <div className="budget-editor">
        <section className="white-panel expense-fields" aria-label="Expense details">
          <div className="expense-input-row">
            <div className="expense-field">
              <label className="field-label" htmlFor="expense-amount">Amount (lei)</label>
              <div className="input-suffix salary-input"><input id="expense-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => { changed(); setAmount(e.target.value); }} required/><span>lei</span></div>
            </div>
            <div className="expense-field">
              <label className="field-label" htmlFor="expense-date">Date</label>
              <input className="text-input" id="expense-date" type="date" min={currentMonth()} max={todayInBucharest()} value={date} onChange={e => { changed(); setDate(e.target.value); }} required/>
            </div>
          </div>
          <div className="expense-field">
            <label className="field-label" htmlFor="expense-category">Category</label>
            <select className="text-input" id="expense-category" value={categoryId} onChange={e => { changed(); setCategoryId(e.target.value); }} required><option value="" disabled>Choose a category</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name} · {money(c.remaining)} left</option>)}</select>
          </div>
          <div className="expense-field">
            <span className="field-label" id="payment-label">Paid from</span>
            <div className="account-options" role="radiogroup" aria-labelledby="payment-label">
              <label className={paymentSource === 'personal' ? 'selected' : ''}><input type="radio" name="payment-source" value="personal" checked={paymentSource === 'personal'} onChange={() => { changed(); setPaymentSource('personal'); }}/><WalletCards size={20}/><span>Personal</span></label>
              <label className={paymentSource === 'flying_blue' ? 'selected' : ''}><input type="radio" name="payment-source" value="flying_blue" checked={paymentSource === 'flying_blue'} onChange={() => { changed(); setPaymentSource('flying_blue'); }}/><Plane size={20}/><span>Flying Blue</span></label>
            </div>
          </div>
        </section>
        <aside className="plan-summary expense-summary" aria-live="polite">
          <div className="expense-balance-preview">
            <div><span className="eyebrow category-caption">{category && <CategoryIcon name={category.icon} size={16}/>}AFTER THIS PURCHASE</span><p>{category ? `${category.name} remaining` : 'Choose a category'}</p></div>
            <strong className={category && preview.after < 0 ? 'negative-text' : ''}>{category ? money(preview.after) : '—'}</strong>
          </div>
          {paymentSource === 'flying_blue' && <div className="expense-credit-preview"><span>Flying Blue remaining</span><strong className={data.credit - preview.amount < 0 ? 'negative-text' : ''}>{money(data.credit - preview.amount)}</strong></div>}
          {category && preview.overBudget && <div className="expense-warning" role="status"><AlertTriangle size={18}/><p>Over budget by {money(Math.abs(preview.after))}. You can still save; this shortfall reduces next month’s allowance.</p></div>}
        </aside>
      </div>
      {error && <div role="alert" className="notice error">{error}</div>}
      <div className="budget-save-bar"><button className="primary-button" disabled={!valid || busy} type="submit">{busy ? 'Saving expense…' : preview.overBudget ? 'Save expense anyway' : 'Save expense'}</button></div>
    </fieldset>
  </form>;
}
