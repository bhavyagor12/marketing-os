import type { Job } from 'bullmq';
import type { AnalyticsJob } from '../queues';

export async function processAnalytics(job: Job<AnalyticsJob>) {
  const { commitId, platform, externalPostId } = job.data;
  console.log(`[analytics] polling ${platform} postId=${externalPostId} commit=${commitId}`);

  // TODO:
  //   1. call platform analytics API
  //   2. upsert into commit_metrics
  //   3. reschedule self on a decaying cadence (1h, 6h, 24h, 7d)

  return { ok: true };
}
