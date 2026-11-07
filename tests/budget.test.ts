import { describe, it, expect } from 'vitest';
import { analyzePlan, decimalUnits, previewAllocation, type AllocationRow } from '../src/lib/budget';
const row = (name: string, type: 'fixed' | 'percentage', value: string): AllocationRow => ({ key: name, name, type, value });
describe('Salary allocation validation', () => {
  it('accepts mixed lei and percentage allocations and recalculates when salary changes', () => {
    const rows = [row('Expenses','percentage','80'), row('Gas','fixed','1200')];
    expect(analyzePlan('6000',rows).valid).toBe(true);
    const changed = analyzePlan('7000',rows);
    expect(changed.valid).toBe(false);
    expect(changed.difference).toBe(200);
    expect(previewAllocation('7000',rows[0]).amount).toBe(5600);
    expect(previewAllocation('7000',rows[1]).amount).toBe(1200);
  });
  it('handles comma decimal input and exact decimal allocation without floating point drift', () => {
    expect(decimalUnits('6000,25',2)).toBe(600025n);
    expect(analyzePlan('0.30',[row('A','fixed','0.10'),row('B','fixed','0.20')]).valid).toBe(true);
    expect(analyzePlan('6000,25',[row('Expenses','percentage','100')]).valid).toBe(true);
  });
  it('rejects fractional underallocation even when the displayed remainder rounds to zero', () => {
    const result = analyzePlan('1',[row('A','percentage','99.99')]);
    expect(result.difference).toBe(.0001);
    expect(result.valid).toBe(false);
  });
  it('rejects duplicate or empty category names and nonpositive allocations', () => {
    expect(analyzePlan('100',[row('Gas','percentage','50'),row(' gas ','percentage','50')]).valid).toBe(false);
    expect(analyzePlan('100',[row('','percentage','100')]).valid).toBe(false);
    expect(analyzePlan('100',[row('A','fixed','0'),row('B','fixed','100')]).valid).toBe(false);
    expect(analyzePlan('100',[row('A','percentage','101')]).valid).toBe(false);
  });
  it('rejects unsupported decimals, malformed input and zero salary', () => {
    expect(decimalUnits('1.001',2)).toBeNull();
    expect(decimalUnits('1e3',2)).toBeNull();
    expect(decimalUnits('-100',2)).toBeNull();
    expect(analyzePlan('0',[row('A','percentage','100')]).valid).toBe(false);
    expect(analyzePlan('1000000000000',[row('A','percentage','100')]).valid).toBe(false);
  });
});
