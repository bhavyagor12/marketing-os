import { Worker } from 'bullmq';
import { connection } from './queues';
import { processPublish } from './jobs/publish';
import { processAnalytics } from './jobs/analytics';

const publishWorker = new Worker('publish', processPublish, {
  connection,
  concurrency: 4,
});

const analyticsWorker = new Worker('analytics', processAnalytics, {
  connection,
  concurrency: 8,
});

publishWorker.on('ready', () => console.log('[worker] publish ready'));
analyticsWorker.on('ready', () => console.log('[worker] analytics ready'));

publishWorker.on('failed', (job, err) =>
  console.error(`[worker] publish failed id=${job?.id}`, err),
);
analyticsWorker.on('failed', (job, err) =>
  console.error(`[worker] analytics failed id=${job?.id}`, err),
);

async function shutdown() {
  console.log('[worker] shutting down...');
  await publishWorker.close();
  await analyticsWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
