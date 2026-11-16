import { describe, expect, it } from 'vitest';
import { matchesSecret } from './internal-route';

describe('matchesSecret', () => {
  const expected = 's'.repeat(32);

  it('accepts only the exact configured secret', () => {
    expect(matchesSecret(expected, expected)).toBe(true);
    expect(matchesSecret(expected, `${expected}x`)).toBe(false);
    expect(matchesSecret(expected, null)).toBe(false);
    expect(matchesSecret(expected, '')).toBe(false);
  });
});
