import Link from 'next/link';
import { ArrowUpRight, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { CommitMetrics, type MetricCounts } from '@/components/metrics/CommitMetrics';

export type RankedCommit = {
  id: string;
  message: string | null;
  contentType: string | null;
  platforms: string[];
  authoredBy: string;
  metrics: MetricCounts;
};

export function PerformanceCard({
  campaignId,
  commits,
}: {
  campaignId: string;
  commits: RankedCommit[];
}) {
  const anyEngagement = commits.some(
    (c) =>
      c.metrics.impressions > 0 ||
      c.metrics.clicks > 0 ||
      c.metrics.signups > 0 ||
      c.metrics.conversions > 0,
  );

  return (
    <Card>
      <CardHeader
        title="Performance"
        subtitle={
          anyEngagement
            ? 'Top-performing commits by engagement score.'
            : 'No external signals yet — publish + get clicks to populate.'
        }
      />
      <CardBody>
        {!anyEngagement ? (
          <EmptyState
            icon={<TrendingUp className="h-4 w-4" />}
            title="No performance data yet"
            description="Publish a commit — impressions and clicks will start flowing in from the tracking pixel and redirect endpoints."
          />
        ) : (
          <ul className="space-y-3">
            {commits.slice(0, 5).map((c, i) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/campaigns/${campaignId}/commits/${c.id}`}
                  className="group block rounded-md border border-stone-200 bg-white px-3 py-3 transition hover:border-stone-300 hover:bg-stone-50"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-stone-900 text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-stone-900">
                          {c.message ?? 'Untitled commit'}
                        </p>
                        {c.contentType ? (
                          <Badge tone="neutral">{c.contentType}</Badge>
                        ) : null}
                        {c.platforms.map((p) => (
                          <Badge key={p} tone="info">
                            {p}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2">
                        <CommitMetrics current={c.metrics} compact />
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-300 group-hover:text-stone-500" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
