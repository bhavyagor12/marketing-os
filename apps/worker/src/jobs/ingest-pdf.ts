import type { Job } from 'bullmq';
import { extractText, getDocumentProxy } from 'unpdf';
import type { IngestPdfJob } from '../queues';
import { downloadBlob } from '../lib/s3';
import { markProcessing, markCompleted, markFailed, saveChunks } from '../lib/ingest-shared';

export async function processIngestPdf(job: Job<IngestPdfJob>) {
  const { sourceId, organizationId, storageKey, filename, userId } = job.data;
  console.log(`[ingest-pdf] source=${sourceId} key=${storageKey}`);

  try {
    await markProcessing(sourceId);

    const bytes = await downloadBlob(storageKey);
    const pdf = await getDocumentProxy(bytes);
    const pageCount = pdf.numPages;
    const { text } = await extractText(pdf, { mergePages: true });

    if (!text || text.trim().length < 50) {
      throw new Error('no extractable text (PDF may be scanned / image-only)');
    }

    const chunks = await saveChunks({
      organizationId,
      sourceId,
      sourceType: 'pdf',
      sourceUrl: null,
      title: filename,
      createdByUserId: userId,
      text: Array.isArray(text) ? text.join('\n\n') : text,
    });

    await markCompleted(sourceId, chunks, pageCount);
    return { ok: true, pageCount, chunks };
  } catch (err) {
    console.error(`[ingest-pdf] failed source=${sourceId}:`, err);
    await markFailed(sourceId, err);
    throw err;
  }
}
