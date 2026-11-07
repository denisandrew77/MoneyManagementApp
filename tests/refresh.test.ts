import { describe, it, expect, vi } from 'vitest';
import { createUpdateChecker, PULL_THRESHOLD, pullDistance } from '../src/lib/refresh';
describe('Touch refresh gestures', () => {
  it('ignores upward pulls and primarily horizontal gestures', () => {
    expect(pullDistance(0,100,0,80)).toBe(0);
    expect(pullDistance(0,0,120,30)).toBe(0);
  });
  it('requires a deliberate downward pull and caps displacement', () => {
    expect(pullDistance(0,0,5,30)).toBeLessThan(PULL_THRESHOLD);
    expect(pullDistance(0,0,5,170)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
    expect(pullDistance(0,0,0,2000)).toBe(110);
  });
});
describe('PWA update checks', () => {
  it('skips checks while offline/hidden, installing or waiting for approval', async () => {
    const update = vi.fn(async () => undefined);
    const registration = { update, installing: null, waiting: null } as unknown as ServiceWorkerRegistration;
    let available = false;
    const check = createUpdateChecker(registration, () => available);
    await check(); expect(update).not.toHaveBeenCalled();
    available = true;
    Object.defineProperty(registration, 'installing', { value: {}, configurable: true });
    await check(); expect(update).not.toHaveBeenCalled();
    Object.defineProperty(registration, 'installing', { value: null });
    Object.defineProperty(registration, 'waiting', { value: {} });
    await check(); expect(update).not.toHaveBeenCalled();
  });
  it('coalesces overlapping requests and allows another check after completion', async () => {
    let finish!: () => void;
    const update = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const check = createUpdateChecker({ update, installing: null, waiting: null } as unknown as ServiceWorkerRegistration, () => true);
    const first = check(); const second = check();
    expect(first).toBe(second);
    await Promise.resolve(); expect(update).toHaveBeenCalledTimes(1);
    finish(); await first;
    const next = check(); await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(2); finish(); await next;
  });
  it('recovers after an update request fails', async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined);
    const check = createUpdateChecker({ update, installing: null, waiting: null } as unknown as ServiceWorkerRegistration, () => true);
    await expect(check()).rejects.toThrow('Offline');
    await expect(check()).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(2);
  });
});
