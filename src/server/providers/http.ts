import 'server-only';
import { logger } from '@/lib/logger';
import { ProviderError } from './errors';

interface Options extends RequestInit {
  timeoutMs?: number;
  /** Retries only for calls that are safe to repeat (reads, or writes keyed by our reference). */
  retries?: number;
}

let consecutiveFailures = 0;
const BREAKER_LOG_THRESHOLD = 5;

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function providerFetch(url: string, options: Options = {}): Promise<Response> {
  const { timeoutMs = 10_000, retries = 0, ...init } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (RETRYABLE.has(response.status) && attempt < retries) {
        await sleep(250 * 2 ** attempt + Math.random() * 100);
        continue;
      }
      if (response.status >= 500) noteFailure(url);
      else consecutiveFailures = 0;
      return response;
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      if (attempt < retries) {
        await sleep(250 * 2 ** attempt + Math.random() * 100);
        continue;
      }
      noteFailure(url);
      throw new ProviderError(timedOut ? 'TIMEOUT' : 'UNAVAILABLE', 'Provider request failed.', error);
    }
  }
}

function noteFailure(url: string) {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_LOG_THRESHOLD) {
    logger.error('provider circuit: repeated failures', {
      consecutiveFailures,
      host: new URL(url).host,
    });
  }
}
