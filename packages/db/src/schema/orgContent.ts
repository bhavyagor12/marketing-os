import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  CampaignBrief,
  CampaignPlan,
  AssetPayload,
  Platform,
  ContentType,
  CampaignStatus,
} from '@marketing-os/shared';
import { user, organization } from './auth';

// Campaigns are the top-level container. Each campaign has one or more branches (like Git).
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').$type<CampaignStatus>().notNull().default('draft'),
  brief: jsonb('brief').$type<CampaignBrief>(),
  plan: jsonb('plan').$type<CampaignPlan>(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// A branch is a named line of development within a campaign. Every campaign has at least "main".
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // headCommitId is a soft reference — allowed to be null for freshly-created branches.
    headCommitId: uuid('head_commit_id'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    campaignNameUnique: uniqueIndex('branches_campaign_name_unique').on(t.campaignId, t.name),
  }),
);

// A commit is a snapshot. Content-addressed by blake3 of canonical content.
// parent_commit_id forms the DAG. merge_parent_commit_id is set on merge commits.
export const commits = pgTable(
  'commits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    parentCommitId: uuid('parent_commit_id'),
    mergeParentCommitId: uuid('merge_parent_commit_id'),
    contentHash: text('content_hash').notNull(),
    message: text('message'),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id),
    // Whether this commit was authored by a human or an agent; useful for audit.
    authoredBy: text('authored_by').notNull().default('human'),
    agentRunId: uuid('agent_run_id'),
    // For drafts generated from a plan item — index into campaigns.plan.posts. Null for
    // commits that aren't directly tied to a planned post (e.g., manual edits, future types).
    planItemIndex: integer('plan_item_index'),
    variantLabel: text('variant_label'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    hashIdx: index('commits_hash_idx').on(t.contentHash),
    branchIdx: index('commits_branch_idx').on(t.branchId),
    parentIdx: index('commits_parent_idx').on(t.parentCommitId),
    campaignPlanItemIdx: index('commits_campaign_plan_item_idx').on(
      t.campaignId,
      t.planItemIndex,
    ),
  }),
);

// The actual content snapshot — exactly one asset per commit.
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  commitId: uuid('commit_id')
    .notNull()
    .references(() => commits.id, { onDelete: 'cascade' })
    .unique(),
  contentType: text('content_type').$type<ContentType>().notNull(),
  platforms: jsonb('platforms').$type<Platform[]>().notNull(),
  payload: jsonb('payload').$type<AssetPayload>().notNull(),
});

// Media blobs are content-addressed (hash = blake3 of bytes). Same bytes across the org dedup.
export const mediaBlobs = pgTable(
  'media_blobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    contentHash: text('content_hash').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: integer('duration_seconds'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgHashUnique: uniqueIndex('media_blobs_org_hash_unique').on(t.organizationId, t.contentHash),
  }),
);

// Metrics are attached to commits, not campaigns — so version diffs have comparable performance.
export const commitMetrics = pgTable(
  'commit_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitId: uuid('commit_id')
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    externalPostId: text('external_post_id'),
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    reactions: integer('reactions').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    // ctr/engagement stored as ratios (0..1); nullable until computed.
    ctr: text('ctr'),
    engagementRate: text('engagement_rate'),
    raw: jsonb('raw'),
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  },
  (t) => ({
    commitPlatformIdx: index('commit_metrics_commit_platform_idx').on(t.commitId, t.platform),
  }),
);
