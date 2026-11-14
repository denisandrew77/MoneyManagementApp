import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowDownToLine, History as HistoryIcon, LayoutDashboard, LogOut, PlusCircle, SlidersHorizontal, WalletCards } from 'lucide-react';
import { PullToRefresh } from './PullToRefresh';
import { supabase } from '../lib/supabase';

export function AppShell({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true); setError(null);
    try {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  }
  const links = <><NavLink to="/" end><LayoutDashboard size={19}/><span>Overview</span></NavLink><NavLink to="/expenses/new"><PlusCircle size={19}/><span>Add expense</span></NavLink><NavLink to="/top-ups/new"><ArrowDownToLine size={19}/><span>Top up</span></NavLink><NavLink to="/history"><HistoryIcon size={19}/><span>History</span></NavLink><NavLink to="/budget"><SlidersHorizontal size={19}/><span>Salary & budgets</span></NavLink></>;
  return <div className="app-shell">
    <aside className="sidebar"><NavLink className="brand" to="/"><WalletCards size={26}/> pocket<span className="brand-dot">.</span></NavLink><nav className="sidebar-nav" aria-label="Main navigation">{links}</nav><div className="sidebar-bottom"><span>ONE MONTH AT A TIME</span><p>A little clarity goes a long way.</p></div></aside>
    <div className="app-content"><header className="app-header"><NavLink className="mobile-brand" to="/">pocket.</NavLink><span className="desktop-label">Your money, at a glance</span><button className="sign-out" onClick={signOut} disabled={busy}><LogOut size={16}/>{busy ? 'Signing out…' : 'Sign out'}</button></header>
    {error && <div className="shell-error notice error" role="alert">{error}</div>}
    <PullToRefresh>{children}</PullToRefresh>
    <nav className="mobile-nav" aria-label="Mobile navigation">{links}</nav></div>
  </div>;
}
