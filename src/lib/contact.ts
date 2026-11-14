const EMAIL = new RegExp('^[^\s@]{1,64}@[^
\s@]{1,255}\.[^\s@]{2,}$');

export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  return value.length <= 254 && EMAIL.test(value) ? value : null;
}

/** Nigerian numbers in any common spelling become +234XXXXXXXXXX; other international numbers must start with +. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, '');
  if (/^0[789]\d{9}$/.test(cleaned)) return `+234${cleaned.slice(1)}`;
  if (/^234[789]\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  return null;
}

export type ContactTarget =
  | { kind: 'tag' | 'email' | 'phone'; value: string }
  | { kind: 'invalid' };

export function classifyContact(raw: string): ContactTarget {
  const input = raw.trim();
  if (!input || input.length > 254) return { kind: 'invalid' };
  if (input.startsWith('@') || /^[A-Za-z][A-Za-z0-9_]*$/.test(input)) return { kind: 'tag', value: input };
  if (input.includes('@')) {
    const email = normalizeEmail(input);
    return email ? { kind: 'email', value: email } : { kind: 'invalid' };
  }
  const phone = normalizePhone(input);
  return phone ? { kind: 'phone', value: phone } : { kind: 'invalid' };
}
