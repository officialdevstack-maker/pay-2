import 'server-only';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    ACCOUNTS_ISSUER: z.url(),
    ACCOUNTS_CLIENT_ID: z.string().min(1),
    ACCOUNTS_CLIENT_SECRET: z.string().min(1),
    PAYMENTS_DRIVER: z.string().min(1).default('mock'),
    PAYMENTS_SECRET_KEY: z.string().default(''),
    PAYMENTS_PUBLIC_KEY: z.string().default(''),
    PAYMENTS_ENCRYPTION_KEY: z.string().default(''),
    PAYMENTS_WEBHOOK_HASH: z.string().default(''),
    PAYMENTS_WEBHOOK_TOKEN: z.string().default(''),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.PAYMENTS_DRIVER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENTS_DRIVER'],
        message: 'The mock driver is not allowed in production.',
      });
    }

    if (value.PAYMENTS_DRIVER !== 'mock') {
      for (const key of ['PAYMENTS_SECRET_KEY', 'PAYMENTS_WEBHOOK_HASH'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for this driver.`,
          });
        }
      }

      if (value.PAYMENTS_WEBHOOK_TOKEN.length < 24) {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENTS_WEBHOOK_TOKEN'],
          message: 'Use at least 24 random characters.',
        });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

export const env = parsed.data;
export type Env = typeof env;
