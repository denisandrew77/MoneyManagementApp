import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Plane, WalletCards } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useAppUpdates } from '../components/AppUpdates';
import { useAuth } from '../components/AuthProvider';
import { loadDashboard, type DashboardData } from '../lib/dashboard';
import { currentMonth, money, todayInBucharest } from '../lib/format';
import { saveTopUp, topUpPreview } from '../lib/topUps';
export function TopUp() {
  const { session } = useAuth();
  const query = useQuery({ queryKey: ['dashboard', session?.user.id, currentMonth()], queryFn: loadDashboard });
  return <AppShell><main className="dashboard expense-page top-up-page"><h1 className="expense-title">Top up Flying Blue</h1>
    {query.isPending ? <div className="empty-panel" role="status">Loading your credit…</div> : query.isError && !query.data ? <div className="empty-panel"><p role="alert">{query.error.message}</p><button type="button" className="primary-button" onClick={() => query.refetch()}>Try again</button></div> : !query.data.hasSettings ? <div className="empty-panel"><h2>Set up your account first.</h2><p>Set your salary and any starting Flying Blue credit before adding transfers.</p><Link className="primary-button inline-button" to="/budget">Set up salary & budgets</Link></div> : <TopUpForm data={query.data}/>}
  </main></AppShell>;
}
function TopUpForm({ data }: { data: DashboardData }) {
  const queryClient = useQueryClient();
  const { setUpdateBlocked } = useAppUpdates();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayInBucharest);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ amount: number; credit: number } | null>(null);
  const saving = useRef(false);
  const requestId = useRef<string | null>(null);
  const preview = topUpPreview(amount, data.credit);
  const valid = preview.valid && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayInBucharest();
  useEffect(() => { setUpdateBlocked(dirty || busy); return () => setUpdateBlocked(false); }, [dirty, busy, setUpdateBlocked]);
  function changed() { setDirty(true); setError(null); }
  function reset() { requestId.current = null; setResult(null); setAmount(''); setDate(todayInBucharest()); setDirty(false); setError(null); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!valid || saving.current || result) return;
    saving.current = true; setBusy(true); setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const credit = await saveTopUp(requestId.current, amount, date);
      setResult({ amount: preview.amount, credit }); setDirty(false);
      // A completed transfer remains saved even if the follow-up dashboard fetch fails.
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] }).catch(() => {});
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the top-up. Please try again.'); }
    finally { saving.current = false; setBusy(false); }
  }
  if (result) return <section className="white-panel expense-confirmation"><span className="confirmation-icon"><Check size={30}/></span><h2>Top-up saved.</h2><p>{money(result.amount)} transferred from Personal to Flying Blue.</p><div className="save-success" role="status"><strong>Available Flying Blue credit: {money(result.credit)}</strong></div><div className="expense-actions"><button type="button" className="primary-button" onClick={reset}>Add another top-up</button><Link to="/" className="setup-link">View overview →</Link></div></section>;
  return <form className="expense-form" onSubmit={submit} aria-busy={busy}><fieldset className="budget-fieldset" disabled={busy}><div className="budget-editor">
    <section className="white-panel expense-fields" aria-label="Top-up details"><div className="top-up-transfer"><span><WalletCards size={18}/> Personal</span><ArrowRight size={18}/><span><Plane size={18}/> Flying Blue</span></div>
      <div className="expense-input-row"><div className="expense-field"><label className="field-label" htmlFor="top-up-amount">Amount (lei)</label><div className="input-suffix salary-input"><input id="top-up-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => { changed(); setAmount(e.target.value); }} required/><span>lei</span></div></div>
      <div className="expense-field"><label className="field-label" htmlFor="top-up-date">Transfer date</label><input className="text-input" id="top-up-date" type="date" max={todayInBucharest()} value={date} onChange={e => { changed(); setDate(e.target.value); }} required/></div></div>
      <p className="top-up-note">Record a transfer you’ve already made. This adds credit for spending through Flying Blue across all categories.</p>
    </section>
    <aside className="plan-summary expense-summary" aria-live="polite"><div className="expense-balance-preview"><div><span className="eyebrow">AFTER THIS TOP-UP</span><p>Flying Blue available credit</p></div><strong className={preview.after < 0 ? 'negative-text' : ''}>{money(preview.after)}</strong></div><div className="expense-credit-preview"><span>Available now</span><strong>{money(data.credit)}</strong></div><div className="expense-credit-preview"><span>This top-up</span><strong>+{money(preview.amount)}</strong></div><p className="top-up-note">Salary and category budgets stay the same.</p></aside>
    </div>{error && <div className="notice error" role="alert">{error}</div>}<div className="budget-save-bar"><button type="submit" className="primary-button" disabled={!valid || busy}>{busy ? 'Saving top-up…' : 'Save top-up'}</button></div></fieldset></form>;
}
