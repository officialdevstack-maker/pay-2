import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/server/db/schema';
import type { Db } from '../src/server/db/client'; // type only, erased at runtime

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });

export const db = drizzle(pool, { schema }) as unknown as Db;
