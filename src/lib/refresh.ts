export const PULL_THRESHOLD = 72;
export function pullDistance(startX: number, startY: number, x: number, y: number) {
  const vertical = y - startY;
  if (vertical <= 0 || Math.abs(x - startX) > vertical) return 0;
  return Math.min(110, vertical * 0.45);
}

// Avoid overlapping update requests, fetching while offline/hidden, or interrupting an installation.
export function createUpdateChecker(
  registration: Pick<ServiceWorkerRegistration, 'update' | 'installing' | 'waiting'>,
  canCheck: () => boolean,
) {
  let pending: Promise<void> | null = null;
  return function check(): Promise<void> {
    if (pending) return pending;
    if (!canCheck() || registration.installing || registration.waiting) return Promise.resolve();
    pending = Promise.resolve().then(() => registration.update()).then(() => undefined).finally(() => { pending = null; });
    return pending;
  };
}
