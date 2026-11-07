import { useState } from 'react';
import { ArrowUpRight, ShieldCheck, WalletCards } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';
export function Login() {
  const { error: sessionError } = useAuth();
  const [error, setError] = useState<string | null>(new URLSearchParams(window.location.search).get('error_description'));
  const [busy, setBusy] = useState(false);
  async function signIn() {
    if (!supabase) return;
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } } });
      if (error) throw error;
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'); setBusy(false); }
  }
  return <main className="login-layout">
    <section className="login-story"><a className="brand" href="/"><WalletCards size={26}/> pocket<span className="brand-dot">.</span></a>
      <div className="story-copy"><span className="eyebrow">A LITTLE CLARITY. EVERY DAY.</span><h1>Your money.<br/>A clearer picture.</h1><p>Make room for what matters. Keep your monthly budget and Flying Blue credit together, without the mental maths.</p>
      <div className="illustration" aria-hidden="true"><div className="mini-card"><span>ONE PLACE FOR YOUR MONEY</span><div className="mini-bars"><i/><i/><i/><i/><i/></div><div className="mini-caption">A little more in control <ArrowUpRight size={20}/></div></div><div className="floating-pill"><ShieldCheck size={18}/> Personal by design</div></div></div>
      <span className="story-footer">Less guessing. More living.</span>
    </section>
    <section className="login-panel"><div className="login-form"><span className="eyebrow muted">WELCOME TO POCKET</span><h2>Make yourself<br/>at home.</h2><p>Your budgets, spending, and available credit.<br/>All in your pocket.</p>
      {!supabase && <div className="notice">Connect Supabase to get started. Copy <code>.env.example</code> to <code>.env</code>, add your project URL and publishable key, then restart the app.</div>}
      {(error || sessionError) && <div className="notice error" role="alert">{error || sessionError}</div>}
      <button className="google-button" onClick={signIn} disabled={busy || !supabase}><svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.8-2.5l-3.3-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.8v2.7A10.3 10.3 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.2 13.6a6.2 6.2 0 0 1 0-3.2V7.7H2.8a10 10 0 0 0 0 8.6l3.4-2.7Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10.3 10.3 0 0 0-9.2 5.7l3.4 2.7C7 7.9 9.3 6.1 12 6.1Z"/></svg>{busy ? 'Connecting to Google…' : 'Continue with Google'}</button>
      <div className="login-security"><ShieldCheck size={17}/><span>Secure sign-in. Your data stays yours.</span></div><div className="install-note"><strong>A home on your Home Screen.</strong><p>On iPhone, open in Safari and choose Share → Add to Home Screen.</p></div>
    </div><span className="login-footer">A calmer way to manage your money.</span></section>
  </main>;
}
