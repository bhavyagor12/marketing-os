import { Eye, MousePointerClick, ThumbsUp, UserCheck, DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cx } from '@/lib/cx';

export type MetricCounts = {
  impressions: number;
  clicks: number;
  likes: number;
  signups: number;
  conversions: number;
  revenueUsdMicros: number;
};

/**
 * CommitMetrics renders the performance of a commit, optionally alongside a "parent"
 * comparison so you can see version-on-version lift. Used on commit detail pages and
 * campaign-level top-performer rollups.
 */
export function CommitMetrics({
  current,
  parent,
  compact = false,
}: {
  current: MetricCounts;
  parent?: MetricCounts | null;
  compact?: boolean;
}) {
  const items: { label: string; icon: React.ReactNode; value: number; format?: 'int' | 'usd' }[] = [
    { label: 'Impressions', icon: <Eye className="h-3.5 w-3.5" />, value: current.impressions },
    { label: 'Clicks', icon: <MousePointerClick className="h-3.5 w-3.5" />, value: current.clicks },
    { label: 'Likes', icon: <ThumbsUp className="h-3.5 w-3.5" />, value: current.likes },
    { label: 'Signups', icon: <UserCheck className="h-3.5 w-3.5" />, value: current.signups },
    {
      label: 'Revenue',
      icon: <DollarSign className="h-3.5 w-3.5" />,
      value: current.revenueUsdMicros,
      format: 'usd',
    },
  ];

  const ctr =
    current.impressions > 0 ? (current.clicks / current.impressions) * 100 : null;
  const parentCtr =
    parent && parent.impressions > 0 ? (parent.clicks / parent.impressions) * 100 : null;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className={cx('grid gap-2', compact ? 'grid-cols-5' : 'grid-cols-2 sm:grid-cols-5')}>
        {items.map((m) => {
          const parentVal =
            parent && m.label === 'Impressions'
              ? parent.impressions
              : m.label === 'Clicks'
                ? parent?.clicks
                : m.label === 'Likes'
                  ? parent?.likes
                  : m.label === 'Signups'
                    ? parent?.signups
                    : m.label === 'Revenue'
                      ? parent?.revenueUsdMicros
                      : undefined;
          return (
            <Stat
              key={m.label}
              label={m.label}
              icon={m.icon}
              value={m.value}
              parentValue={parentVal}
              format={m.format ?? 'int'}
              compact={compact}
            />
          );
        })}
      </div>

      {ctr !== null && !compact ? (
        <div className="flex items-center gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">CTR</span>
          <span className="font-mono text-sm font-semibold text-stone-900">{ctr.toFixed(2)}%</span>
          {parentCtr !== null ? <Delta current={ctr} prev={parentCtr} unit="pp" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  icon,
  value,
  parentValue,
  format,
  compact,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  parentValue: number | undefined;
  format: 'int' | 'usd';
  compact: boolean;
}) {
  const display = format === 'usd' ? formatUsdFromMicros(value) : value.toLocaleString();
  const hasParent = typeof parentValue === 'number';
  return (
    <div
      className={cx(
        'rounded-md border border-stone-200 bg-white',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
      )}
    >
      <div className="flex items-center gap-1 text-stone-500">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cx(
            'font-semibold tracking-tight text-stone-900',
            compact ? 'text-sm' : 'text-base',
          )}
        >
          {display}
        </span>
        {hasParent ? <Delta current={value} prev={parentValue!} /> : null}
      </div>
    </div>
  );
}

function Delta({ current, prev, unit }: { current: number; prev: number; unit?: 'pp' }) {
  if (prev === 0 && current === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-stone-400">
        <Minus className="h-2.5 w-2.5" />—
      </span>
    );
  }
  const delta = unit === 'pp' ? current - prev : prev === 0 ? null : ((current - prev) / prev) * 100;
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
        <TrendingUp className="h-2.5 w-2.5" />new
      </span>
    );
  }
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 text-[10px] font-medium',
        up ? 'text-emerald-600' : 'text-red-600',
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {up ? '+' : ''}
      {delta.toFixed(unit === 'pp' ? 1 : 0)}
      {unit === 'pp' ? 'pp' : '%'}
    </span>
  );
}

function formatUsdFromMicros(micros: number): string {
  if (!micros) return '$0';
  const dollars = micros / 1_000_000;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(2)}`;
}
