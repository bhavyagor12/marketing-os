'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Sparkles, TrendingUp, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CommitMetrics, type MetricCounts } from '@/components/metrics/CommitMetrics';
import type { CampaignPlanItem } from '@marketing-os/shared';
import {
  autoIterateForPlanItem,
  generateDraftForPlanItem,
  generateVariantForPlanItem,
} from '../actions';

export type PlanItemDraft = {
  id: string;
  branchName: string;
  variantLabel: string | null;
  isHeadOfBranch: boolean;
  message: string | null;
  contentHash: string;
  createdAt: Date | string;
  authoredBy: string;
  metrics: MetricCounts;
};

export function PlanItemRow({
  campaignId,
  index,
  item,
  drafts,
}: {
  campaignId: string;
  index: number;
  item: CampaignPlanItem;
  drafts: PlanItemDraft[];
}) {
  const [pending, start] = useTransition();
  const [variantPending, startVariant] = useTransition();
  const [iteratePending, startIterate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(drafts.length > 0);

  const mainDrafts = drafts.filter((d) => d.branchName === 'main');
  const variantGroups = groupByBranch(drafts.filter((d) => d.branchName !== 'main'));

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[11px] font-semibold text-stone-600">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{item.platform}</Badge>
            <Badge tone="neutral">{item.contentType}</Badge>
            {drafts.length > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-0.5 text-xs text-stone-500 hover:text-stone-900"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {drafts.length} draft{drafts.length === 1 ? '' : 's'}
                {variantGroups.size > 0
                  ? ` · ${variantGroups.size} variant${variantGroups.size === 1 ? '' : 's'}`
                  : ''}
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm font-medium text-stone-900">{item.hook}</p>
          <p className="mt-0.5 text-xs text-stone-500">{item.angle}</p>
          {item.cta ? (
            <p className="mt-1 text-xs text-stone-500">
              <span className="font-medium uppercase tracking-wide">CTA:</span> {item.cta}
            </p>
          ) : null}
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button
            size="sm"
            variant={mainDrafts.length > 0 ? 'secondary' : 'primary'}
            disabled={pending}
            leadingIcon={<Wand2 className="h-3.5 w-3.5" />}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await generateDraftForPlanItem(campaignId, index);
                if (res?.error) setError(res.error);
                else setExpanded(true);
              })
            }
          >
            {pending ? 'Drafting…' : mainDrafts.length > 0 ? 'Redraft main' : 'Draft'}
          </Button>
          {mainDrafts.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={variantPending}
              leadingIcon={<Sparkles className="h-3.5 w-3.5" />}
              onClick={() =>
                startVariant(async () => {
                  setError(null);
                  const res = await generateVariantForPlanItem(campaignId, index);
                  if (res?.error) setError(res.error);
                  else setExpanded(true);
                })
              }
            >
              {variantPending ? 'Spawning…' : 'Variant'}
            </Button>
          ) : null}
          {drafts.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={iteratePending}
              leadingIcon={<TrendingUp className="h-3.5 w-3.5" />}
              onClick={() =>
                startIterate(async () => {
                  setError(null);
                  const res = await autoIterateForPlanItem(campaignId, index);
                  if (res?.error) setError(res.error);
                  else setExpanded(true);
                })
              }
            >
              {iteratePending ? 'Iterating…' : 'Iterate'}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded && drafts.length > 0 ? (
        <div className="ml-10 mt-3 space-y-3">
          {mainDrafts.length > 0 ? (
            <DraftGroup
              campaignId={campaignId}
              branchName="main"
              drafts={mainDrafts}
            />
          ) : null}
          {Array.from(variantGroups.entries()).map(([branchName, variantDrafts]) => (
            <DraftGroup
              key={branchName}
              campaignId={campaignId}
              branchName={branchName}
              drafts={variantDrafts}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function groupByBranch(drafts: PlanItemDraft[]): Map<string, PlanItemDraft[]> {
  const out = new Map<string, PlanItemDraft[]>();
  for (const d of drafts) {
    const arr = out.get(d.branchName) ?? [];
    arr.push(d);
    out.set(d.branchName, arr);
  }
  return out;
}

function DraftGroup({
  campaignId,
  branchName,
  drafts,
}: {
  campaignId: string;
  branchName: string;
  drafts: PlanItemDraft[];
}) {
  const head = drafts.find((d) => d.isHeadOfBranch) ?? drafts[0];
  const rest = drafts.filter((d) => d.id !== head?.id);
  const variantLabel = head?.variantLabel;

  return (
    <div className="rounded-md border border-stone-200 bg-stone-50/40">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-1.5 text-xs">
        <GitBranch className="h-3 w-3 text-stone-400" />
        <span className="font-mono text-stone-700">{branchName}</span>
        {variantLabel ? (
          <Badge tone="info">Variant {variantLabel.toUpperCase()}</Badge>
        ) : branchName === 'main' ? (
          <Badge tone="success" dot>
            HEAD
          </Badge>
        ) : null}
      </div>
      <ul className="divide-y divide-stone-200">
        {[head, ...rest].filter(Boolean).map((d) => (
          <li key={d!.id} className="px-3 py-2 transition hover:bg-white">
            <Link
              href={`/dashboard/campaigns/${campaignId}/commits/${d!.id}`}
              className="block"
            >
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-stone-800 hover:text-stone-900 hover:underline">
                    {d!.message ?? 'Untitled'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    <span className="font-mono">{d!.contentHash.slice(0, 7)}</span> ·{' '}
                    {new Date(d!.createdAt).toLocaleString()} · {d!.authoredBy}
                  </p>
                </div>
              </div>
              <div className="ml-3.5 mt-1.5">
                <CommitMetrics current={d!.metrics} compact />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
