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

export const payUsers = pgTable(
  'pay_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountsSub: text('accounts_sub').notNull().unique(),
    tag: text('tag').unique(),
    displayName: text('display_name'),
    email: text('email'),
    emailHash: text('email_hash'),
    phoneHash: text('phone_hash'),
    discoverable: boolean('discoverable').notNull().default(false),
    emailNotifications: boolean('email_notifications').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'pay_users_tag_chk',
      sql`${t.tag} is null or (${t.tag} ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$' and length(${t.tag}) between 3 and 20)`,
    ),
    check('pay_users_email_hash_chk', sql`${t.emailHash} is null or ${t.emailHash} ~ '^[a-f0-9]{64}$'`),
    check('pay_users_phone_hash_chk', sql`${t.phoneHash} is null or ${t.phoneHash} ~ '^[a-f0-9]{64}$'`),
    index('pay_users_email_hash_idx').on(t.emailHash),
    index('pay_users_phone_hash_idx').on(t.phoneHash),
  ],
);

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

export const beneficiaries = pgTable(
  'beneficiaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => payUsers.id),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => payUsers.id),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull().defaultNow(),
    sendCount: integer('send_count').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('beneficiaries_owner_recipient_uq').on(t.ownerId, t.recipientId),
    index('beneficiaries_owner_recent_idx').on(t.ownerId, t.lastSentAt),
    check('beneficiaries_not_self_chk', sql`${t.ownerId} <> ${t.recipientId}`),
  ],
);

export const walletPins = pgTable(
  'wallet_pins',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => payUsers.id, { onDelete: 'cascade' }),
    product: text('product').$type<'pay' | 'wallet'>().notNull(),
    salt: text('salt').notNull(),
    hash: text('hash').notNull(),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.product] }),
    check('wallet_pins_product_chk', sql`${t.product} in ('pay', 'wallet')`),
    check('wallet_pins_attempts_chk', sql`${t.failedAttempts} >= 0`),
  ],
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    rule: text('rule').notNull(),
    keyHash: text('key_hash').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.rule, t.keyHash] }),
    check('rate_limits_key_hash_chk', sql`${t.keyHash} ~ '^[a-f0-9]{64}$'`),
    check('rate_limits_count_chk', sql`${t.count} > 0`),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => payUsers.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    reference: text('reference'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_recent_idx').on(t.userId, t.createdAt),
    index('notifications_user_unread_idx').on(t.userId).where(sql`${t.readAt} is null`),
  ],
);

export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    clientId: text('client_id').notNull().unique(),
    ledgerAccountId: uuid('ledger_account_id')
      .notNull()
      .unique()
      .references(() => ledgerAccounts.id),
    returnUrl: text('return_url').notNull(),
    status: text('status').$type<'active' | 'suspended'>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('merchants_status_chk', sql`${t.status} in ('active', 'suspended')`),
    check('merchants_return_url_chk', sql`${t.returnUrl} ~ '^https?://'`),
  ],
);

export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    merchantReference: text('merchant_reference').notNull(),
    description: text('description'),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull().default('NGN'),
    status: text('status').$type<'open' | 'paid' | 'cancelled'>().notNull().default('open'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    transactionId: uuid('transaction_id').references(() => transactions.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('checkout_sessions_merchant_key_uq').on(t.merchantId, t.idempotencyKey),
    index('checkout_sessions_merchant_idx').on(t.merchantId, t.createdAt),
    check('checkout_sessions_reference_chk', sql`${t.reference} ~ '^SPY_[A-Z0-9]{16}$'`),
    check('checkout_sessions_amount_chk', sql`${t.amount} > 0`),
    check('checkout_sessions_currency_chk', sql`${t.currency} = 'NGN'`),
    check('checkout_sessions_status_chk', sql`${t.status} in ('open', 'paid', 'cancelled')`),
    check('checkout_sessions_paid_chk', sql`(${t.status} = 'paid') = (${t.transactionId} is not null)`),
  ],
);

export const checkoutTransfers = pgTable(
  'checkout_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .unique()
      .references(() => checkoutSessions.id),
    accountNumber: text('account_number').notNull().unique(),
    accountName: text('account_name').notNull(),
    bankName: text('bank_name').notNull(),
    providerRef: text('provider_ref').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('checkout_transfers_account_chk', sql`${t.accountNumber} ~ '^[0-9]{10}$'`)],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => payUsers.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'card'>().notNull().default('card'),
    brand: text('brand').$type<'visa' | 'mastercard' | 'verve'>().notNull(),
    last4: text('last4').notNull(),
    expMonth: integer('exp_month').notNull(),
    expYear: integer('exp_year').notNull(),
    status: text('status').$type<'active' | 'needs_attention'>().notNull().default('active'),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_methods_user_token_uq').on(t.userId, t.token),
    index('payment_methods_user_idx').on(t.userId),
    check('payment_methods_kind_chk', sql`${t.kind} in ('card')`),
    check('payment_methods_brand_chk', sql`${t.brand} in ('visa', 'mastercard', 'verve')`),
    check('payment_methods_last4_chk', sql`${t.last4} ~ '^[0-9]{4}$'`),
    check('payment_methods_exp_chk', sql`${t.expMonth} between 1 and 12 and ${t.expYear} between 2000 and 2100`),
    check('payment_methods_status_chk', sql`${t.status} in ('active', 'needs_attention')`),
  ],
);
