import { describe, expect, it } from 'vitest';
import { initials, tintIndex } from './avatar';

describe('avatar', () => {
  it('creates up to two initials from names and tags', () => {
    expect(initials('Ada Okafor')).toBe('AO');
    expect(initials('@ada_okafor')).toBe('AO');
    expect(initials('Tunde')).toBe('TU');
  });

  it('selects a stable tint for the same seed', () => {
    expect(tintIndex('ada_okafor')).toBe(5);
    expect(tintIndex('Ada Okafor')).toBe(4);
  });
});
