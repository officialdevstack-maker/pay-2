import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const payUsers = pgTable('pay_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountsSub: text('accounts_sub').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oidcAuthRequests = pgTable(
  'oidc_auth_requests',
  {
    stateHash: text('state_hash').primaryKey(),
    encryptedContext: text('encrypted_context').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oidc_auth_requests_expires_idx').on(t.expiresAt)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => payUsers.id, { onDelete: 'cascade' }),
    user: jsonb('user')
      .$type<{
        sub: string;
        name?: string;
        username?: string;
        email?: string;
        email_verified?: boolean;
        auth_time?: number;
      }>()
      .notNull(),
    encryptedTokens: text('encrypted_tokens').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_sessions_user_idx').on(t.userId),
    index('auth_sessions_expires_idx').on(t.expiresAt),
    check('auth_sessions_id_chk', sql`${t.id} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<'wallet' | 'system'>().notNull(),
    /** Set for system accounts only (provider_clearing, fees, ...). */
    code: text('code').unique(),
    currency: text('currency').notNull().default('NGN'),
    normalSide: text('normal_side').$type<'debit' | 'credit'>().notNull(),
    balance: bigint('balance', { mode: 'bigint' }).notNull().default(sql`0`),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    allowNegative: boolean('allow_negative').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('ledger_accounts_kind_chk', sql`${t.kind} in ('wallet', 'system')`),
    check('ledger_accounts_side_chk', sql`${t.normalSide} in ('debit', 'credit')`),
    check('ledger_accounts_currency_chk', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'ledger_accounts_code_kind_chk',
      sql`(${t.kind} = 'system' and ${t.code} is not null) or (${t.kind} = 'wallet' and ${t.code} is null)`,
    ),
    check(
      'ledger_accounts_system_code_chk',
      sql`${t.code} is null or ${t.code} in ('provider_clearing', 'fees', 'suspense', 'settlement')`,
    ),
    check(
      'ledger_accounts_negative_balance_chk',
      sql`${t.allowNegative} or ${t.balance} >= 0`,
    ),
    check(
      'ledger_accounts_wallet_allow_negative_chk',
      sql`${t.kind} = 'system' or not ${t.allowNegative}`,
    ),
  ],
);

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => payUsers.id),
    product: text('product').$type<'pay' | 'wallet'>().notNull().default('pay'),
    ledgerAccountId: uuid('ledger_account_id')
      .notNull()
      .unique()
      .references(() => ledgerAccounts.id),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wallets_user_product_uq').on(t.userId, t.product),
    check('wallets_product_chk', sql`${t.product} in ('pay', 'wallet')`),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Our reference, SPY_XXXXXXXXXXXXXXXX. Safe to show users. */
    reference: text('reference').notNull().unique(),
    type: text('type').notNull(),
    currency: text('currency').notNull(),
    reversesTransactionId: uuid('reverses_transaction_id').references(
      (): AnyPgColumn => transactions.id,
    ),
    metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transactions_reverses_uq').on(t.reversesTransactionId),
    check('transactions_reference_chk', sql`${t.reference} ~ '^SPY_[A-Z0-9]{16}$'`),
    check('transactions_type_chk', sql`length(trim(${t.type})) > 0`),
    check('transactions_currency_chk', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    direction: text('direction').$type<'debit' | 'credit'>().notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('ledger_entries_direction_chk', sql`${t.direction} in ('debit', 'credit')`),
    check('ledger_entries_amount_chk', sql`${t.amount} > 0`),
    index('ledger_entries_account_idx').on(t.accountId, t.id),
    index('ledger_entries_txn_idx').on(t.transactionId),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    transactionId: uuid('transaction_id').references(() => transactions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key] }),
    check('idempotency_scope_chk', sql`length(trim(${t.scope})) between 1 and 128`),
    check('idempotency_key_chk', sql`length(trim(${t.key})) between 1 and 200`),
    check('idempotency_hash_chk', sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driver: text('driver').notNull(),
    /** The provider's own event id. Internal only, never serialised to a client. */
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    rawBody: text('raw_body').notNull(),
    status: text('status').$type<'received' | 'processed' | 'failed'>().notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('webhook_events_driver_event_uq').on(t.driver, t.eventId),
    index('webhook_events_pending_idx').on(t.status, t.receivedAt),
    check('webhook_events_status_chk', sql`${t.status} in ('received', 'processed', 'failed')`),
  ],
);
