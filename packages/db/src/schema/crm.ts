import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user, organization } from './auth';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'engaged'
  | 'qualified'
  | 'disqualified'
  | 'unsubscribed';

export type LeadSource = 'manual' | 'import' | 'webhook' | 'api';

/**
 * leads — the starting primitive for outreach.
 *
 * One row per unique person (scoped by email within an org). Custom fields are jsonb to
 * accommodate whatever columns come from CSV imports without schema churn. Tags are free-form
 * for segmentation until we build a proper segments primitive.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Core identity
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    fullName: text('full_name'),

    // Context
    company: text('company'),
    title: text('title'),
    phone: text('phone'),
    linkedinUrl: text('linkedin_url'),
    websiteUrl: text('website_url'),
    country: text('country'),
    timezone: text('timezone'),

    // State
    status: text('status').$type<LeadStatus>().notNull().default('new'),
    source: text('source').$type<LeadSource>().notNull().default('manual'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    customFields: jsonb('custom_fields').$type<Record<string, string>>().default({}),

    // Engagement rollups (updated by outreach workers later)
    lastContactedAt: timestamp('last_contacted_at'),
    lastOpenedAt: timestamp('last_opened_at'),
    lastClickedAt: timestamp('last_clicked_at'),
    lastRepliedAt: timestamp('last_replied_at'),
    unsubscribedAt: timestamp('unsubscribed_at'),

    createdByUserId: text('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    orgEmailUnique: uniqueIndex('leads_org_email_unique').on(t.organizationId, t.email),
    orgStatusIdx: index('leads_org_status_idx').on(t.organizationId, t.status),
    orgCreatedIdx: index('leads_org_created_idx').on(t.organizationId, t.createdAt),
  }),
);
