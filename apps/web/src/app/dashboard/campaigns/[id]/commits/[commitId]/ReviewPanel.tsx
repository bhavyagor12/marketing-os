'use client';

import { useState, useTransition } from 'react';
import { Check, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestApproval, reviewCommit } from '../../../actions';

export function ReviewPanel({ commitId }: { commitId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Send className="h-3.5 w-3.5" />}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await requestApproval(commitId);
              if (r?.error) setError(r.error);
            })
          }
        >
          Request approval
        </Button>
        <Button
          size="sm"
          leadingIcon={<Check className="h-3.5 w-3.5" />}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await reviewCommit(commitId, 'approved', note || null);
              if (r?.error) setError(r.error);
              else setNote('');
            })
          }
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<X className="h-3.5 w-3.5" />}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await reviewCommit(commitId, 'changes_requested', note || null);
              if (r?.error) setError(r.error);
              else setNote('');
            })
          }
        >
          Request changes
        </Button>
      </div>
      <textarea
        rows={2}
        placeholder="Optional review note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
