import { describe, it, expect } from 'vitest';
import { expenseFieldErrors, expensePreview } from '../src/lib/expenses';
describe('Expense budget warnings', () => {
  it('warns when exceeding the remaining category budget, not its original allowance', () => {
    expect(expensePreview('150',100)).toEqual({ valid:true,amount:150,after:-50,overBudget:true });
    expect(expensePreview('100',100).overBudget).toBe(false);
  });
  it('allows a purchase while already negative and shows the larger shortfall', () => {
    expect(expensePreview('50',-100)).toEqual({ valid:true,amount:50,after:-150,overBudget:true });
  });
  it('uses cents consistently and accepts comma amounts', () => {
    expect(expensePreview('0,20',.30).after).toBe(.10);
    expect(expensePreview('1.001',100).valid).toBe(false);
    expect(expensePreview('0',100).valid).toBe(false);
    expect(expensePreview('-10',100).valid).toBe(false);
  });
});


describe('Expense save validation', () => {
  it('identifies missing fields instead of silently disabling Save', () => {
    const errors = expenseFieldErrors('', '', '', ['expenses'], '2026-11-14');
    expect(errors.amount).toBeTruthy(); expect(errors.categoryId).toBeTruthy(); expect(errors.date).toBeTruthy();
  });
  it('accepts valid comma amounts and requires no description or positive budget', () => {
    expect(expenseFieldErrors('25,50', 'expenses', '2026-11-14', ['expenses'], '2026-11-14')).toEqual({});
  });
  it('explains invalid amounts, stale categories and dates outside the current month', () => {
    expect(expenseFieldErrors('25 lei', 'deleted', '2026-10-31', ['expenses'], '2026-11-14').amount).toBeTruthy();
    expect(expenseFieldErrors('25', 'deleted', '2026-11-14', ['expenses'], '2026-11-14').categoryId).toBeTruthy();
    for (const date of ['2026-10-31','2026-11-15','2026-11-31']) expect(expenseFieldErrors('25', 'expenses', date, ['expenses'], '2026-11-14').date).toBeTruthy();
  });
});
