'use client';

import { useState, useTransition } from 'react';
import { Radar, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { scanCompetitorSite } from './competitor-actions';

export function ScanCompetitorButton({ competitorId }: { competitorId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || done}
        leadingIcon={
          done ? <Check className="h-3.5 w-3.5" /> : <Radar className="h-3.5 w-3.5" />
        }
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await scanCompetitorSite(competitorId);
            if (res?.error) setError(res.error);
            else setDone(true);
          })
        }
      >
        {pending ? 'Queuing…' : done ? 'Scanning' : 'Scan site'}
      </Button>
    </div>
  );
}
