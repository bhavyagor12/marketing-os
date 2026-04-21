'use client';

import { useState } from 'react';
import { Copy, Check, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cx } from '@/lib/cx';

export function AttributionPanel({
  commitId,
  trackingBaseUrl,
  clickCount,
  impressionCount,
}: {
  commitId: string;
  trackingBaseUrl: string;
  clickCount: number;
  impressionCount: number;
}) {
  const [destination, setDestination] = useState('');
  const base = trackingBaseUrl.replace(/\/$/, '');
  const pixelUrl = `${base}/p/${commitId}`;
  const trackingUrl = destination
    ? `${base}/t/${commitId}?to=${encodeURIComponent(destination)}`
    : '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Impressions" value={impressionCount} />
        <Stat label="Clicks" value={clickCount} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          <LinkIcon className="mr-1 inline h-3 w-3" />
          Tracked redirect builder
        </label>
        <div className="space-y-2">
          <Input
            placeholder="https://your-destination.com/…"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          {trackingUrl ? (
            <CopyRow value={trackingUrl} />
          ) : (
            <p className="text-xs text-stone-500">
              Paste any URL above and we&apos;ll wrap it so clicks attribute back to this commit.
              When you publish through our worker, URLs in the body get wrapped automatically.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          <ImageIcon className="mr-1 inline h-3 w-3" />
          Impression pixel
        </label>
        <CopyRow value={`<img src="${pixelUrl}" width="1" height="1" alt="" />`} multiline />
        <p className="mt-1.5 text-xs text-stone-500">
          Embed in emails or landing pages. Social platforms strip remote images, so this
          won&apos;t work for X/LinkedIn posts themselves.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight text-stone-900">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function CopyRow({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="flex items-start gap-2">
      <code
        className={cx(
          'flex-1 overflow-x-auto rounded-md border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700',
          multiline && 'whitespace-pre-wrap break-all',
        )}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-stone-200 bg-white px-2.5 py-2 text-xs text-stone-700 hover:bg-stone-50"
        aria-label="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
