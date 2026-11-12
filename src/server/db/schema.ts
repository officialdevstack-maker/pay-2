import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const payUsers = pgTable('pay_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountsSub: text('accounts_sub').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
