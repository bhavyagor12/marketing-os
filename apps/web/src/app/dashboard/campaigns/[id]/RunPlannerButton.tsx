'use client';

import { useState, useTransition } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { runPlanner } from '../actions';

export function RunPlannerButton({
  campaignId,
  hasPlan,
}: {
  campaignId: string;
  hasPlan: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      <Button
        size="sm"
        variant={hasPlan ? 'secondary' : 'primary'}
        disabled={pending}
        leadingIcon={<Wand2 className="h-3.5 w-3.5" />}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await runPlanner(campaignId);
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending ? 'Planning…' : hasPlan ? 'Re-run planner' : 'Run planner'}
      </Button>
    </div>
  );
}
