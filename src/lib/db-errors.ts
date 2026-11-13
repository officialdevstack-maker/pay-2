export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const e = current as { code?: string; constraint?: string; cause?: unknown };
    if (e.code === '23505' && (!constraint || e.constraint === constraint)) return true;
    current = e.cause;
  }
  return false;
}
