import { describe, expect, it } from 'vitest';
import { parseServiceClients } from './service-clients';

describe('parseServiceClients', () => {
  it('parses client to product pairs', () => {
    const result = parseServiceClients('spurs-wallet=wallet, other.client=wallet');
    expect(result.ok && [...result.clients]).toEqual([
      ['spurs-wallet', 'wallet'],
      ['other.client', 'wallet'],
    ]);
  });

  it('accepts an empty value', () => {
    expect(parseServiceClients('')).toMatchObject({ ok: true });
  });

  it('refuses pay, unknown products, duplicates and malformed entries', () => {
    for (const bad of ['w=pay', 'w=other', 'w=wallet,w=wallet', 'w', '=wallet', 'w=wallet=x', 'bad id=wallet']) {
      expect(parseServiceClients(bad).ok).toBe(false);
    }
  });
});
