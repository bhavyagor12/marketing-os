import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db, mediaBlobs } from '@marketing-os/db';
import { auth } from '@/lib/auth';
import { s3, S3_BUCKET } from '@/lib/s3';

export const runtime = 'nodejs';

/**
 * Auth-scoped proxy for media blobs. We don't make the MinIO bucket public;
 * every image request goes through this route with an org-membership check.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse('unauthorized', { status: 401 });

  const [blob] = await db.select().from(mediaBlobs).where(eq(mediaBlobs.id, id)).limit(1);
  if (!blob) return new NextResponse('not found', { status: 404 });
  if (blob.organizationId !== session.session.activeOrganizationId) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const res = await s3.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: blob.storageKey }),
  );
  const stream = res.Body as ReadableStream<Uint8Array> | undefined;
  if (!stream) return new NextResponse('empty body', { status: 502 });

  return new NextResponse(stream, {
    headers: {
      'content-type': blob.mimeType,
      'content-length': String(blob.sizeBytes),
      'cache-control': 'private, max-age=3600',
    },
  });
}
