import 'server-only';
import { z } from 'zod';
import { parseServiceClients } from '@/lib/service-clients';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url(),
    DATABASE_URL: z.string().optional().default(''),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    PIN_PEPPER: z.string().min(32, 'PIN_PEPPER must be at least 32 characters').optional(),
    ACCOUNTS_ISSUER: z.url(),
    ACCOUNTS_CLIENT_ID: z.string().min(1),
    ACCOUNTS_CLIENT_SECRET: z.string().min(1),
    SERVICE_CLIENTS: z.string().default(''),
    PAYMENTS_DRIVER: z.string().min(1).default('mock'),
    PAYMENTS_SECRET_KEY: z.string().default(''),
    PAYMENTS_PUBLIC_KEY: z.string().default(''),
    PAYMENTS_ENCRYPTION_KEY: z.string().default(''),
    PAYMENTS_WEBHOOK_HASH: z.string().default(''),
    PAYMENTS_WEBHOOK_TOKEN: z.string().default(''),
    CONTACT_PEPPER: z.string().min(32, 'CONTACT_PEPPER must be at least 32 characters').optional(),
    EMAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
    SMTP_URL: z.string().default(''),
    EMAIL_FROM: z.string().default(''),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production.',
      });
    }

    if (value.NODE_ENV === 'production' && !value.PIN_PEPPER) {
      ctx.addIssue({
        code: 'custom',
        path: ['PIN_PEPPER'],
        message: 'PIN_PEPPER is required in production.',
      });
    }

    if (value.NODE_ENV === 'production' && !value.CONTACT_PEPPER) {
      ctx.addIssue({
        code: 'custom',
        path: ['CONTACT_PEPPER'],
        message: 'CONTACT_PEPPER is required in production.',
      });
    }

    if (value.NODE_ENV === 'production' && value.EMAIL_DRIVER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_DRIVER'],
        message: 'The log email driver is not allowed in production.',
      });
    }

    if (value.EMAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_URL', 'EMAIL_FROM'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for the smtp driver.`,
          });
        }
      }
    }

    if (value.NODE_ENV === 'production' && value.PAYMENTS_DRIVER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENTS_DRIVER'],
        message: 'The mock driver is not allowed in production.',
      });
    }

    const registry = parseServiceClients(value.SERVICE_CLIENTS);
    if (!registry.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['SERVICE_CLIENTS'],
        message: registry.message,
      });
    } else if (registry.clients.has(value.ACCOUNTS_CLIENT_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SERVICE_CLIENTS'],
        message: "SERVICE_CLIENTS must not include Pay's own client.",
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
