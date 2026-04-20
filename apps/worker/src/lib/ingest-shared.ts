import { db, brandIngestionSources, brandMemory } from '@marketing-os/db';
import { eq } from 'drizzle-orm';
import { chunkText } from './chunking';

type SourceRow = typeof brandIngestionSources.$inferSelect;

export async function markProcessing(sourceId: string): Promise<SourceRow> {
  const [row] = await db
    .update(brandIngestionSources)
    .set({ status: 'processing', startedAt: new Date() })
    .where(eq(brandIngestionSources.id, sourceId))
    .returning();
  if (!row) throw new Error(`source ${sourceId} not found`);
  return row;
}

export async function markCompleted(sourceId: string, chunkCount: number, pageCount = 0) {
  await db
    .update(brandIngestionSources)
    .set({
      status: 'completed',
      completedAt: new Date(),
      chunkCount,
      pageCount,
      error: null,
    })
    .where(eq(brandIngestionSources.id, sourceId));
}

export async function markFailed(sourceId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  await db
    .update(brandIngestionSources)
    .set({ status: 'failed', completedAt: new Date(), error: message })
    .where(eq(brandIngestionSources.id, sourceId));
}

export async function saveChunks(params: {
  organizationId: string;
  sourceId: string;
  sourceType: 'website' | 'pdf';
  sourceUrl: string | null;
  title: string | null;
  createdByUserId: string | null;
  text: string;
}): Promise<number> {
  const chunks = chunkText(params.text);
  if (chunks.length === 0) return 0;

  const rows = chunks.map((content, chunkIndex) => ({
    organizationId: params.organizationId,
    sourceId: params.sourceId,
    sourceType: params.sourceType,
    sourceUrl: params.sourceUrl,
    title: params.title,
    content,
    chunkIndex,
    embedding: null,
    metadata: null,
    createdByUserId: params.createdByUserId,
  }));

  // Batch insert — Drizzle splits large arrays automatically but cap to be safe.
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    await db.insert(brandMemory).values(rows.slice(i, i + batchSize));
  }
  return rows.length;
}
