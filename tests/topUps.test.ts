import { describe, it, expect } from 'vitest';
import { topUpPreview } from '../src/lib/topUps';
describe('Flying Blue top-up preview', () => {
  it('adds to credit, including negative balances, using exact cents', () => {
    expect(topUpPreview('600',-100)).toEqual({ valid: true, amount:600, after:500 });
    expect(topUpPreview('0,20',.10).after).toBe(.30);
  });
  it('rejects zero, negative, overlarge, or fractional-cent amounts', () => {
    for (const amount of ['0','-100','1.001','1000000000000','']) expect(topUpPreview(amount,100).valid).toBe(false);
  });
});
