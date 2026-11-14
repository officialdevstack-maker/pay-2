import { describe, expect, it } from 'vitest';
import { classifyContact, normalizeEmail, normalizePhone } from './contact';

describe('contact parsing', () => {
  it('normalises Nigerian numbers however they are typed', () => {
    for (const raw of ['08012345678', '+234 801 234 5678', '2348012345678', '0801-234-5678']) {
      expect(normalizePhone(raw)).toBe('+2348012345678');
    }
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('0612345678')).toBeNull();
  });

  it('normalises and validates emails', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    for (const bad of ['', 'ada', 'ada@', 'a b@c.com', 'ada@x']) expect(normalizeEmail(bad)).toBeNull();
  });

  it('tells tags, emails and phones apart', () => {
    expect(classifyContact('@ada_99')).toEqual({ kind: 'tag', value: '@ada_99' });
    expect(classifyContact('ada_99')).toEqual({ kind: 'tag', value: 'ada_99' });
    expect(classifyContact('Ada@Example.com')).toEqual({ kind: 'email', value: 'ada@example.com' });
    expect(classifyContact('08012345678')).toEqual({ kind: 'phone', value: '+2348012345678' });
    expect(classifyContact('???')).toEqual({ kind: 'invalid' });
    expect(classifyContact('')).toEqual({ kind: 'invalid' });
  });
});
