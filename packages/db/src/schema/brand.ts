import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  vector,
} from 'drizzle-orm/pg-core';
import type { Persona, BrandVoiceTone, BrandMemorySource } from '@marketing-os/shared';
import { user, organization } from './auth';

// Narrative brand profile — one per org. Curated fields agents read from directly.
export const brandProfiles = pgTable('brand_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' })
    .unique(),
  mission: text('mission'),
  voiceTone: jsonb('voice_tone').$type<BrandVoiceTone>(),
  audiencePersonas: jsonb('audience_personas').$type<Persona[]>().default([]),
  valueProps: jsonb('value_props').$type<string[]>().default([]),
  competitors: jsonb('competitors').$type<string[]>().default([]),
  updatedByUserId: text('updated_by_user_id').references(() => user.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Chunked, embedded brand content — retrieved by agents via pgvector cosine search.
// Sources: scraped website, past posts, uploaded guidelines, tone docs, founder notes.
export const brandMemory = pgTable(
  'brand_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').$type<BrandMemorySource>().notNull(),
    sourceUrl: text('source_url'),
    title: text('title'),
    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    // 1536 dims matches text-embedding-3-small / voyage-2 defaults; adjust when we pick a provider.
    embedding: vector('embedding', { dimensions: 1536 }),
    metadata: jsonb('metadata'),
    createdByUserId: text('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('brand_memory_org_idx').on(t.organizationId),
    embeddingIdx: index('brand_memory_embedding_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
  }),
);
