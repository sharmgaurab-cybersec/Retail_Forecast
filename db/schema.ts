import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const savedDeals = sqliteTable('saved_deals', {
 userId: text('user_id').notNull(), dealId: text('deal_id').notNull(), createdAt: integer('created_at').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.dealId] })]);

export const priceOffers = sqliteTable('price_offers', {
 id:text('id').primaryKey(),payload:text('payload').notNull(),updatedAt:integer('updated_at').notNull(),
});
export const priceHistory = sqliteTable('price_history', {
 id:text('id').primaryKey(),offerId:text('offer_id').notNull(),price:integer('price_cents'),observedAt:text('observed_at').notNull(),method:text('method').notNull(),
});
export const syncLocks=sqliteTable('sync_locks',{name:text('name').primaryKey(),startedAt:integer('started_at').notNull()});
export const syncEvents=sqliteTable('sync_events',{id:text('id').primaryKey(),offerId:text('offer_id').notNull(),status:text('status').notNull(),message:text('message').notNull(),createdAt:integer('created_at').notNull()});
export const authRateLimits=sqliteTable('auth_rate_limits',{key:text('key').primaryKey(),window:integer('window').notNull(),count:integer('count').notNull()});
