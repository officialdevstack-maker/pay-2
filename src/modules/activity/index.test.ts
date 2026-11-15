import { describe, expect, it } from 'vitest';
import { parseFilter } from './index';

describe('parseFilter', () => {
  it('falls back to all for removed filter values', () => {
    expect(parseFilter('added')).toBe('all');
  });
});
