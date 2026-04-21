import { db, emit, brandIngestionSources, brandMemory } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { eq } from 'drizzle-orm';
import { chunkText } from './chunking';
import { embedBrandMemoryChunks } from './embeddings';

type SourceRow = typeof brandIngestionSources.$inferSelect;

export async function markProcessing(sourceId: string): Promise<SourceRow> {
  const [row] = await db
    .update(brandIngestionSources)
    .set({ status: 'processing', startedAt: new Date() })
    .where(eq(brandIngestionSources.id, sourceId))
    .returning();
  if (!row) throw new Error(`source ${sourceId} not found`);
  await emit({
    organizationId: row.organizationId,
    type: EventType.BrandSourceProcessing,
    actor: { system: true },
    subject: { type: EventSubjectType.BrandSource, id: row.id },
    properties: {
      kind: row.kind,
      label: row.kind === 'website' ? row.url : row.filename,
    },
    message: `Processing ${row.kind === 'website' ? row.url : row.filename}`,
  });
  return row;
}

export async function markCompleted(sourceId: string, chunkCount: number, pageCount = 0) {
  const [row] = await db
    .update(brandIngestionSources)
    .set({
      status: 'completed',
      completedAt: new Date(),
      chunkCount,
      pageCount,
      error: null,
    })
    .where(eq(brandIngestionSources.id, sourceId))
    .returning();
  if (row) {
    await emit({
      organizationId: row.organizationId,
      type: EventType.BrandSourceCompleted,
      actor: { system: true },
      subject: { type: EventSubjectType.BrandSource, id: row.id },
      properties: {
        kind: row.kind,
        label: row.kind === 'website' ? row.url : row.filename,
        chunkCount,
        pageCount,
      },
      message: `Ingested ${chunkCount} chunks from ${row.kind === 'website' ? row.url : row.filename}`,
    });
  }
}

export async function markFailed(sourceId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const [row] = await db
    .update(brandIngestionSources)
    .set({ status: 'failed', completedAt: new Date(), error: message })
    .where(eq(brandIngestionSources.id, sourceId))
    .returning();
  if (row) {
    await emit({
      organizationId: row.organizationId,
      type: EventType.BrandSourceFailed,
      actor: { system: true },
      subject: { type: EventSubjectType.BrandSource, id: row.id },
      properties: {
        kind: row.kind,
        label: row.kind === 'website' ? row.url : row.filename,
        error: message,
      },
      message: `Failed to ingest ${row.kind === 'website' ? row.url : row.filename}: ${message}`,
    });
  }
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

  const batchSize = 100;
  const insertedIds: string[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const inserted = await db
      .insert(brandMemory)
      .values(rows.slice(i, i + batchSize))
      .returning({ id: brandMemory.id });
    for (const r of inserted) insertedIds.push(r.id);
  }

  // Embedding is best-effort; failures are logged in embedBrandMemoryChunks.
  // Fire-and-forget so ingestion's primary path stays fast.
  void embedBrandMemoryChunks({
    organizationId: params.organizationId,
    chunkIds: insertedIds,
  }).then((result) => {
    if (result.reason) {
      console.log(`[ingest] embedding skipped: ${result.reason}`);
    } else {
      console.log(`[ingest] embedded ${result.embedded}/${insertedIds.length} chunks`);
    }
  });

  return rows.length;
}
