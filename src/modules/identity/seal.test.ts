import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './seal';

describe('sealed auth data', () => {
  it('round-trips values and rejects tampering', () => {
    const sealed = encrypt({ accessToken: 'private' });
    console.log('sealed', sealed, 'endswithx', sealed.endsWith('x'));
    expect(decrypt<{ accessToken: string }>(sealed)).toEqual({ accessToken: 'private' });
    expect(() => decrypt(`${sealed.slice(0, -1)}x`)).toThrow();
  });
});
