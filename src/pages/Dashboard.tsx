import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CircleHelp, Plane, WalletCards } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { loadDashboard } from '../lib/dashboard';
import { currentMonth, money } from '../lib/format';
export function Dashboard() {
  const { session } = useAuth();
  const query = useQuery({ queryKey: ['dashboard', session?.user.id, currentMonth()], queryFn: loadDashboard });
  const firstName = session?.user.user_metadata.full_name?.split(' ')[0] || 'there';
  return <AppShell>
      <main className="dashboard"><div className="page-heading"><div><span className="eyebrow muted">YOUR OVERVIEW</span><h1>Hello, {firstName}<span className="wave">.</span></h1><p>Let’s make this month feel a little clearer.</p></div><span className="month-chip">{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(new Date())}</span></div>
      {query.isPending ? <div className="empty-panel" role="status">Loading your overview…</div> : query.isError && !query.data ? <div className="empty-panel"><h2>We couldn’t load your overview.</h2><p role="alert">{query.error.message}</p><button className="primary-button" onClick={() => query.refetch()}>Try again</button></div> : <>
        <div className="summary-grid"><section className="balance-card"><div className="card-label">MONTHLY BUDGET <WalletCards size={20}/></div><span className="balance-amount">{money(query.data.remaining)}</span><p>remaining this month</p>{query.data.carryIn < 0 && <p className="carry-note">Includes {money(Math.abs(query.data.carryIn))} carried shortfall</p>}<div className="balance-bottom"><span>Expected salary <strong>{money(query.data.salary)}</strong></span><span>Net spent <strong>{money(query.data.spent)}</strong></span></div></section>
        <section className="credit-card"><div className="card-label">FLYING BLUE <Plane size={20}/></div><span className="balance-amount">{money(query.data.credit)}</span><p>{query.data.credit < 0 ? 'to top up' : 'available to spend'}</p><div className="credit-bottom"><ArrowDownLeft size={17}/><span>{money(query.data.topUps)} topped up this month</span></div></section></div>
        {!query.data.hasSettings && <div className="setup-banner"><CircleHelp size={22}/><div><strong>A fresh start.</strong><p>Set your expected salary and give every leu a place in your monthly budget.</p><Link className="setup-link" to="/budget">Set up salary & budgets →</Link></div></div>}
        <div className="detail-grid"><section className="white-panel"><div className="section-heading"><h2>Your budgets</h2><Link className="setup-link" to="/budget">Edit budgets →</Link></div>{query.data.categories.length === 0 ? <div className="empty-state"><WalletCards size={30}/><h3>A plan for every leu.</h3><p>No category budgets yet. Once set up, you’ll see what’s left in each one here.</p></div> : query.data.categories.map(c => <div className="budget-row" key={c.id}><div><strong>{c.name}</strong><span className={c.remaining < 0 ? 'negative-text' : ''}>{money(c.remaining)} left</span></div><progress max={Math.max(c.allowance, 1)} value={Math.min(Math.max(c.spent - c.carryIn, 0), Math.max(c.allowance, 1))}/><small>{money(c.spent)} spent · {money(c.allowance)} allowance{c.carryIn < 0 && <> · {money(Math.abs(c.carryIn))} previous shortfall</>}</small></div>)}</section>
        <section className="white-panel"><div className="section-heading"><h2>Recent expenses</h2><ArrowUpRight size={18}/></div>{query.data.expenses.length === 0 ? <div className="empty-state"><ArrowUpRight size={30}/><h3>A clean slate.</h3><p>Your latest purchases will appear here, with their category and payment source.</p></div> : query.data.expenses.map(e => <div className="expense-row" key={e.id}><div><strong>{e.description || e.category_name}</strong><small>{e.category_name} · {e.payment_source === 'flying_blue' ? 'Flying Blue' : 'Personal'} · {e.date}</small></div><strong>−{money(e.amount)}</strong></div>)}</section></div>
        <p className="dashboard-footnote"><ShieldIcon/> Your budget is a plan, not your actual bank balance.</p>
      </>}
      </main></AppShell>;
}
function ShieldIcon() { return <CircleHelp size={14}/>; }
