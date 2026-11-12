const REDACT = /pass(word)?|pin|secret|token|authorization|cookie|card|cvv|account_?number|otp/i;
const MAX_DEPTH = 5;

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[depth]';
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        REDACT.test(key) ? '[redacted]' : redact(item, depth + 1),
      ]),
    );
  }
  return typeof value === 'bigint' ? value.toString() : value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, context?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(context && (redact(context) as object)),
  });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    process.env.NODE_ENV !== 'production' && write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
