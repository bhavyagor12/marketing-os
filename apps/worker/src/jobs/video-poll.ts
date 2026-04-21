import crypto from 'node:crypto';
import type { Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import {
  db,
  emit,
  agentRuns,
  assets,
  branches,
  commits,
  mediaBlobs,
} from '@marketing-os/db';
import { EventType, EventSubjectType, type AssetPayload } from '@marketing-os/shared';
import type { VideoPollJob } from '../queues';
import { videoPollQueue } from '../queues';
import { uploadBlob } from '../lib/s3';

const AGENTS_URL =
  process.env.AGENTS_URL ?? process.env.NEXT_PUBLIC_AGENTS_URL ?? 'http://localhost:8000';
const POLL_DELAY_MS = 45_000;
const MAX_POLL_ATTEMPTS = 30; // ~22 minutes upper bound

/**
 * Poll HeyGen for a submitted video generation. When complete, download the MP4, upload to
 * our S3, insert a media_blobs row, create a new child commit with a `video` asset payload,
 * and close out the agent_run.
 */
export async function processVideoPoll(job: Job<VideoPollJob>) {
  const data = job.data;
  console.log(`[video-poll] videoId=${data.videoId} attempt=${data.pollAttempt}`);

  const status = await callAgent('/agents/video/status', {
    organization_id: data.organizationId,
    video_id: data.videoId,
  });

  const state = String(status.status ?? '').toLowerCase();

  if (state === 'completed') {
    const videoUrl = String(status.video_url ?? '');
    if (!videoUrl) {
      return failRun(data, 'HeyGen reported completed but no video_url');
    }
    try {
      const res = await fetch(videoUrl, { redirect: 'follow' });
      if (!res.ok) throw new Error(`download failed ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength < 1024) throw new Error('downloaded video too small');
      const mimeType = res.headers.get('content-type') ?? 'video/mp4';
      const contentHash = crypto.createHash('sha256').update(bytes).digest('hex');

      const storageKey = `media/${data.organizationId}/video/${uuidv4()}.mp4`;
      await uploadBlob({ key: storageKey, body: bytes, contentType: mimeType });

      const [blob] = await db
        .insert(mediaBlobs)
        .values({
          organizationId: data.organizationId,
          contentHash,
          mimeType,
          sizeBytes: bytes.byteLength,
          storageKey,
          durationSeconds: Math.round(Number(status.duration ?? 0)) || null,
          createdByUserId: data.userId,
        })
        .returning();

      // New child commit off the parent with a video payload.
      const [parent] = await db
        .select()
        .from(commits)
        .where(eq(commits.id, data.parentCommitId))
        .limit(1);
      if (!parent) throw new Error('parent commit disappeared');

      const payload: AssetPayload = {
        kind: 'video',
        caption: data.script.slice(0, 1000),
        blobId: blob!.id,
      };
      const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');

      const [commit] = await db
        .insert(commits)
        .values({
          campaignId: data.campaignId,
          branchId: parent.branchId,
          parentCommitId: parent.id,
          contentHash: hash,
          message: `Video: ${data.script.slice(0, 80)}`,
          authorUserId: data.userId,
          authoredBy: 'agent',
          agentRunId: data.agentRunId,
          planItemIndex: parent.planItemIndex,
          variantLabel: parent.variantLabel,
        })
        .returning();

      const [asset] = await db
        .insert(assets)
        .values({
          commitId: commit!.id,
          contentType: 'video',
          platforms: ['x'],
          payload,
        })
        .returning();

      await db
        .update(branches)
        .set({ headCommitId: commit!.id })
        .where(eq(branches.id, parent.branchId));

      await db
        .update(agentRuns)
        .set({
          status: 'succeeded',
          completedAt: new Date(),
          output: {
            commitId: commit!.id,
            assetId: asset!.id,
            blobId: blob!.id,
            heygenVideoId: data.videoId,
            videoUrl,
          } as never,
        })
        .where(eq(agentRuns.id, data.agentRunId));

      await emit({
        organizationId: data.organizationId,
        type: EventType.AgentRunCompleted,
        actor: { system: true },
        subject: { type: EventSubjectType.AgentRun, id: data.agentRunId },
        campaignId: data.campaignId,
        commitId: commit!.id,
        assetId: asset!.id,
        properties: { kind: 'video', heygenVideoId: data.videoId },
        message: 'Video ready',
      });
      await emit({
        organizationId: data.organizationId,
        type: EventType.AssetCreated,
        actor: { system: true },
        subject: { type: EventSubjectType.Asset, id: asset!.id },
        campaignId: data.campaignId,
        commitId: commit!.id,
        assetId: asset!.id,
        properties: { kind: 'video' },
      });

      return { ok: true, commitId: commit!.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failRun(data, `download/store failed: ${message}`);
    }
  }

  if (state === 'failed') {
    return failRun(data, String(status.error ?? 'HeyGen reported failed'));
  }

  // still rendering — re-enqueue with delay
  if (data.pollAttempt >= MAX_POLL_ATTEMPTS) {
    return failRun(data, `exceeded ${MAX_POLL_ATTEMPTS} poll attempts — render still pending`);
  }
  await videoPollQueue.add(
    'poll',
    { ...data, pollAttempt: data.pollAttempt + 1 },
    {
      delay: POLL_DELAY_MS,
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
  return { ok: true, stillRendering: true };
}

async function failRun(data: VideoPollJob, reason: string) {
  console.error(`[video-poll] failed ${data.videoId}: ${reason}`);
  await db
    .update(agentRuns)
    .set({ status: 'failed', completedAt: new Date(), error: reason })
    .where(eq(agentRuns.id, data.agentRunId));
  await emit({
    organizationId: data.organizationId,
    type: EventType.AgentRunFailed,
    actor: { system: true },
    subject: { type: EventSubjectType.AgentRun, id: data.agentRunId },
    campaignId: data.campaignId,
    commitId: data.parentCommitId,
    properties: { kind: 'video', heygenVideoId: data.videoId, error: reason },
    message: `Video generation failed: ${reason}`,
  });
  return { ok: false, reason };
}

async function callAgent(path: string, body: unknown): Promise<Record<string, unknown>> {
  const token = process.env.AGENTS_INTERNAL_TOKEN;
  if (!token) throw new Error('AGENTS_INTERNAL_TOKEN not set');
  const res = await fetch(`${AGENTS_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agents ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}
