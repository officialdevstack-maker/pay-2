export const TAG_RULES = {
  minLength: 3,
  maxLength: 20,
  pattern: /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
} as const;

export const RESERVED_TAGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'help',
  'me',
  'null',
  'official',
  'pay',
  'root',
  'security',
  'support',
  'system',
  'team',
  'undefined',
  'wallet',
  'you',
]);
