import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Order matters: the specific alias must come before '@'.
    alias: [
      { find: '@/server/db/client', replacement: src('./tests/db-client.ts') },
      { find: '@', replacement: src('./src') },
      { find: 'server-only', replacement: src('./tests/server-only-stub.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20_000,
  },
});
