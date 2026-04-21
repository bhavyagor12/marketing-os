'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, emit, brandCompetitors, brandIngestionSources } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';

async function enqueueIngestWebsite(data: {
  sourceId: string;
  organizationId: string;
  url: string;
  userId: string;
}) {
  const { Queue } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const q = new Queue('ingest-website', { connection });
  try {
    await q.add('run', data, { removeOnComplete: 100, removeOnFail: 500 });
  } finally {
    await q.close();
    await connection.quit();
  }
}

/**
 * Kick off a crawl of a competitor's site. The resulting brand_memory chunks will be tagged
 * source_type='competitor' (via the metadata hint the worker reads), so agents can retrieve
 * them with explicit provenance and differentiate-against signals.
 */
export async function scanCompetitorSite(competitorId: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [competitor] = await db
    .select()
    .from(brandCompetitors)
    .where(
      and(
        eq(brandCompetitors.id, competitorId),
        eq(brandCompetitors.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!competitor) return { error: 'competitor not found' };
  if (!competitor.website) return { error: 'competitor has no website on record' };

  let url: string;
  try {
    const u = new URL(
      competitor.website.startsWith('http')
        ? competitor.website
        : `https://${competitor.website}`,
    );
    url = u.toString();
  } catch {
    return { error: 'competitor website is not a valid URL' };
  }

  const [row] = await db
    .insert(brandIngestionSources)
    .values({
      organizationId: activeOrgId,
      kind: 'website',
      url,
      status: 'queued',
      metadata: { competitorId, competitorName: competitor.name } as never,
      createdByUserId: session.user.id,
    })
    .returning();

  await enqueueIngestWebsite({
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
    properties: { kind: 'competitor', url, competitorId, competitorName: competitor.name },
    message: `Scanning competitor ${competitor.name}`,
  });

  revalidatePath('/dashboard/brand');
  return { ok: true, sourceId: row!.id };
}
