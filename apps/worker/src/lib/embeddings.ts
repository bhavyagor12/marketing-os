import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db, aiProviderCredentials, brandMemory } from '@marketing-os/db';
import { decryptSecret } from './crypto';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const EMBED_MODEL = 'voyage-2';
const EMBED_DIMS = 1536; // matches brand_memory.embedding column
const BATCH_SIZE = 32;

/**
 * Load a Voyage API key for an org. Looks up ai_provider_credentials first, falls back
 * to VOYAGE_API_KEY env var for dev. Returns null if neither available.
 */
async function loadVoyageKey(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ encryptedKey: aiProviderCredentials.encryptedKey })
    .from(aiProviderCredentials)
    .where(
      and(
        eq(aiProviderCredentials.organizationId, organizationId),
        eq(aiProviderCredentials.provider, 'voyage'),
      ),
    )
    .limit(1);
  if (row) return decryptSecret(row.encryptedKey);
  return process.env.VOYAGE_API_KEY ?? null;
}

async function embedTexts(params: { apiKey: string; texts: string[] }): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      input: params.texts,
      model: EMBED_MODEL,
      input_type: 'document',
    }),
  });
  const data = (await res.json()) as {
    data?: { embedding: number[]; index: number }[];
    detail?: string;
    error?: string;
  };
  if (!res.ok || !data.data) {
    throw new Error(`Voyage ${res.status}: ${data.detail ?? data.error ?? res.statusText}`);
  }
  // Sort by index to preserve input order
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/**
 * Embed a set of brand_memory chunks by id. Fire-and-forget-friendly; logs but doesn't throw
 * so a Voyage outage doesn't break ingestion.
 */
export async function embedBrandMemoryChunks(params: {
  organizationId: string;
  chunkIds: string[];
}): Promise<{ embedded: number; skipped: number; reason?: string }> {
  if (params.chunkIds.length === 0) return { embedded: 0, skipped: 0 };

  const apiKey = await loadVoyageKey(params.organizationId);
  if (!apiKey) {
    return {
      embedded: 0,
      skipped: params.chunkIds.length,
      reason: 'no Voyage API key — add one on Connections or set VOYAGE_API_KEY',
    };
  }

  const rows = await db
    .select({ id: brandMemory.id, content: brandMemory.content })
    .from(brandMemory)
    .where(
      and(
        eq(brandMemory.organizationId, params.organizationId),
        inArray(brandMemory.id, params.chunkIds),
        isNull(brandMemory.embedding),
      ),
    );

  let embedded = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const vectors = await embedTexts({
        apiKey,
        texts: batch.map((r) => r.content.slice(0, 8000)),
      });
      for (let j = 0; j < batch.length; j++) {
        const vec = vectors[j];
        if (!vec || vec.length !== EMBED_DIMS) continue;
        await db
          .update(brandMemory)
          .set({ embedding: vec as never })
          .where(eq(brandMemory.id, batch[j]!.id));
        embedded += 1;
      }
    } catch (err) {
      console.warn('[embeddings] batch failed', err);
      // Continue to next batch — partial success is better than nothing
    }
  }

  return { embedded, skipped: params.chunkIds.length - embedded };
}
