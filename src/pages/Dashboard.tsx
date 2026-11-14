import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryIcon } from '../components/CategoryIcon';
import { AppShell } from '../components/AppShell';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CircleHelp, Plane, WalletCards } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { loadDashboard } from '../lib/dashboard';
import { greetingName } from '../lib/profile';
import { currentMonth, money } from '../lib/format';
export function Dashboard() {
  const { session } = useAuth();
  const query = useQuery({ queryKey: ['dashboard', session?.user.id, currentMonth()], queryFn: loadDashboard });
  const firstName = greetingName(session?.user.user_metadata ?? {}, session?.user.identities);
  const preferenceKey = `pocket:featured-category:${session?.user.id}`;
  const [preferredCategory, setPreferredCategory] = useState('');
  useEffect(() => {
    try { setPreferredCategory(localStorage.getItem(preferenceKey) ?? ''); }
    catch { setPreferredCategory(''); }
  }, [preferenceKey]);
  const featuredCategory = query.data?.categories.find(category => category.id === preferredCategory)
    ?? query.data?.categories.find(category => ['expenses', 'cheltuieli'].includes(category.name.trim().toLocaleLowerCase()));
  function selectCategory(id: string) {
    setPreferredCategory(id);
    try { localStorage.setItem(preferenceKey, id); } catch { /* Keep the selection in memory when storage is unavailable. */ }
  }
  return <AppShell>
      <main className="dashboard overview-page"><div className="page-heading"><div><span className="eyebrow muted">YOUR OVERVIEW</span><h1>Hello, {firstName}<span className="wave">.</span></h1></div><span className="month-chip">{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(new Date())}</span></div>
      {query.isPending ? <div className="empty-panel" role="status">Loading your overview…</div> : query.isError && !query.data ? <div className="empty-panel"><h2>We couldn’t load your overview.</h2><p role="alert">{query.error.message}</p><button className="primary-button" onClick={() => query.refetch()}>Try again</button></div> : <>
        <section className="balance-card featured-balances" aria-label="Available balances">
          <div className="featured-section">
            <div className="featured-heading"><span className="featured-icon"><CategoryIcon name={featuredCategory?.icon} size={23}/></span><div className="featured-heading-copy"><label htmlFor="featured-category" className="card-label">CATEGORY BUDGET</label><select id="featured-category" className="featured-category-select" value={featuredCategory?.id ?? ''} onChange={event => selectCategory(event.target.value)} disabled={!query.data.categories.length}>{!featuredCategory && <option value="" disabled>Choose a category</option>}{query.data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div>
            <span className={`balance-amount${featuredCategory && featuredCategory.remaining < 0 ? ' featured-negative' : ''}`}>{featuredCategory ? money(featuredCategory.remaining) : '—'}</span>
            <p>{featuredCategory ? 'available this month' : 'Set up or select your Expenses category'}</p>
            {featuredCategory && featuredCategory.carryIn !== 0 && <p className="carry-note">Includes {money(Math.abs(featuredCategory.carryIn))} carried {featuredCategory.carryIn < 0 ? 'shortfall' : 'forward'}</p>}
          </div>
          <div className="featured-section">
            <div className="featured-heading"><span className="featured-icon"><Plane size={23}/></span><div className="featured-heading-copy"><h2 className="card-label">FLYING BLUE</h2><span className="featured-subtitle">Card credit</span></div></div>
            <span className={`balance-amount${query.data.credit < 0 ? ' featured-negative' : ''}`}>{money(query.data.credit)}</span>
            <p>{query.data.credit < 0 ? 'to top up' : 'available to spend'}</p>
          </div>
        </section>
        {!query.data.hasSettings && <div className="setup-banner"><CircleHelp size={22}/><div><strong>A fresh start.</strong><p>Set your expected salary and give every leu a place in your monthly budget.</p><Link className="setup-link" to="/budget">Set up salary & budgets →</Link></div></div>}
        <div className="detail-grid"><section className="white-panel"><div className="section-heading"><h2>Your budgets</h2><Link className="setup-link" to="/budget">Edit budgets →</Link></div>{query.data.categories.length === 0 ? <div className="empty-state"><WalletCards size={30}/><h3>A plan for every leu.</h3><p>No category budgets yet. Once set up, you’ll see what’s left in each one here.</p></div> : query.data.categories.map(c => <div className="budget-row" key={c.id}><div><strong className="category-caption"><CategoryIcon name={c.icon} size={17}/>{c.name}</strong><span className={c.remaining < 0 ? 'negative-text' : ''}>{money(c.remaining)} left</span></div><progress max={Math.max(c.allowance + c.carryIn, 1)} value={Math.min(Math.max(c.spent, 0), Math.max(c.allowance + c.carryIn, 1))}/><small>{money(c.spent)} spent · {money(c.allowance)} allowance{c.carryIn !== 0 && <> · {money(Math.abs(c.carryIn))} {c.carryIn < 0 ? 'previous shortfall' : 'carried forward'}</>}</small></div>)}</section>
        <section className="white-panel"><div className="section-heading"><h2>Recent expenses</h2><Link className="setup-link" to="/history">View all →</Link></div>{query.data.expenses.length === 0 ? <div className="empty-state"><ArrowUpRight size={30}/><h3>A clean slate.</h3><p>Your latest purchases will appear here, with their category and payment source.</p></div> : query.data.expenses.map(e => <div className="expense-row" key={e.id}><div><strong className="category-caption"><CategoryIcon name={query.data.categories.find(c => c.name === e.category_name)?.icon} size={16}/>{e.description || e.category_name}</strong><small>{e.category_name} · {e.payment_source === 'flying_blue' ? 'Flying Blue' : 'Personal'} · {e.date}</small></div><strong>−{money(e.amount)}</strong></div>)}</section></div>
        <p className="dashboard-footnote"><ShieldIcon/> Your budget is a plan, not your actual bank balance.</p>
      </>}
      </main></AppShell>;
}
function ShieldIcon() { return <CircleHelp size={14}/>; }
