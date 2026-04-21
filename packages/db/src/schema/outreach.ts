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
import { user, organization } from './auth';
import { leads } from './crm';
import { socialConnections, publishes } from './publishing';

export type OutreachSequenceStatus = 'draft' | 'active' | 'paused' | 'archived';
export type OutreachEnrollmentStatus =
  | 'active'
  | 'completed'
  | 'replied'
  | 'bounced'
  | 'unsubscribed'
  | 'stopped';

/**
 * outreach_sequences — reusable multi-step email sequences that can be applied to leads.
 * Each step is a template the personalization agent fills per-lead at send time.
 */
export const outreachSequences = pgTable(
  'outreach_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').$type<OutreachSequenceStatus>().notNull().default('draft'),
    socialConnectionId: uuid('social_connection_id').references(() => socialConnections.id, {
      onDelete: 'set null',
    }),
    createdByUserId: text('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('outreach_sequences_org_idx').on(t.organizationId),
  }),
);

export const outreachSequenceSteps = pgTable(
  'outreach_sequence_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => outreachSequences.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    delayDaysAfterPrevious: integer('delay_days_after_previous').notNull().default(0),
    subjectTemplate: text('subject_template').notNull(),
    bodyTemplate: text('body_template').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    sequenceOrderUnique: uniqueIndex('outreach_step_sequence_order_unique').on(
      t.sequenceId,
      t.stepOrder,
    ),
  }),
);

export const outreachEnrollments = pgTable(
  'outreach_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => outreachSequences.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    status: text('status').$type<OutreachEnrollmentStatus>().notNull().default('active'),
    currentStepOrder: integer('current_step_order').notNull().default(0),
    nextSendAt: timestamp('next_send_at'),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
    enrolledByUserId: text('enrolled_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqueLeadInSequence: uniqueIndex('outreach_enrollment_sequence_lead_unique').on(
      t.sequenceId,
      t.leadId,
    ),
    orgStatusIdx: index('outreach_enrollment_org_status_idx').on(t.organizationId, t.status),
    nextSendIdx: index('outreach_enrollment_next_send_idx').on(t.nextSendAt),
  }),
);

export const outreachSends = pgTable(
  'outreach_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => outreachEnrollments.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => outreachSequenceSteps.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    publishId: uuid('publish_id').references(() => publishes.id, { onDelete: 'set null' }),
    // Snapshot of the filled template at send time — useful for review/audit even if
    // templates change later.
    renderedSubject: text('rendered_subject').notNull(),
    renderedBody: text('rendered_body').notNull(),
    metadata: jsonb('metadata'),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
    openedAt: timestamp('opened_at'),
    clickedAt: timestamp('clicked_at'),
    repliedAt: timestamp('replied_at'),
    bouncedAt: timestamp('bounced_at'),
  },
  (t) => ({
    enrollmentIdx: index('outreach_sends_enrollment_idx').on(t.enrollmentId),
    leadIdx: index('outreach_sends_lead_idx').on(t.leadId),
  }),
);
