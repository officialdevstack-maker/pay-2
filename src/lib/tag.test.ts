import { describe, expect, it } from 'vitest';
import { checkTag, normalizeTag } from './tag';

describe('tags', () => {
  it('normalizes case and the leading @', () => {
    expect(normalizeTag('  @Ada_99 ')).toBe('ada_99');
    expect(checkTag('@Ada_99')).toEqual({ ok: true, tag: 'ada_99' });
  });

  it('rejects invalid shapes, Unicode lookalikes and reserved names', () => {
    for (const bad of [
      'ab',
      'x'.repeat(21),
      '9abc',
      'a__b',
      'ada_',
      'ada!',
      'ａｄａ',
      'admin',
      'spurs_help',
      '',
    ]) {
      expect(checkTag(bad).ok).toBe(false);
    }
  });
});
