'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { generateVideoForCommit } from '../../../actions';

export function VideoPanel({
  commitId,
  pendingRun,
}: {
  commitId: string;
  pendingRun: { id: string; startedAt: Date | string | null } | null;
}) {
  const router = useRouter();
  const [advanced, setAdvanced] = useState(false);
  const [script, setScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (pendingRun) {
    return (
      <div className="rounded-md border border-dashed border-stone-300 bg-stone-50/60 px-4 py-5 text-center">
        <Video className="mx-auto mb-2 h-5 w-5 text-stone-400" />
        <p className="text-sm font-medium text-stone-900">Rendering video…</p>
        <p className="mt-1 text-xs text-stone-500">
          HeyGen typically takes 1–5 minutes. A new commit will appear when it&apos;s ready.
          {pendingRun.startedAt
            ? ` Started ${new Date(pendingRun.startedAt).toLocaleTimeString()}.`
            : null}
        </p>
        <Badge tone="info" dot>
          In progress
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-stone-300 bg-stone-50/60 p-3">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-stone-500" />
        <p className="text-sm font-medium text-stone-900">Generate video</p>
      </div>
      <p className="text-xs text-stone-500">
        The video agent writes a script from this commit&apos;s plan item + your brand voice,
        submits it to HeyGen with a default avatar/voice, and creates a new child commit when
        rendering finishes.
      </p>
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="text-xs font-medium text-stone-600 hover:text-stone-900"
      >
        {advanced ? 'Hide custom script' : 'Custom script (optional)'}
      </button>
      {advanced ? (
        <textarea
          rows={4}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Override the agent — write the spoken script directly. 60-120 words recommended."
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end pt-1">
        <Button
          size="sm"
          disabled={pending}
          leadingIcon={<Wand2 className="h-3.5 w-3.5" />}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await generateVideoForCommit({
                commitId,
                script: advanced && script.trim() ? script.trim() : null,
              });
              if (res?.error) setError(res.error);
              else router.refresh();
            })
          }
        >
          {pending ? 'Submitting…' : 'Generate video'}
        </Button>
      </div>
    </div>
  );
}
