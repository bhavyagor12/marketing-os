'use client';

import { useState, useTransition } from 'react';
import { FileEdit, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { CampaignPlanItem } from '@marketing-os/shared';
import { generateDraftForPlanItem } from '../actions';

export function PlanItemRow({
  campaignId,
  index,
  item,
  draftCount,
}: {
  campaignId: string;
  index: number;
  item: CampaignPlanItem;
  draftCount: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex items-start gap-3 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[11px] font-semibold text-stone-600">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{item.platform}</Badge>
          <Badge tone="neutral">{item.contentType}</Badge>
          {draftCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
              <FileEdit className="h-3 w-3" />
              {draftCount} draft{draftCount === 1 ? '' : 's'}
            </span>
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
      <Button
        size="sm"
        variant={draftCount > 0 ? 'secondary' : 'primary'}
        disabled={pending}
        leadingIcon={<Wand2 className="h-3.5 w-3.5" />}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await generateDraftForPlanItem(campaignId, index);
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending ? 'Drafting…' : draftCount > 0 ? 'Redraft' : 'Draft'}
      </Button>
    </li>
  );
}
