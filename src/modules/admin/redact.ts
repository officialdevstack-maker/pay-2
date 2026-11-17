export function redactAdminError(value: string | null) {
  if (value === null) return null;
  return value
    .replace(
      /["']?\b(pan|card(?:[_ -]?number)?|cvv|cvc|pin|account(?:[_ -]?number)?|secret|token|authorization)\b["']?(\s*[:=]\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\b\d(?:[ -]?\d){9,18}\b/g, '[REDACTED]');
}
