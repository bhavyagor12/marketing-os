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

export const publishQueue = new Queue<PublishJob>('publish', { connection });
export const analyticsQueue = new Queue<AnalyticsJob>('analytics', { connection });
