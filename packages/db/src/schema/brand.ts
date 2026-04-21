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

// ============================================================================
// CENTRAL BRAND PROFILE — one per org
// Holds the cohesive strategic narrative. Fields are structured JSONB so the UI
// can render them as distinct sections and agents can cherry-pick per task.
// ============================================================================

export type BrandIdentity = {
  legalName?: string;
  tradingName?: string;
  tagline?: string;
  mission?: string;
  vision?: string;
  foundingStory?: string;
  foundedYear?: number;
  category?: string;
  subCategory?: string;
  stage?: 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'series-b-plus' | 'profitable' | 'public';
  hqLocation?: string;
  markets?: string[];
};

export type BrandPositioning = {
  category?: string;
  categoryPosition?: string; // "leading", "challenger", "niche", etc.
  pointOfView?: string;
  uniqueInsight?: string;
  differentiators?: string[];
  elevatorPitch?: string;
};

export type BrandVoice = {
  attributes?: string[]; // e.g. "confident", "warm", "technical"
  avoid?: string[]; // e.g. "corporate-speak", "hype"
  signaturePhrases?: string[]; // phrases the brand actually uses
  lexicon?: { preferred: string; instead_of?: string }[];
  pointOfView?: 'we' | 'brand-as-entity' | 'founder-first' | 'customer-first';
  styleNotes?: string;
  examples?: { label: string; text: string }[];
};

export type BrandStrategy = {
  currentPriorities?: string[];
  growthAudiences?: string[];
  focusChannels?: string[];
  upcomingLaunches?: string[];
  okrs?: string[];
};

export type BrandConstraints = {
  bannedPhrases?: string[];
  requiredDisclosures?: string[];
  compliance?: string[]; // e.g. "HIPAA", "GDPR", "SEC disclosures"
  trademarkedTerms?: string[];
  languages?: string[]; // supported content languages
};

export const brandProfiles = pgTable('brand_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' })
    .unique(),
  identity: jsonb('identity').$type<BrandIdentity>(),
  positioning: jsonb('positioning').$type<BrandPositioning>(),
  voice: jsonb('voice').$type<BrandVoice>(),
  strategy: jsonb('strategy').$type<BrandStrategy>(),
  constraints: jsonb('constraints').$type<BrandConstraints>(),
  // Kept for backward-compat / quick reads; derived from identity.mission + voice.attributes etc.
  mission: text('mission'),
  voiceTone: jsonb('voice_tone').$type<BrandVoiceTone>(),
  audiencePersonas: jsonb('audience_personas').$type<Persona[]>().default([]),
  valueProps: jsonb('value_props').$type<string[]>().default([]),
  competitors: jsonb('competitors').$type<string[]>().default([]),
  updatedByUserId: text('updated_by_user_id').references(() => user.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================================
// AUDIENCE — personas as first-class rows
// ============================================================================

export const brandPersonas = pgTable(
  'brand_personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    jobsToBeDone: jsonb('jobs_to_be_done').$type<string[]>().default([]),
    painPoints: jsonb('pain_points').$type<string[]>().default([]),
    demographics: jsonb('demographics').$type<Record<string, string>>(),
    psychographics: jsonb('psychographics').$type<Record<string, string>>(),
    channels: jsonb('channels').$type<string[]>().default([]),
    buyingTriggers: jsonb('buying_triggers').$type<string[]>().default([]),
    objections: jsonb('objections').$type<string[]>().default([]),
    rank: integer('rank').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index('brand_personas_org_idx').on(t.organizationId) }),
);

// ============================================================================
// OFFERING — value propositions + products/services
// ============================================================================

export const brandValuePropositions = pgTable(
  'brand_value_propositions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    proof: jsonb('proof').$type<string[]>().default([]),
    forPersonaId: uuid('for_persona_id').references(() => brandPersonas.id, {
      onDelete: 'set null',
    }),
    rank: integer('rank').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index('brand_value_props_org_idx').on(t.organizationId) }),
);

export const brandProducts = pgTable(
  'brand_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    productType: text('product_type'), // product, service, platform, feature
    description: text('description'),
    useCases: jsonb('use_cases').$type<string[]>().default([]),
    featuresBenefits: jsonb('features_benefits')
      .$type<{ feature: string; benefit: string }[]>()
      .default([]),
    pricingModel: text('pricing_model'),
    url: text('url'),
    rank: integer('rank').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index('brand_products_org_idx').on(t.organizationId) }),
);

// ============================================================================
// POSITIONING — competitors with how we differ
// ============================================================================

export const brandCompetitors = pgTable(
  'brand_competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    website: text('website'),
    competitorType: text('competitor_type').$type<'direct' | 'indirect' | 'alternative'>(),
    howWeDiffer: text('how_we_differ'),
    threatLevel: text('threat_level').$type<'low' | 'medium' | 'high'>(),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index('brand_competitors_org_idx').on(t.organizationId) }),
);

// ============================================================================
// INGESTION — raw inputs + text chunks (unchanged) + URL-only visual assets
// ============================================================================

export const brandIngestionSources = pgTable(
  'brand_ingestion_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'website' | 'pdf'>().notNull(),
    url: text('url'),
    storageKey: text('storage_key'),
    filename: text('filename'),
    status: text('status')
      .$type<'queued' | 'processing' | 'completed' | 'failed'>()
      .notNull()
      .default('queued'),
    error: text('error'),
    pageCount: integer('page_count').notNull().default(0),
    chunkCount: integer('chunk_count').notNull().default(0),
    // Free-form: { competitorId?: uuid, note?: string, ... }
    metadata: jsonb('metadata'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('brand_ingestion_sources_org_idx').on(t.organizationId),
    statusIdx: index('brand_ingestion_sources_status_idx').on(t.status),
  }),
);

// URL-only references. We do NOT host these — if the remote URL breaks, we re-ingest.
// The prior `storage_key`, `size_bytes`, `mime_type` columns are retained in migrations
// but we stop writing to them for images.
export const brandAssets = pgTable(
  'brand_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => brandIngestionSources.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind')
      .$type<'image' | 'logo' | 'favicon' | 'og_image' | 'color' | 'font'>()
      .notNull(),
    // Image-kind — remote URL we reference directly (no re-hosting)
    sourceUrl: text('source_url'),
    alt: text('alt'),
    // Kept nullable for future / legacy rows — not populated by new ingestion
    storageKey: text('storage_key'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    width: integer('width'),
    height: integer('height'),
    // Color-kind
    hex: text('hex'),
    role: text('role').$type<'primary' | 'secondary' | 'accent' | 'neutral' | 'semantic'>(),
    // Font-kind
    fontFamily: text('font_family'),
    fontProvider: text('font_provider'),
    fontUsage: text('font_usage').$type<'display' | 'body' | 'mono' | 'accent'>(),
    prominence: integer('prominence').notNull().default(0),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgKindIdx: index('brand_assets_org_kind_idx').on(t.organizationId, t.kind),
    sourceIdx: index('brand_assets_source_idx').on(t.sourceId),
  }),
);

export const brandMemory = pgTable(
  'brand_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => brandIngestionSources.id, {
      onDelete: 'cascade',
    }),
    sourceType: text('source_type').$type<BrandMemorySource>().notNull(),
    sourceUrl: text('source_url'),
    title: text('title'),
    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    embedding: vector('embedding', { dimensions: 1536 }),
    metadata: jsonb('metadata'),
    createdByUserId: text('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('brand_memory_org_idx').on(t.organizationId),
    sourceIdx: index('brand_memory_source_idx').on(t.sourceId),
    embeddingIdx: index('brand_memory_embedding_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
  }),
);
