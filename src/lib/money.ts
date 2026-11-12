export type Kobo = bigint;

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
const nairaWhole = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

function toDecimalString(kobo: Kobo): string {
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function formatNaira(kobo: Kobo | number, options: { hideZeroKobo?: boolean } = {}): string {
  const value = typeof kobo === 'number' ? toKobo(kobo) : kobo;
  const decimal = toDecimalString(value);
  const formatter = options.hideZeroKobo && value % 100n === 0n ? nairaWhole : naira;
  return formatter.format(decimal as unknown as number);
}

export function toKobo(value: number): Kobo {
  if (!Number.isSafeInteger(value)) throw new RangeError('Kobo must be a safe integer.');
  return BigInt(value);
}

export function parseNairaToKobo(input: string): Kobo | null {
  const cleaned = input.replace(/[₦,\s]/g, '');
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = BigInt(match[1]!);
  const frac = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return whole * 100n + frac;
}

export function percentOf(kobo: Kobo, basisPoints: number): Kobo {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError('basisPoints must be a non-negative integer.');
  }
  return (kobo * BigInt(basisPoints) + 5000n) / 10000n;
}
