import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const screens = ['/', '/expenses/new', '/top-ups/new', '/history', '/budget'];

export function useScreenTransitions(ready: boolean) {
  const { pathname } = useLocation();
  const previousPath = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (!ready) return;
    const screen = document.querySelector<HTMLElement>('main.dashboard, .login-form');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!screen || typeof screen.animate !== 'function' || reduceMotion.matches) return;
    const previousIndex = previous ? screens.indexOf(previous) : -1;
    const currentIndex = screens.indexOf(pathname);
    const sideways = previousIndex >= 0 && currentIndex >= 0 && previous !== pathname;
    const offset = sideways ? (currentIndex < previousIndex ? -18 : 18) : 0;
    // Animate only screen content; the header and tab bar stay in place.
    const animation = screen.animate([
      { opacity: 0, transform: `translate3d(${offset}px, ${sideways ? 0 : 8}px, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    const cancelForReducedMotion = () => { if (reduceMotion.matches) animation.cancel(); };
    reduceMotion.addEventListener('change', cancelForReducedMotion);
    return () => {
      animation.cancel();
      reduceMotion.removeEventListener('change', cancelForReducedMotion);
    };
  }, [pathname, ready]);
}
