import type { Job } from 'bullmq';
import * as cheerio from 'cheerio';
import { db, brandAssets } from '@marketing-os/db';
import type { IngestWebsiteJob } from '../queues';
import { markProcessing, markCompleted, markFailed, saveChunks } from '../lib/ingest-shared';
import {
  discoverImageCandidates,
  discoverColorsFromHtml,
  discoverColorsFromStylesheets,
  discoverFonts,
} from '../lib/asset-extraction';

const USER_AGENT = 'MarketingOS-Bot/0.1 (+https://marketing-os.local)';
const MAX_PAGES = 10;
const FETCH_TIMEOUT_MS = 15_000;

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.8' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html')) throw new Error(`non-html content-type ${ct} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractReadableText(html: string): { title: string; text: string; links: string[] } {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe, nav, footer, header, aside').remove();
  const title = ($('title').first().text() || $('h1').first().text() || '').trim();
  const text = $('body').text().replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) links.push(href);
  });
  return { title, text, links };
}

function sameOriginAbsoluteLinks(rootUrl: string, links: string[]): string[] {
  const root = new URL(rootUrl);
  const out = new Set<string>();
  for (const href of links) {
    try {
      const u = new URL(href, rootUrl);
      if (u.origin !== root.origin) continue;
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = '';
      if (/\.(png|jpe?g|gif|webp|svg|pdf|zip|mp4|mp3)$/i.test(u.pathname)) continue;
      out.add(u.toString());
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

// URL-only image references — we don't host/copy anything. If the remote URL dies,
// the user can re-ingest. Cheap, simple, honest.

export async function processIngestWebsite(job: Job<IngestWebsiteJob>) {
  const { sourceId, organizationId, url, userId } = job.data;
  console.log(`[ingest-website] source=${sourceId} url=${url}`);

  try {
    const sourceRow = await markProcessing(sourceId);

    const visited = new Set<string>();
    const queue: string[] = [url];
    let pageCount = 0;
    let totalChunks = 0;
    let rootHtml: string | null = null;

    while (queue.length > 0 && pageCount < MAX_PAGES) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      let html: string;
      try {
        html = await fetchHtml(current);
      } catch (err) {
        console.warn(`[ingest-website] skip ${current}:`, err);
        continue;
      }

      if (current === url) rootHtml = html;

      const { title, text, links } = extractReadableText(html);
      if (text.length > 200) {
        const saved = await saveChunks({
          organizationId,
          sourceId,
          sourceType: sourceRow.metadata && (sourceRow.metadata as Record<string, unknown>).competitorId ? 'competitor' : 'website',
          sourceUrl: current,
          title: title || null,
          createdByUserId: userId,
          text,
        });
        totalChunks += saved;
        pageCount += 1;
      }

      if (current === url) {
        for (const link of sameOriginAbsoluteLinks(url, links)) {
          if (!visited.has(link)) queue.push(link);
        }
      }
    }

    if (totalChunks === 0) throw new Error('no readable content found at any crawled page');

    // ---- asset extraction from the root page (where brand identity is most expressed) ----
    if (rootHtml) {
      try {
        const imageCandidates = discoverImageCandidates(rootHtml, url);
        if (imageCandidates.length > 0) {
          await db.insert(brandAssets).values(
            imageCandidates.map((c) => ({
              organizationId,
              sourceId,
              kind: c.kind,
              sourceUrl: c.url,
              alt: c.alt,
              prominence: c.prominence,
            })),
          );
        }
        console.log(
          `[ingest-website] referenced ${imageCandidates.length} images for ${sourceId}`,
        );

        const inlineColors = discoverColorsFromHtml(rootHtml);
        const allColors = await discoverColorsFromStylesheets(rootHtml, url, inlineColors);
        if (allColors.length > 0) {
          await db.insert(brandAssets).values(
            allColors.map((c) => ({
              organizationId,
              sourceId,
              kind: 'color' as const,
              hex: c.hex,
              prominence: c.prominence,
            })),
          );
        }

        const fonts = await discoverFonts(rootHtml, url);
        if (fonts.length > 0) {
          await db.insert(brandAssets).values(
            fonts.map((f) => ({
              organizationId,
              sourceId,
              kind: 'font' as const,
              fontFamily: f.family,
              fontProvider: f.provider,
              prominence: f.provider === 'google' ? 50 : 30,
            })),
          );
        }
      } catch (err) {
        console.warn(`[ingest-website] asset extraction failed for ${sourceId}:`, err);
        // Don't fail the whole source — text chunks already saved
      }
    }

    await markCompleted(sourceId, totalChunks, pageCount);
    return { ok: true, pageCount, chunks: totalChunks };
  } catch (err) {
    console.error(`[ingest-website] failed source=${sourceId}:`, err);
    await markFailed(sourceId, err);
    throw err;
  }
}
