#!/usr/bin/env node
import nextEnv from '@next/env';
import pg from 'pg';

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is empty. Check .env.local.');
  process.exit(1);
}

const host = new URL(url).host;
console.log('Connecting to:', host);

const pool = new pg.Pool({ connectionString: url, max: 1 });

try {
  const who = await pool.query('select current_database() as db, current_user as usr');
  console.log('Connected:', who.rows[0]);

  const tables = await pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  const names = tables.rows.map((row) => row.table_name);
  console.log('Public tables:', names.join(', ') || '(none)');
  console.log('oidc_auth_requests exists:', names.includes('oidc_auth_requests'));

  try {
    const applied = await pool.query('select count(*)::int as n from drizzle.__drizzle_migrations');
    console.log('Applied migrations recorded:', applied.rows[0].n, '(expected 7)');
  } catch (error) {
    if (error?.code !== '42P01' && error?.code !== '3F000') throw error;
    console.log('No drizzle.__drizzle_migrations table: migrations have never run on this DB.');
  }
} catch (error) {
  console.error('Connection or query failed:', error.code ?? '', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
