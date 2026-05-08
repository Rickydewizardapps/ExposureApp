import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const requests = sqliteTable('requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  time: text('time').notNull(),
  method: text('method').notNull(),
  url: text('url').notNull(),
  status: integer('status'),
  duration: integer('duration'),
  reqHeaders: text('req_headers'),
  resHeaders: text('res_headers'),
  reqBodyPath: text('req_body_path'),
  resBodyPath: text('res_body_path'),
  reqBodySize: integer('req_body_size').default(0),
  resBodySize: integer('res_body_size').default(0),
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const rateLimits = sqliteTable('rate_limits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  identifier: text('identifier').notNull().unique(),
  count: integer('count').default(1),
  nextAllowed: integer('next_allowed').notNull(),
  lastAttempt: integer('last_attempt').notNull(),
  createdAt: integer('created_at').$defaultFn(() => Math.floor(Date.now() / 1000)),
});
