import { describe, expect, it } from 'vitest';
import { formatNaira, parseNairaToKobo, percentOf } from './money';

describe('money', () => {
  it('parses amounts without float maths', () => {
    expect(parseNairaToKobo('1,250.50')).toBe(125050n);
    expect(parseNairaToKobo('₦100')).toBe(10000n);
    expect(parseNairaToKobo('0.1')).toBe(10n);
    expect(parseNairaToKobo('0.07')).toBe(7n);
  });

  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '1.234', '-5', '1e3', '1..2']) {
      expect(parseNairaToKobo(bad)).toBeNull();
    }
  });

  it('formats kobo as naira', () => {
    expect(formatNaira(125050n)).toContain('1,250.50');
    expect(formatNaira(10000n, { hideZeroKobo: true })).not.toContain('.00');
    expect(formatNaira(-500n)).toContain('5.00');
  });

  it('computes 2.5% fees, rounding half up', () => {
    expect(percentOf(100000n, 250)).toBe(2500n);
    expect(percentOf(10100n, 250)).toBe(253n);
  });
});
