import { eq, inArray, sql } from 'drizzle-orm';
import { db, events } from '@marketing-os/db';
import { EventType } from '@marketing-os/shared';
import type { MetricCounts } from '@/components/metrics/CommitMetrics';

const EMPTY: MetricCounts = {
  impressions: 0,
  clicks: 0,
  likes: 0,
  signups: 0,
  conversions: 0,
  revenueUsdMicros: 0,
};

/**
 * Aggregate external engagement events into per-commit MetricCounts. One query per call
 * site, batching all commitIds together.
 */
export async function loadCommitMetrics(
  commitIds: string[],
): Promise<Map<string, MetricCounts>> {
  const out = new Map<string, MetricCounts>();
  if (commitIds.length === 0) return out;
  for (const id of commitIds) out.set(id, { ...EMPTY });

  const rows = await db
    .select({
      commitId: events.commitId,
      impressions: sql<number>`count(*) filter (where type = ${EventType.ExternalImpression})`.mapWith(
        Number,
      ),
      clicks: sql<number>`count(*) filter (where type = ${EventType.ExternalClick})`.mapWith(
        Number,
      ),
      likes: sql<number>`count(*) filter (where type = ${EventType.ExternalLike})`.mapWith(
        Number,
      ),
      signups: sql<number>`count(*) filter (where type = ${EventType.ExternalSignup})`.mapWith(
        Number,
      ),
      conversions:
        sql<number>`count(*) filter (where type = ${EventType.ExternalConversion})`.mapWith(
          Number,
        ),
      revenueUsdMicros:
        sql<number>`coalesce(sum(amount_usd_micros) filter (where type = ${EventType.ExternalRevenue}), 0)`.mapWith(
          Number,
        ),
    })
    .from(events)
    .where(inArray(events.commitId, commitIds))
    .groupBy(events.commitId);

  for (const r of rows) {
    if (!r.commitId) continue;
    out.set(r.commitId, {
      impressions: r.impressions,
      clicks: r.clicks,
      likes: r.likes,
      signups: r.signups,
      conversions: r.conversions,
      revenueUsdMicros: r.revenueUsdMicros,
    });
  }
  return out;
}

export async function loadSingleCommitMetrics(commitId: string): Promise<MetricCounts> {
  const map = await loadCommitMetrics([commitId]);
  return map.get(commitId) ?? { ...EMPTY };
}

/** Score used to rank commits by impact when showing "top performers". */
export function engagementScore(m: MetricCounts): number {
  // Weights mirror their approximate commercial value; can tune later.
  return (
    m.impressions * 1 +
    m.clicks * 10 +
    m.likes * 3 +
    m.signups * 50 +
    m.conversions * 100 +
    Math.floor(m.revenueUsdMicros / 1000)
  );
}
