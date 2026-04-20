import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import type {
  EventTypeValue,
  EventSubjectTypeValue,
  Platform,
} from '@marketing-os/shared';
import { user, organization } from './auth';
import { campaigns, commits, assets } from './orgContent';

/**
 * events — the unified activity stream.
 *
 * Every write path (server action, worker job, agent run, external webhook) inserts a row
 * here. This is the backbone for:
 *  - effort tracking ("what did I do today?")
 *  - attribution (Action → Asset → Campaign → Funnel → Revenue)
 *  - learning loop (which versions drove which outcomes)
 *  - team visibility (what teammates are doing)
 *
 * Design notes:
 *  - Attribution columns (campaignId/commitId/assetId) are DENORMALIZED from the subject
 *    on write so we can answer "all events for campaign X" with one index scan.
 *  - For external events, `platform` + `externalId` identify the off-platform record.
 *  - For revenue events, `amountUsdMicros` is stored in micros (1/1,000,000 USD) for precision.
 *  - `properties` is the escape hatch for anything event-type-specific.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // --- Actor: who caused this ---
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorAgentRunId: uuid('actor_agent_run_id'),
    actorSystem: boolean('actor_system').notNull().default(false),

    // --- What happened ---
    type: text('type').$type<EventTypeValue>().notNull(),

    // --- What it's about ---
    subjectType: text('subject_type').$type<EventSubjectTypeValue>(),
    subjectId: text('subject_id'),

    // --- Attribution (denormalized for fast funnel queries) ---
    campaignId: uuid('campaign_id').references(() => campaigns.id, {
      onDelete: 'set null',
    }),
    commitId: uuid('commit_id').references(() => commits.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),

    // --- External signals (publishing, tracking pixel) ---
    platform: text('platform').$type<Platform>(),
    externalId: text('external_id'),

    // --- Revenue (ExternalRevenue events) ---
    amountUsdMicros: integer('amount_usd_micros'),

    // --- Free-form + display ---
    properties: jsonb('properties'),
    message: text('message'),

    occurredAt: timestamp('occurred_at').notNull().defaultNow(),
    ingestedAt: timestamp('ingested_at').notNull().defaultNow(),
  },
  (t) => ({
    orgTimeIdx: index('events_org_time_idx').on(t.organizationId, t.occurredAt),
    orgTypeIdx: index('events_org_type_idx').on(t.organizationId, t.type, t.occurredAt),
    actorIdx: index('events_actor_idx').on(t.actorUserId, t.occurredAt),
    campaignIdx: index('events_campaign_idx').on(t.campaignId, t.occurredAt),
    commitIdx: index('events_commit_idx').on(t.commitId, t.type),
    subjectIdx: index('events_subject_idx').on(t.subjectType, t.subjectId),
  }),
);
