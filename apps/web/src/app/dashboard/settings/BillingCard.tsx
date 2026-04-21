'use client';

import { useState, useTransition } from 'react';
import { Zap, Check, ArrowRight, CreditCard } from 'lucide-react';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cx } from '@/lib/cx';
import type { BillingPlan } from '@marketing-os/db';
import {
  startUpgradeCheckout,
  cancelSubscriptionAction,
  devUpgrade,
} from './billing-actions';

type PlanMeta = {
  plan: BillingPlan;
  label: string;
  priceUsdCents: number;
  quotas: {
    plannerRuns: number;
    contentDrafts: number;
    imageGenerations: number;
    videoGenerations: number;
    outreachSends: number;
  };
};

type Usage = {
  plannerRuns: number;
  contentDrafts: number;
  imageGenerations: number;
  videoGenerations: number;
  outreachSends: number;
  periodStart: string | Date;
  periodEnd: string | Date | null;
};

export function BillingCard({
  plans,
  currentPlan,
  usage,
  status,
  currentPeriodEnd,
  cancelledAt,
  isDev,
}: {
  plans: PlanMeta[];
  currentPlan: BillingPlan;
  usage: Usage;
  status: string;
  currentPeriodEnd: string | Date | null;
  cancelledAt: string | Date | null;
  isDev: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentMeta = plans.find((p) => p.plan === currentPlan)!;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Billing"
          subtitle={`Current plan: ${currentMeta.label}`}
        />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-100 text-stone-600">
              <CreditCard className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900">
                {currentMeta.label}{' '}
                <span className="text-stone-500">
                  {currentMeta.priceUsdCents
                    ? `· $${(currentMeta.priceUsdCents / 100).toFixed(0)}/mo`
                    : '· free'}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                Status: {status}
                {cancelledAt
                  ? ` · cancelled ${new Date(cancelledAt).toLocaleDateString()}`
                  : currentPeriodEnd
                    ? ` · renews ${new Date(currentPeriodEnd).toLocaleDateString()}`
                    : ''}
              </p>
            </div>
            <Badge tone={status === 'active' ? 'success' : status === 'past_due' ? 'danger' : 'neutral'} dot>
              {status}
            </Badge>
          </div>

          {/* Usage */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <UsageStat
              label="Planner"
              used={usage.plannerRuns}
              limit={currentMeta.quotas.plannerRuns}
            />
            <UsageStat
              label="Drafts"
              used={usage.contentDrafts}
              limit={currentMeta.quotas.contentDrafts}
            />
            <UsageStat
              label="Images"
              used={usage.imageGenerations}
              limit={currentMeta.quotas.imageGenerations}
            />
            <UsageStat
              label="Videos"
              used={usage.videoGenerations}
              limit={currentMeta.quotas.videoGenerations}
            />
            <UsageStat
              label="Outreach"
              used={usage.outreachSends}
              limit={currentMeta.quotas.outreachSends}
            />
          </div>

          <p className="text-xs text-stone-500">
            Usage window:{' '}
            {new Date(usage.periodStart).toLocaleDateString()} →{' '}
            {usage.periodEnd ? new Date(usage.periodEnd).toLocaleDateString() : 'rolling 30d'}
          </p>
        </CardBody>
        {currentMeta.plan !== 'free' ? (
          <CardFooter>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  if (!confirm('Cancel this subscription? Access continues until period end.')) return;
                  const res = await cancelSubscriptionAction();
                  if (res?.error) setError(res.error);
                })
              }
            >
              {pending ? 'Cancelling…' : 'Cancel subscription'}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Plans" subtitle="Upgrade for hosted AI, rate-limited per-org." />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {plans.map((p) => (
              <PlanTile
                key={p.plan}
                meta={p}
                current={p.plan === currentPlan}
                onUpgrade={() =>
                  start(async () => {
                    setError(null);
                    if (p.plan === 'free') {
                      if (isDev) await devUpgrade('free');
                      return;
                    }
                    const res = await startUpgradeCheckout(p.plan);
                    if (res?.error) {
                      setError(res.error);
                      return;
                    }
                    if (res?.paymentLink) {
                      window.location.href = res.paymentLink;
                    }
                  })
                }
                onDevUpgrade={
                  isDev
                    ? () =>
                        start(async () => {
                          setError(null);
                          const res = await devUpgrade(p.plan);
                          if (res?.error) setError(res.error);
                        })
                    : undefined
                }
                pending={pending}
              />
            ))}
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {isDev ? (
            <p className="mt-3 text-xs text-stone-500">
              Dev build: the <span className="font-mono">Dev switch</span> button bypasses DODO checkout — useful for
              testing quotas before payment is wired.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function UsageStat({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const unlimited = !Number.isFinite(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const barColor =
    pct >= 100
      ? 'bg-red-500'
      : pct >= 80
        ? 'bg-amber-500'
        : 'bg-stone-900';
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-stone-900">
        {used.toLocaleString()}
        {unlimited ? (
          <span className="text-stone-400"> / ∞</span>
        ) : (
          <span className="text-stone-400"> / {limit.toLocaleString()}</span>
        )}
      </p>
      {!unlimited ? (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className={cx('h-full rounded-full transition-all', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function PlanTile({
  meta,
  current,
  onUpgrade,
  onDevUpgrade,
  pending,
}: {
  meta: PlanMeta;
  current: boolean;
  onUpgrade: () => void;
  onDevUpgrade?: () => void;
  pending: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-md border p-4',
        current ? 'border-stone-900 bg-stone-50' : 'border-stone-200 bg-white',
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-stone-900">{meta.label}</span>
          {current ? <Badge tone="success" dot>Current</Badge> : null}
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
          {meta.priceUsdCents
            ? `$${(meta.priceUsdCents / 100).toFixed(0)}`
            : 'Free'}
          {meta.priceUsdCents ? (
            <span className="text-sm font-normal text-stone-500">/mo</span>
          ) : null}
        </p>
      </div>
      <ul className="space-y-1 text-xs text-stone-600">
        <Quota label="planner runs" n={meta.quotas.plannerRuns} />
        <Quota label="content drafts" n={meta.quotas.contentDrafts} />
        <Quota label="image generations" n={meta.quotas.imageGenerations} />
        <Quota label="video generations" n={meta.quotas.videoGenerations} />
        <Quota label="outreach sends" n={meta.quotas.outreachSends} />
      </ul>
      <div className="mt-auto flex flex-col gap-1.5">
        {!current ? (
          <Button
            size="sm"
            disabled={pending}
            trailingIcon={<ArrowRight className="h-3.5 w-3.5" />}
            onClick={onUpgrade}
          >
            {meta.plan === 'free' ? 'Downgrade' : 'Upgrade'}
          </Button>
        ) : null}
        {onDevUpgrade ? (
          <button
            type="button"
            className="text-[11px] text-stone-500 underline hover:text-stone-900"
            onClick={onDevUpgrade}
            disabled={pending}
          >
            Dev switch (no DODO)
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Quota({ label, n }: { label: string; n: number }) {
  const value = Number.isFinite(n) ? n.toLocaleString() : '∞';
  return (
    <li className="flex items-center gap-1.5">
      <Check className="h-3 w-3 text-emerald-600" />
      <span>
        <span className="font-medium text-stone-900">{value}</span> {label}
      </span>
    </li>
  );
}
