import { defineConfig } from 'drizzle-kit';
import { createRequire } from 'node:module';

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env');
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '' },
});
