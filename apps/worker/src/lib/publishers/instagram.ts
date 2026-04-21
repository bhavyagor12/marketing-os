/**
 * Instagram Business publisher via Graph API.
 *
 * Two-step flow:
 *   1. POST /{ig-user-id}/media with image_url (publicly fetchable) + caption → creation_id
 *   2. POST /{ig-user-id}/media_publish with creation_id → published media id
 *
 * Requires:
 *   - image_url to be publicly accessible. We use presigned S3 URLs (short-lived).
 *   - Asset payload to have at least one mediaBlob attached (image or carousel).
 *   - URLs in caption are tracker-wrapped for attribution.
 */
import { eq } from 'drizzle-orm';
import { db, mediaBlobs } from '@marketing-os/db';
import type { AssetPayload } from '@marketing-os/shared';
import { presignedMediaUrl } from '../presign';
import { wrapUrlsWithTracking } from '../tracking';

const IG_API = 'https://graph.facebook.com/v19.0';

export type IGPublishResult = {
  externalPostId: string;
  externalUrl: string;
};

export async function publishToInstagram(params: {
  accessToken: string;
  instagramUserId: string;
  commitId: string;
  payload: AssetPayload;
}): Promise<IGPublishResult> {
  if (params.payload.kind === 'image') {
    if (params.payload.blobIds.length === 0) {
      throw new Error('Instagram image post needs at least one attached image.');
    }
    return publishSingleImage({
      accessToken: params.accessToken,
      igId: params.instagramUserId,
      blobId: params.payload.blobIds[0]!,
      caption: wrapUrlsWithTracking(params.payload.caption, params.commitId),
    });
  }
  if (params.payload.kind === 'video') {
    return publishVideo({
      accessToken: params.accessToken,
      igId: params.instagramUserId,
      blobId: params.payload.blobId,
      caption: wrapUrlsWithTracking(params.payload.caption, params.commitId),
    });
  }
  if (params.payload.kind === 'carousel') {
    if (params.payload.slides.length < 2) {
      throw new Error('Instagram carousel requires 2+ slides.');
    }
    return publishCarousel({
      accessToken: params.accessToken,
      igId: params.instagramUserId,
      slides: params.payload.slides,
      caption: wrapUrlsWithTracking(
        params.payload.slides[0]?.caption ?? '',
        params.commitId,
      ),
    });
  }
  throw new Error(
    `Instagram requires an image, video, or carousel asset — got ${params.payload.kind}. Generate one on this commit first.`,
  );
}

async function publishSingleImage(params: {
  accessToken: string;
  igId: string;
  blobId: string;
  caption: string;
}): Promise<IGPublishResult> {
  const imageUrl = await presignedUrlForBlob(params.blobId);
  const container = await createContainer(params.accessToken, params.igId, {
    image_url: imageUrl,
    caption: params.caption,
  });
  return publishContainer(params.accessToken, params.igId, container);
}

async function publishVideo(params: {
  accessToken: string;
  igId: string;
  blobId: string;
  caption: string;
}): Promise<IGPublishResult> {
  const videoUrl = await presignedUrlForBlob(params.blobId);
  const container = await createContainer(params.accessToken, params.igId, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption: params.caption,
  });
  // Video containers take time to process; Meta recommends polling container status.
  // For MVP we try publish after a short wait and rely on retry if it errors.
  await new Promise((r) => setTimeout(r, 20_000));
  return publishContainer(params.accessToken, params.igId, container);
}

async function publishCarousel(params: {
  accessToken: string;
  igId: string;
  slides: { blobId: string; caption?: string }[];
  caption: string;
}): Promise<IGPublishResult> {
  // 1. Create an item container for each slide
  const childIds: string[] = [];
  for (const slide of params.slides) {
    const slideUrl = await presignedUrlForBlob(slide.blobId);
    const id = await createContainer(params.accessToken, params.igId, {
      image_url: slideUrl,
      is_carousel_item: 'true',
    });
    childIds.push(id);
  }
  // 2. Create a carousel container pointing at the child ids
  const parent = await createContainer(params.accessToken, params.igId, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption: params.caption,
  });
  return publishContainer(params.accessToken, params.igId, parent);
}

async function presignedUrlForBlob(blobId: string): Promise<string> {
  const [blob] = await db.select().from(mediaBlobs).where(eq(mediaBlobs.id, blobId)).limit(1);
  if (!blob) throw new Error(`media blob ${blobId} not found`);
  return presignedMediaUrl(blob.storageKey, 600);
}

async function createContainer(
  accessToken: string,
  igId: string,
  params: Record<string, string>,
): Promise<string> {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${IG_API}/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as {
    id?: string;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || !data.id) {
    throw new Error(`Instagram /media ${res.status}: ${data.error?.message ?? res.statusText}`);
  }
  return data.id;
}

async function publishContainer(
  accessToken: string,
  igId: string,
  creationId: string,
): Promise<IGPublishResult> {
  const body = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });
  const res = await fetch(`${IG_API}/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(
      `Instagram /media_publish ${res.status}: ${data.error?.message ?? res.statusText}`,
    );
  }
  return {
    externalPostId: data.id,
    externalUrl: `https://www.instagram.com/p/${data.id}/`,
  };
}
