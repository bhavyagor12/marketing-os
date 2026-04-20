import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import type { AgentKind, AgentRunStatus, ApprovalStatus } from '@marketing-os/shared';
import { user, organization } from './auth';
import { campaigns, commits } from './orgContent';

// A single invocation of an agent (LangGraph run). graphState holds the checkpoint for resumption.
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    agentKind: text('agent_kind').$type<AgentKind>().notNull(),
    status: text('status').$type<AgentRunStatus>().notNull().default('pending'),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    graphState: jsonb('graph_state'),
    error: text('error'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    triggeredByUserId: text('triggered_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgStatusIdx: index('agent_runs_org_status_idx').on(t.organizationId, t.status),
    campaignIdx: index('agent_runs_campaign_idx').on(t.campaignId),
  }),
);

// Inline comments on a specific commit's content. selectionRange lets us anchor to text spans.
export const commitComments = pgTable(
  'commit_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitId: uuid('commit_id')
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id),
    body: text('body').notNull(),
    selectionRange: jsonb('selection_range'),
    resolved: boolean('resolved').notNull().default(false),
    parentCommentId: uuid('parent_comment_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    commitIdx: index('commit_comments_commit_idx').on(t.commitId),
  }),
);

// PR-style approvals — reviewers can approve or request changes on a commit before publish.
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitId: uuid('commit_id')
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    reviewerUserId: text('reviewer_user_id')
      .notNull()
      .references(() => user.id),
    status: text('status').$type<ApprovalStatus>().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    commitIdx: index('approvals_commit_idx').on(t.commitId),
  }),
);
