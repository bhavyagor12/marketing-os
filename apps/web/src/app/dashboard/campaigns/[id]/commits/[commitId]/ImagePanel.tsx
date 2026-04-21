'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Wand2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { generateImageForCommit } from '../../../actions';

export function ImagePanel({
  commitId,
  campaignId,
  attachedBlobIds,
}: {
  commitId: string;
  campaignId: string;
  attachedBlobIds: string[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      {attachedBlobIds.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {attachedBlobIds.map((id) => (
            <a
              key={id}
              href={`/api/media/${id}`}
              target="_blank"
              rel="noreferrer"
              className="group relative block overflow-hidden rounded-md border border-stone-200 bg-stone-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${id}`}
                alt="Generated creative"
                className="h-full w-full object-contain"
                loading="lazy"
              />
              <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100">
                <ExternalLink className="h-3 w-3" />
              </span>
            </a>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-dashed border-stone-300 bg-stone-50/60 p-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-stone-500" />
          <p className="text-sm font-medium text-stone-900">
            {attachedBlobIds.length > 0 ? 'Generate another' : 'Generate image'}
          </p>
        </div>
        <p className="text-xs text-stone-500">
          The image agent reads this plan item + your brand&apos;s colors, voice, and visual
          identity to craft a prompt, then calls OpenAI DALL-E 3. The result creates a new
          child commit attached to this one.
        </p>

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="text-xs font-medium text-stone-600 hover:text-stone-900"
        >
          {advanced ? 'Hide custom prompt' : 'Custom prompt (optional)'}
        </button>

        {advanced ? (
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Override the agent and specify the image directly…"
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
                const res = await generateImageForCommit({
                  commitId,
                  prompt: advanced && prompt.trim() ? prompt.trim() : null,
                });
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                if (res?.commitId) {
                  router.push(`/dashboard/campaigns/${campaignId}/commits/${res.commitId}`);
                  router.refresh();
                }
              })
            }
          >
            {pending ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>
    </div>
  );
}
