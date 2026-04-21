import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  db,
  emit,
  publishes,
  socialConnections,
  commits,
  assets,
} from '@marketing-os/db';
import { EventType, EventSubjectType, type AssetPayload } from '@marketing-os/shared';
import type { PublishJob } from '../queues';
import { decryptSecret } from '../lib/crypto';
import { publishToX } from '../lib/publishers/x';
import { publishToEmail } from '../lib/publishers/resend';
import { publishToLinkedIn } from '../lib/publishers/linkedin';

export async function processPublish(job: Job<PublishJob>) {
  const { publishId, organizationId } = job.data;
  console.log(`[publish] processing publishId=${publishId} org=${organizationId}`);

  const [pub] = await db.select().from(publishes).where(eq(publishes.id, publishId)).limit(1);
  if (!pub) {
    console.error(`[publish] publish row ${publishId} not found`);
    return { ok: false, reason: 'publish row missing' };
  }
  if (pub.status !== 'pending') {
    console.log(`[publish] skipping ${publishId} (status=${pub.status})`);
    return { ok: false, reason: `not pending (${pub.status})` };
  }

  const [connection] = await db
    .select()
    .from(socialConnections)
    .where(eq(socialConnections.id, pub.socialConnectionId))
    .limit(1);
  if (!connection) {
    await failPublish(pub.id, 'social connection not found');
    return { ok: false };
  }
  if (connection.status !== 'active') {
    await failPublish(pub.id, `connection is ${connection.status}`);
    return { ok: false };
  }

  const [commit] = await db.select().from(commits).where(eq(commits.id, pub.commitId)).limit(1);
  const [asset] = await db.select().from(assets).where(eq(assets.commitId, pub.commitId)).limit(1);
  if (!commit || !asset) {
    await failPublish(pub.id, 'commit/asset missing');
    return { ok: false };
  }

  await db
    .update(publishes)
    .set({ status: 'publishing', attemptCount: (pub.attemptCount ?? 0) + 1 })
    .where(eq(publishes.id, pub.id));

  try {
    const accessToken = decryptSecret(connection.encryptedAccessToken);

    let result: { externalPostId: string; externalUrl: string };
    if (connection.platform === 'x') {
      const out = await publishToX({
        accessToken,
        commitId: commit.id,
        payload: asset.payload as AssetPayload,
        handleForUrl: connection.accountHandle,
      });
      result = { externalPostId: out.externalPostId, externalUrl: out.externalUrl };
    } else if (connection.platform === 'email') {
      const meta = (pub.metadata ?? {}) as { recipient?: string };
      if (!meta.recipient) {
        throw new Error('email publish requires publishes.metadata.recipient');
      }
      const connMeta = (connection.scopes as unknown as string[]).length
        ? null
        : null;
      // Resend connections store from-address in accountHandle and from-name in externalAccountId.
      const out = await publishToEmail({
        apiKey: accessToken,
        fromAddress: connection.accountHandle,
        fromName: connection.externalAccountId || null,
        recipient: meta.recipient,
        commitId: commit.id,
        payload: asset.payload as AssetPayload,
        pixelBaseUrl: process.env.TRACKING_BASE_URL ?? 'http://localhost:3000',
      });
      result = out;
      void connMeta; // silence unused
    } else if (connection.platform === 'linkedin') {
      const out = await publishToLinkedIn({
        accessToken,
        personSub: connection.externalAccountId,
        commitId: commit.id,
        payload: asset.payload as AssetPayload,
      });
      result = out;
    } else {
      throw new Error(`publisher for ${connection.platform} not implemented yet`);
    }

    await db
      .update(publishes)
      .set({
        status: 'published',
        externalPostId: result.externalPostId,
        externalUrl: result.externalUrl,
        publishedAt: new Date(),
        error: null,
      })
      .where(eq(publishes.id, pub.id));

    await emit({
      organizationId,
      type: EventType.PublishSent,
      actor: { system: true },
      subject: { type: EventSubjectType.Publish, id: pub.id },
      campaignId: commit.campaignId,
      commitId: commit.id,
      assetId: asset.id,
      platform: connection.platform,
      externalId: result.externalPostId,
      properties: { url: result.externalUrl },
      message: `Published to ${connection.platform} (@${connection.accountHandle})`,
    });

    return { ok: true, externalPostId: result.externalPostId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failPublish(pub.id, message);
    await emit({
      organizationId,
      type: EventType.PublishFailed,
      actor: { system: true },
      subject: { type: EventSubjectType.Publish, id: pub.id },
      campaignId: commit.campaignId,
      commitId: commit.id,
      assetId: asset.id,
      platform: connection.platform,
      properties: { error: message },
      message: `Publish to ${connection.platform} failed: ${message}`,
    });
    throw err;
  }
}

async function failPublish(publishId: string, error: string) {
  await db
    .update(publishes)
    .set({ status: 'failed', error })
    .where(eq(publishes.id, publishId));
}
