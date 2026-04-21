import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import { db, mediaBlobs } from '@marketing-os/db';
import { uploadBlob } from './s3';

/**
 * Fetch a remote image URL, upload it to our S3 (content-addressed), and insert the
 * media_blobs row if new. Returns the blob id (new or deduped) for attachment to an
 * asset payload.
 */
export async function ingestRemoteImage(params: {
  organizationId: string;
  url: string;
  createdByUserId: string;
  sourceLabel?: string;
}): Promise<{
  blobId: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  deduped: boolean;
}> {
  const res = await fetch(params.url, {
    headers: { accept: 'image/*' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch image failed: ${res.status} ${res.statusText}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 100) throw new Error('fetched image is too small');
  if (buf.byteLength > 25 * 1024 * 1024) throw new Error('image exceeds 25MB cap');

  const mimeType = res.headers.get('content-type') ?? 'image/png';
  const contentHash = crypto.createHash('sha256').update(buf).digest('hex');

  // Content-addressed dedup — if this org already has the bytes, reuse.
  const [existing] = await db
    .select()
    .from(mediaBlobs)
    .where(
      and(
        eq(mediaBlobs.organizationId, params.organizationId),
        eq(mediaBlobs.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      blobId: existing.id,
      mimeType: existing.mimeType,
      sizeBytes: existing.sizeBytes,
      contentHash,
      deduped: true,
    };
  }

  const ext = extensionFor(mimeType);
  const storageKey = `media/${params.organizationId}/${uuidv4()}.${ext}`;
  await uploadBlob({ key: storageKey, body: buf, contentType: mimeType });

  const [row] = await db
    .insert(mediaBlobs)
    .values({
      organizationId: params.organizationId,
      contentHash,
      mimeType,
      sizeBytes: buf.byteLength,
      storageKey,
      createdByUserId: params.createdByUserId,
    })
    .returning();

  return {
    blobId: row!.id,
    mimeType,
    sizeBytes: buf.byteLength,
    contentHash,
    deduped: false,
  };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'bin';
}
