import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

export type PublishJob = {
  publishId: string;
  organizationId: string;
};

export type AnalyticsJob = {
  organizationId: string;
  commitId: string;
  platform: string;
  externalPostId: string;
};

export type IngestWebsiteJob = {
  sourceId: string;
  organizationId: string;
  url: string;
  userId: string;
};

export type IngestPdfJob = {
  sourceId: string;
  organizationId: string;
  storageKey: string;
  filename: string;
  userId: string;
};

export const publishQueue = new Queue<PublishJob>('publish', { connection });
export const analyticsQueue = new Queue<AnalyticsJob>('analytics', { connection });
export const ingestWebsiteQueue = new Queue<IngestWebsiteJob>('ingest-website', { connection });
export const ingestPdfQueue = new Queue<IngestPdfJob>('ingest-pdf', { connection });

export type OutreachStepJob = {
  enrollmentId: string;
  organizationId: string;
};

export const outreachStepQueue = new Queue<OutreachStepJob>('outreach-step', { connection });

export type VideoPollJob = {
  organizationId: string;
  agentRunId: string;
  campaignId: string;
  parentCommitId: string;
  videoId: string;
  script: string;
  userId: string;
  pollAttempt: number;
};

export const videoPollQueue = new Queue<VideoPollJob>('video-poll', { connection });
