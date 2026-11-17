import { describe, expect, it } from 'vitest';
import { normalizeMerchantWebhookUrl } from './index';

describe('merchant webhook URL validation', () => {
  it('normalizes valid HTTPS endpoints', () => {
    expect(normalizeMerchantWebhookUrl('https://hooks.example.com/events')).toBe(
      'https://hooks.example.com/events',
    );
  });

  it.each([
    'http://hooks.example.com/events',
    'https://user:password@hooks.example.com/events',
    'https://127.0.0.1/events',
    'https://10.1.2.3/events',
    'https://192.0.2.1/events',
    'https://[::ffff:7f00:1]/events',
  ])('rejects unsafe endpoint %s', (url) => {
    expect(() => normalizeMerchantWebhookUrl(url)).toThrow();
  });

  it('allows local HTTP endpoints for development', () => {
    expect(normalizeMerchantWebhookUrl('http://localhost:3001/webhooks')).toBe(
      'http://localhost:3001/webhooks',
    );
  });
});
