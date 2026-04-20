import type { Job } from 'bullmq';
import type { PublishJob } from '../queues';

// Platform-specific publishers will live under ../publishers/{x,linkedin,instagram,email}.ts
// and be dispatched based on the publish row's platform field.

export async function processPublish(job: Job<PublishJob>) {
  const { publishId, organizationId } = job.data;
  console.log(`[publish] processing publishId=${publishId} org=${organizationId}`);

  // TODO:
  //   1. load publish row + social_connection + commit/asset
  //   2. decrypt access token
  //   3. dispatch to platform publisher
  //   4. update publish row status + external_post_id
  //   5. enqueue analytics poll

  return { ok: true };
}
