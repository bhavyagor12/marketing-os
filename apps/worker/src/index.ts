import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../../.env') });

import { Worker } from 'bullmq';
import { connection } from './queues';
import { processPublish } from './jobs/publish';
import { processAnalytics } from './jobs/analytics';
import { processIngestWebsite } from './jobs/ingest-website';
import { processIngestPdf } from './jobs/ingest-pdf';
import { processOutreachStep } from './jobs/outreach-step';
import { processVideoPoll } from './jobs/video-poll';

const publishWorker = new Worker('publish', processPublish, {
  connection,
  concurrency: 4,
});

const analyticsWorker = new Worker('analytics', processAnalytics, {
  connection,
  concurrency: 8,
});

const ingestWebsiteWorker = new Worker('ingest-website', processIngestWebsite, {
  connection,
  concurrency: 2,
});

const ingestPdfWorker = new Worker('ingest-pdf', processIngestPdf, {
  connection,
  concurrency: 2,
});

const outreachStepWorker = new Worker('outreach-step', processOutreachStep, {
  connection,
  concurrency: 4,
});

const videoPollWorker = new Worker('video-poll', processVideoPoll, {
  connection,
  concurrency: 4,
});

for (const [name, w] of [
  ['publish', publishWorker],
  ['analytics', analyticsWorker],
  ['ingest-website', ingestWebsiteWorker],
  ['ingest-pdf', ingestPdfWorker],
  ['outreach-step', outreachStepWorker],
  ['video-poll', videoPollWorker],
] as const) {
  w.on('ready', () => console.log(`[worker] ${name} ready`));
  w.on('failed', (job, err) => console.error(`[worker] ${name} failed id=${job?.id}`, err));
}

async function shutdown() {
  console.log('[worker] shutting down...');
  await Promise.all([
    publishWorker.close(),
    analyticsWorker.close(),
    ingestWebsiteWorker.close(),
    ingestPdfWorker.close(),
    outreachStepWorker.close(),
    videoPollWorker.close(),
  ]);
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
