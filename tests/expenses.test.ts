import { describe, it, expect } from 'vitest';
import { expensePreview } from '../src/lib/expenses';
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
