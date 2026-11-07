import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useAppUpdates } from './AppUpdates';
import { PULL_THRESHOLD, pullDistance } from '../lib/refresh';

export function PullToRefresh({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { checkForUpdates } = useAppUpdates();
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const refreshAction = useRef(async () => {});
  refreshAction.current = async () => {
    if (busy.current) return;
    if (!navigator.onLine) { setMessage('You’re offline. Connect to refresh.'); return; }
    busy.current = true; setRefreshing(true); setMessage(null);
    try {
      await Promise.all([
        queryClient.refetchQueries({ type: 'active' }, { throwOnError: true, cancelRefetch: false }),
        checkForUpdates().catch(() => {}),
      ]);
      if (mounted.current) setMessage('Up to date.');
    } catch { if (mounted.current) setMessage('Could not refresh. Please try again.'); }
    finally { busy.current = false; if (mounted.current) { setRefreshing(false); setDistance(0); } }
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let start: { x: number; y: number } | null = null;
    let amount = 0;
    const reset = () => { start = null; amount = 0; setDistance(0); };
    const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
    const onStart = (event: TouchEvent) => {
      if (busy.current || event.touches.length !== 1 || !atTop()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,textarea,select,button,a,[contenteditable="true"],[data-no-pull-refresh]')) return;
      // Leave nested scrolling regions and horizontally swiped controls alone.
      for (let node = target; node && node !== element; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      amount = 0;
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || !atTop()) { reset(); return; }
      const touch = event.touches[0];
      amount = pullDistance(start.x, start.y, touch.clientX, touch.clientY);
      if (!amount) { reset(); return; }
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      setDistance(amount);
    };
    const onEnd = () => {
      const shouldRefresh = start && amount >= PULL_THRESHOLD;
      reset();
      if (shouldRefresh) void refreshAction.current();
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', reset);
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', reset);
    };
  }, []);
  const visible = distance > 0 || refreshing;
  return <div ref={root} className="refresh-region" aria-busy={refreshing}>
    <div className="pull-indicator" style={{ height: visible ? refreshing ? 60 : distance : 0 }} aria-hidden={!visible}>
      {visible && <><RefreshCw size={18} className={refreshing ? 'refresh-spinning' : ''} style={refreshing ? undefined : { transform: `rotate(${distance * 3}deg)` }}/><span>{refreshing ? 'Refreshing…' : distance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span></>}
    </div>
    <div className="refresh-message" role="status" aria-live="polite">{message}</div>
    <button className="manual-refresh" type="button" disabled={refreshing} onClick={() => void refreshAction.current()} aria-label="Refresh data and check for app updates"><RefreshCw size={14} className={refreshing ? 'refresh-spinning' : ''}/>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    {children}
  </div>;
}
