import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
const AuthContext = createContext<{ session: Session | null; loading: boolean; error: string | null }>({ session: null, loading: true, error: null });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const cachedUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      const nextUserId = next?.user.id ?? null;
      if (cachedUserId.current !== nextUserId) queryClient.clear();
      cachedUserId.current = nextUserId;
      setSession(next); setLoading(false);
    });
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (active) { setSession(data.session); setError(authError?.message ?? null); setLoading(false); }
    }).catch(() => { if (active) { setError('Could not restore your session. Please try again.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);
  return <AuthContext.Provider value={{ session, loading, error }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
