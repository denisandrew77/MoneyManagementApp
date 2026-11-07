import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Plus, Trash2, WalletCards } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../components/AuthProvider';
import { analyzePlan, decimalUnits, previewAllocation, type AllocationRow, type AllocationType } from '../lib/budget';
import { loadBudgetSetup, saveBudgetSetup, type BudgetSetupData } from '../lib/budgetSetup';
import { money } from '../lib/format';
export function BudgetSetup() {
  const { session } = useAuth();
  const query = useQuery({ queryKey: ['salary-setup', session?.user.id], queryFn: loadBudgetSetup });
  return <AppShell><main className="dashboard budget-page"><Link to="/" className="back-link"><ArrowLeft size={16}/> Back to overview</Link><div className="page-heading"><div><span className="eyebrow muted">MAKE A PLAN</span><h1>Salary & budgets<span className="wave">.</span></h1><p>Give every leu a purpose.</p></div></div>
    {query.isPending ? <div className="empty-panel" role="status">Loading your plan…</div> : query.isError ? <div className="empty-panel"><h2>We couldn’t load your plan.</h2><p role="alert">{query.error.message}</p><button className="primary-button" onClick={() => query.refetch()}>Try again</button></div> : <BudgetForm key={session!.user.id} initial={query.data}/>}
  </main></AppShell>;
}
function BudgetForm({ initial }: { initial: BudgetSetupData }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [salary, setSalary] = useState(initial.salary);
  const [rows, setRows] = useState<AllocationRow[]>(initial.rows);
  const [hasSettings, setHasSettings] = useState(initial.hasSettings);
  const [openingCredit, setOpeningCredit] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const analysis = analyzePlan(salary, rows);
  const openingValid = hasSettings || decimalUnits(openingCredit.replace(/^-/, ''), 2) !== null;
  function changed() { setSaved(false); setError(null); }
  function updateRow(key: string, patch: Partial<AllocationRow>) { changed(); setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row)); }
  function switchType(row: AllocationRow, type: AllocationType) {
    if (row.type === type) return;
    const preview = previewAllocation(salary, row);
    updateRow(row.key, { type, value: type === 'fixed' ? preview.amount.toFixed(2) : preview.percentage.toFixed(4).replace(/\.?0+$/, '') || '0' });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!analysis.valid || !openingValid || busy) return;
    setBusy(true); setSaved(false); setError(null);
    try {
      await saveBudgetSetup(salary, rows, hasSettings ? undefined : openingCredit);
      // Mark the write as saved before refreshing; a network error on refresh must not imply it was rolled back.
      setHasSettings(true); setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      try {
        const data = await loadBudgetSetup();
        queryClient.setQueryData(['salary-setup', session!.user.id], data);
        setSalary(data.salary); setRows(data.rows);
      } catch { setError('Your plan was saved, but the refreshed values could not be loaded. Reload this screen before editing again.'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your plan. Please try again.'); }
    finally { setBusy(false); }
  }
  const fineRemainder = Math.abs(analysis.difference) > 0 && Math.abs(analysis.difference) < .01;
  const differenceLabel = fineRemainder ? `${Math.abs(analysis.difference).toFixed(6)} lei` : money(Math.abs(analysis.difference));
  return <form onSubmit={submit} className="budget-form">
    <fieldset disabled={busy} className="budget-fieldset"><div className="budget-editor">
      <div className="budget-fields"><section className="white-panel salary-panel"><div className="section-heading"><h2>01 · Your expected salary</h2><WalletCards size={20}/></div><p className="field-help">Your monthly take-home amount. Update it whenever your salary changes.</p><label className="field-label" htmlFor="salary">Monthly salary</label><div className="input-suffix salary-input"><input autoComplete="off" id="salary" inputMode="decimal" placeholder="6000.00" value={salary} onChange={e => { changed(); setSalary(e.target.value); }} required aria-describedby="salary-help"/><span>lei / month</span></div><p id="salary-help" className="field-help">Used to calculate budgets; this does not record a bank deposit.</p>
      {!hasSettings && <details className="opening-credit"><summary>Already have money on Flying Blue?</summary><label htmlFor="opening-credit" className="field-label">Starting Flying Blue credit (lei)</label><input className="text-input" id="opening-credit" inputMode="decimal" value={openingCredit} onChange={e => { changed(); setOpeningCredit(e.target.value); }}/><p className="field-help">Your existing credit before any top-ups or expenses you’ll enter. Use a negative value if you owe money.</p></details>}</section>
      <section className="white-panel allocations-panel"><div className="section-heading"><h2>02 · Split your salary</h2><span>{rows.length} categories</span></div><p className="field-help">Enter a percentage or a fixed amount for each category. The other value is calculated for you.</p>
        <div className="allocation-list">{rows.map((row, index) => {
          const preview = previewAllocation(salary, row);
          return <div className="allocation-row" key={row.key}><div className="allocation-name"><label className="field-label" htmlFor={`name-${row.key}`}>Category {index + 1}</label><input className="text-input" id={`name-${row.key}`} value={row.name} maxLength={80} placeholder="e.g. Gas" required onChange={e => updateRow(row.key, { name: e.target.value })}/></div>
            <div className="allocation-value"><label className="field-label" htmlFor={`value-${row.key}`}>Allocation</label><div className="allocation-controls"><select aria-label={`Allocation type for ${row.name || `category ${index + 1}`}`} value={row.type} onChange={e => switchType(row, e.target.value as AllocationType)}><option value="percentage">%</option><option value="fixed">lei</option></select><input id={`value-${row.key}`} inputMode="decimal" value={row.value} required onChange={e => updateRow(row.key, { value: e.target.value })} aria-label={`${row.type === 'fixed' ? 'Amount in lei' : 'Percentage'} for ${row.name || `category ${index + 1}`}`}/></div><span className="allocation-preview">{row.type === 'percentage' ? money(preview.amount) : `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(preview.percentage)}% of salary`}</span></div>
            <button className="remove-category" type="button" disabled={rows.length === 1} aria-label={`Remove ${row.name || `category ${index + 1}`}`} onClick={() => { changed(); setRows(current => current.filter(r => r.key !== row.key)); }}><Trash2 size={17}/></button>
          </div>;
        })}</div><button className="add-category" type="button" onClick={() => { changed(); setRows(current => [...current, { key: crypto.randomUUID(), name: '', type: 'percentage', value: '' }]); }}><Plus size={17}/> Add category</button>
      </section></div>
      <aside className="plan-summary"><span className="eyebrow">YOUR MONTHLY PLAN</span><h2>{money(analysis.salary)}</h2><p>expected each month</p><div className="plan-breakdown">{rows.map(row => <div key={row.key}><span>{row.name.trim() || 'New category'}</span><strong>{money(previewAllocation(salary, row).amount)}</strong></div>)}</div><div className="plan-total"><span>Allocated</span><strong>{money(analysis.allocated)}</strong></div><div className={`allocation-status ${analysis.valid ? 'complete' : ''}`} aria-live="polite">{analysis.valid ? <><Check size={17}/> All of your salary has a place.</> : !analysis.salaryValid ? 'Enter your monthly salary to get started.' : !analysis.namesValid ? 'Give each category a unique name.' : !analysis.valuesValid ? 'Enter a positive allocation for every category.' : `${differenceLabel} ${analysis.difference < 0 ? 'over your salary' : 'left to allocate'}.`}</div><p className="plan-note">Saving updates this month and future months. Previous months keep their salary and budget amounts.</p></aside>
    </div>
    {!openingValid && <div className="notice error" role="alert">Enter a valid starting credit, with up to two decimal places.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {saved && <div className="save-success" role="status"><Check size={18}/> Your salary and monthly split are saved. <Link to="/">View overview →</Link></div>}
    <div className="budget-save-bar"><p>Allocate your full salary to save. Percentage budgets adjust when salary changes; fixed amounts stay fixed.</p><button className="primary-button" type="submit" disabled={busy || !analysis.valid || !openingValid}>{busy ? 'Saving your plan…' : 'Save salary & budgets'}</button></div>
    </fieldset>
  </form>;
}
