import 'server-only';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { env } from '@/env';
import * as schema from './schema';

if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;

const globalForDb = globalThis as unknown as { __pool?: Pool };

const pool = globalForDb.__pool ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 });
if (env.NODE_ENV !== 'production') globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
