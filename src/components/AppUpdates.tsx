import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { createUpdateChecker } from '../lib/refresh';
const UpdateContext = createContext({ checkForUpdates: async () => {}, setUpdateBlocked: (_blocked: boolean) => {} });
export const useAppUpdates = () => useContext(UpdateContext);
export function AppUpdates({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [blocked, setUpdateBlocked] = useState(false);
  const blockedRef = useRef(false);
  blockedRef.current = blocked;
  const [reloadPending, setReloadPending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checker = useRef<() => Promise<void>>(async () => {});
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onNeedReload() {
      // Another open tab may activate the waiting worker while this tab is editing.
      if (blockedRef.current) setReloadPending(true);
      else window.location.reload();
    },
    onRegisteredSW(_url, registered) { setRegistration(registered); },
  });
  const checkForUpdates = useCallback(() => checker.current(), []);
  useEffect(() => {
    if (!registration) return;
    const check = createUpdateChecker(registration, () => navigator.onLine && document.visibilityState === 'visible');
    checker.current = check;
    const quietlyCheck = () => { void check().catch(() => {}); };
    quietlyCheck();
    const interval = window.setInterval(quietlyCheck, 60_000);
    window.addEventListener('focus', quietlyCheck);
    window.addEventListener('online', quietlyCheck);
    document.addEventListener('visibilitychange', quietlyCheck);
    return () => {
      checker.current = async () => {};
      window.clearInterval(interval);
      window.removeEventListener('focus', quietlyCheck);
      window.removeEventListener('online', quietlyCheck);
      document.removeEventListener('visibilitychange', quietlyCheck);
    };
  }, [registration]);
  async function apply() {
    if (blocked || applying) return;
    setApplying(true); setError(null);
    if (reloadPending) { window.location.reload(); return; }
    try { await updateServiceWorker(true); }
    catch { setError('Could not update. Check your connection and try again.'); setApplying(false); }
  }
  return <UpdateContext.Provider value={{ checkForUpdates, setUpdateBlocked }}>{children}
    {(needRefresh || reloadPending) && <section className="app-update-banner" role="status" aria-live="polite"><Download size={22}/><div><strong>A fresh Pocket is ready.</strong><p>{error || (blocked ? 'Save your changes before updating.' : 'Update to get the latest improvements.')}</p></div><button type="button" onClick={apply} disabled={blocked || applying}>{applying ? <><RefreshCw size={15} className="refresh-spinning"/> Updating…</> : 'Update app'}</button></section>}
  </UpdateContext.Provider>;
}
