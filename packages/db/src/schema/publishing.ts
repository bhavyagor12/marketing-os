import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import type { PublishStatus, Platform } from '@marketing-os/shared';
import { user, organization } from './auth';
import { commits } from './orgContent';

// OAuth-connected social accounts available to an organization for publishing.
export const socialConnections = pgTable(
  'social_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    platform: text('platform').$type<Platform>().notNull(),
    accountHandle: text('account_handle').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    connectedByUserId: text('connected_by_user_id')
      .notNull()
      .references(() => user.id),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastRefreshedAt: timestamp('last_refreshed_at'),
  },
  (t) => ({
    orgPlatformIdx: index('social_connections_org_platform_idx').on(t.organizationId, t.platform),
  }),
);

// A scheduled or in-flight publish of a commit to a specific connection.
export const publishes = pgTable(
  'publishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    commitId: uuid('commit_id')
      .notNull()
      .references(() => commits.id),
    platform: text('platform').$type<Platform>().notNull(),
    socialConnectionId: uuid('social_connection_id')
      .notNull()
      .references(() => socialConnections.id),
    scheduledFor: timestamp('scheduled_for').notNull(),
    status: text('status').$type<PublishStatus>().notNull().default('pending'),
    externalPostId: text('external_post_id'),
    externalUrl: text('external_url'),
    error: text('error'),
    attemptCount: integer('attempt_count').notNull().default(0),
    publishedAt: timestamp('published_at'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgStatusIdx: index('publishes_org_status_idx').on(t.organizationId, t.status),
    scheduledIdx: index('publishes_scheduled_idx').on(t.scheduledFor),
  }),
);
