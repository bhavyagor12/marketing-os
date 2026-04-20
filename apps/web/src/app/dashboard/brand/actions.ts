'use server';

import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import {
  db,
  emit,
  brandIngestionSources,
  brandProfiles,
  brandPersonas,
  brandValuePropositions,
  brandProducts,
  brandCompetitors,
} from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';
import { uploadBlob } from '@/lib/s3';

async function enqueue(queue: 'ingest-website' | 'ingest-pdf', data: unknown) {
  const { Queue } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const q = new Queue(queue, { connection });
  try {
    await q.add('run', data, { removeOnComplete: 100, removeOnFail: 500 });
  } finally {
    await q.close();
    await connection.quit();
  }
}

export async function addWebsiteSource(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();
  const raw = String(formData.get('url') ?? '').trim();
  if (!raw) return { error: 'URL is required' };

  let url: string;
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return { error: 'Only http(s) URLs are supported' };
    url = u.toString();
  } catch {
    return { error: 'Invalid URL' };
  }

  const [row] = await db
    .insert(brandIngestionSources)
    .values({
      organizationId: activeOrgId,
      kind: 'website',
      url,
      status: 'queued',
      createdByUserId: session.user.id,
    })
    .returning();

  await enqueue('ingest-website', {
    sourceId: row!.id,
    organizationId: activeOrgId,
    url,
    userId: session.user.id,
  });

  await emit({
    organizationId: activeOrgId,
    type: EventType.BrandSourceAdded,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.BrandSource, id: row!.id },
    properties: { kind: 'website', url },
    message: `Added website source ${url}`,
  });

  revalidatePath('/dashboard/brand');
  return { ok: true };
}

export async function addPdfSource(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No file provided' };
  if (file.size === 0) return { error: 'Empty file' };
  if (file.size > 25 * 1024 * 1024) return { error: 'PDF must be under 25MB' };
  if (!/pdf/.test(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Only PDF files are accepted' };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const storageKey = `brand/${activeOrgId}/${uuidv4()}.pdf`;

  await uploadBlob({
    key: storageKey,
    body: bytes,
    contentType: 'application/pdf',
  });

  const [row] = await db
    .insert(brandIngestionSources)
    .values({
      organizationId: activeOrgId,
      kind: 'pdf',
      storageKey,
      filename: file.name,
      status: 'queued',
      createdByUserId: session.user.id,
    })
    .returning();

  await enqueue('ingest-pdf', {
    sourceId: row!.id,
    organizationId: activeOrgId,
    storageKey,
    filename: file.name,
    userId: session.user.id,
  });

  await emit({
    organizationId: activeOrgId,
    type: EventType.BrandSourceAdded,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.BrandSource, id: row!.id },
    properties: { kind: 'pdf', filename: file.name, sizeBytes: file.size },
    message: `Uploaded PDF ${file.name}`,
  });

  revalidatePath('/dashboard/brand');
  return { ok: true };
}

export async function listSources() {
  const { activeOrgId } = await requireOrgSession();
  const rows = await db
    .select()
    .from(brandIngestionSources)
    .where(eq(brandIngestionSources.organizationId, activeOrgId))
    .orderBy(desc(brandIngestionSources.createdAt))
    .limit(50);
  return rows;
}

export async function deleteSource(id: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(brandIngestionSources)
    .where(eq(brandIngestionSources.id, id))
    .limit(1);
  await db
    .delete(brandIngestionSources)
    .where(eq(brandIngestionSources.id, id));
  if (row) {
    await emit({
      organizationId: activeOrgId,
      type: EventType.BrandSourceDeleted,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.BrandSource, id },
      properties: {
        kind: row.kind,
        label: row.kind === 'website' ? row.url : row.filename,
      },
      message: `Deleted ${row.kind === 'website' ? row.url : row.filename}`,
    });
  }
  revalidatePath('/dashboard/brand');
  return { ok: true };
}

type BrandProfileOutput = {
  identity?: Record<string, unknown>;
  positioning?: Record<string, unknown>;
  voice?: Record<string, unknown>;
  strategy?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  personas?: Array<Record<string, unknown>>;
  valuePropositions?: Array<Record<string, unknown>>;
  products?: Array<Record<string, unknown>>;
  competitors?: Array<Record<string, unknown>>;
};

export async function generateBrandProfile() {
  const { session, activeOrgId } = await requireOrgSession();
  const agentsUrl =
    process.env.AGENTS_URL ?? process.env.NEXT_PUBLIC_AGENTS_URL ?? 'http://localhost:8000';
  const token = process.env.AGENTS_INTERNAL_TOKEN;
  if (!token) return { error: 'AGENTS_INTERNAL_TOKEN is not configured' };

  const res = await fetch(`${agentsUrl}/agents/brand_summarize/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': token,
    },
    body: JSON.stringify({ organization_id: activeOrgId }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `agents service error: ${res.status} ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { profile?: BrandProfileOutput };
  const profile = data.profile;
  if (!profile) return { error: 'agent returned no profile' };

  const identity = (profile.identity ?? {}) as Record<string, unknown>;
  const missionShort = (identity.mission ?? identity.tagline ?? '') as string;

  // Upsert the central profile
  await db
    .insert(brandProfiles)
    .values({
      organizationId: activeOrgId,
      identity: (profile.identity ?? null) as never,
      positioning: (profile.positioning ?? null) as never,
      voice: (profile.voice ?? null) as never,
      strategy: (profile.strategy ?? null) as never,
      constraints: (profile.constraints ?? null) as never,
      mission: missionShort || null,
      voiceTone: (profile.voice ?? null) as never,
      updatedByUserId: session.user.id,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: brandProfiles.organizationId,
      set: {
        identity: (profile.identity ?? null) as never,
        positioning: (profile.positioning ?? null) as never,
        voice: (profile.voice ?? null) as never,
        strategy: (profile.strategy ?? null) as never,
        constraints: (profile.constraints ?? null) as never,
        mission: missionShort || null,
        voiceTone: (profile.voice ?? null) as never,
        updatedByUserId: session.user.id,
        updatedAt: new Date(),
      },
    });

  // Replace personas / value props / products / competitors (regenerate = full refresh)
  await db.delete(brandPersonas).where(eq(brandPersonas.organizationId, activeOrgId));
  await db
    .delete(brandValuePropositions)
    .where(eq(brandValuePropositions.organizationId, activeOrgId));
  await db.delete(brandProducts).where(eq(brandProducts.organizationId, activeOrgId));
  await db.delete(brandCompetitors).where(eq(brandCompetitors.organizationId, activeOrgId));

  const personaRows = (profile.personas ?? []).map((p, i) => ({
    organizationId: activeOrgId,
    name: String(p.name ?? `Persona ${i + 1}`),
    description: (p.description as string) ?? null,
    jobsToBeDone: (p.jobsToBeDone as string[]) ?? [],
    painPoints: (p.painPoints as string[]) ?? [],
    demographics: (p.demographics as Record<string, string>) ?? null,
    psychographics: (p.psychographics as Record<string, string>) ?? null,
    channels: (p.channels as string[]) ?? [],
    buyingTriggers: (p.buyingTriggers as string[]) ?? [],
    objections: (p.objections as string[]) ?? [],
    rank: i,
  }));
  if (personaRows.length) {
    await db.insert(brandPersonas).values(personaRows as never);
  }

  const vpRows = (profile.valuePropositions ?? []).map((v, i) => ({
    organizationId: activeOrgId,
    title: String(v.title ?? `Value ${i + 1}`),
    description: (v.description as string) ?? null,
    proof: (v.proof as string[]) ?? [],
    rank: i,
  }));
  if (vpRows.length) {
    await db.insert(brandValuePropositions).values(vpRows as never);
  }

  const productRows = (profile.products ?? []).map((p, i) => ({
    organizationId: activeOrgId,
    name: String(p.name ?? `Product ${i + 1}`),
    productType: (p.productType as string) ?? null,
    description: (p.description as string) ?? null,
    useCases: (p.useCases as string[]) ?? [],
    featuresBenefits:
      (p.featuresBenefits as Array<{ feature: string; benefit: string }>) ?? [],
    pricingModel: (p.pricingModel as string) ?? null,
    url: (p.url as string) ?? null,
    rank: i,
  }));
  if (productRows.length) {
    await db.insert(brandProducts).values(productRows as never);
  }

  const competitorRows = (profile.competitors ?? []).map((c) => ({
    organizationId: activeOrgId,
    name: String(c.name ?? 'Unknown'),
    website: (c.website as string) ?? null,
    competitorType: (c.competitorType as 'direct' | 'indirect' | 'alternative') ?? null,
    howWeDiffer: (c.howWeDiffer as string) ?? null,
    threatLevel: (c.threatLevel as 'low' | 'medium' | 'high') ?? null,
  }));
  if (competitorRows.length) {
    await db.insert(brandCompetitors).values(competitorRows as never);
  }

  await emit({
    organizationId: activeOrgId,
    type: EventType.BrandProfileGenerated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.BrandProfile, id: activeOrgId },
    properties: {
      personas: personaRows.length,
      valuePropositions: vpRows.length,
      products: productRows.length,
      competitors: competitorRows.length,
    },
    message: `Generated brand profile (${personaRows.length} personas, ${vpRows.length} value props)`,
  });

  revalidatePath('/dashboard/brand');
  return { ok: true };
}
