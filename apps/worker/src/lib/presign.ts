import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, S3_BUCKET } from './s3';

/**
 * Generate a short-lived public URL for a stored object. Meta/Instagram requires the image
 * URL to be fetchable by their servers, so we can't use our auth'd /api/media proxy.
 * Presigned S3 GET works because MinIO supports the same signature format.
 */
export async function presignedMediaUrl(storageKey: string, ttlSeconds = 600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: storageKey });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSeconds });
}
