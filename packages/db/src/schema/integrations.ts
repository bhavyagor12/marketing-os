import { pgTable, uuid, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import type { AiProvider, BillingSource } from '@marketing-os/shared';
import { user, organization } from './auth';

// BYO API keys for AI providers. Envelope-encrypted with KEY_ENCRYPTION_KEY.
export const aiProviderCredentials = pgTable(
  'ai_provider_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<AiProvider>().notNull(),
    label: text('label'),
    encryptedKey: text('encrypted_key').notNull(),
    // Last 4 chars of the key, for safe display in UI.
    keyFingerprint: text('key_fingerprint').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
  },
  (t) => ({
    orgProviderIdx: index('ai_credentials_org_provider_idx').on(t.organizationId, t.provider),
  }),
);

// Usage events — every LLM/image/publish/analytics call logs here for metering.
// billing_source distinguishes BYO-key traffic (no charge) from managed-plan traffic (billable).
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    provider: text('provider'),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    // Cost in USD micro-cents (1/1,000,000 of a USD) for precision.
    costUsdMicros: integer('cost_usd_micros'),
    billingSource: text('billing_source').$type<BillingSource>().notNull(),
    userId: text('user_id').references(() => user.id),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgDateIdx: index('usage_events_org_date_idx').on(t.organizationId, t.createdAt),
    billingSourceIdx: index('usage_events_billing_source_idx').on(t.billingSource, t.createdAt),
  }),
);
