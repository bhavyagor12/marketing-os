'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { createCampaign } from '../actions';

const PLATFORMS: { value: string; label: string }[] = [
  { value: 'x', label: 'X' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'email', label: 'Email' },
];

export function BriefForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [product, setProduct] = useState('');
  const [audience, setAudience] = useState('');
  const [timeline, setTimeline] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(['x', 'linkedin']),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function togglePlatform(v: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('name', name);
    fd.set('goal', goal);
    fd.set('product', product);
    fd.set('audience', audience);
    if (timeline) fd.set('timeline', timeline);
    for (const p of selectedPlatforms) fd.append('platforms', p);

    start(async () => {
      const res = await createCampaign(fd);
      if (res?.error) setError(res.error);
      else if (res?.ok && res.campaignId) {
        router.push(`/dashboard/campaigns/${res.campaignId}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Input
        label="Campaign name"
        placeholder="Product launch — Q2 dev tools"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Goal
        </label>
        <textarea
          required
          rows={2}
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          placeholder="What outcome do you want? (sign-ups, awareness, demo bookings, etc.)"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Product / offering"
          required
          placeholder="e.g. AI dev tool for Web3 builders"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        />
        <Input
          label="Target audience"
          required
          placeholder="e.g. Solo founders building on EVM chains"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Platforms
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const selected = selectedPlatforms.has(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => togglePlatform(p.value)}
                className={cx(
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition',
                  selected
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <Input
        label="Timeline (optional)"
        placeholder="e.g. 2-week pre-launch runway"
        value={timeline}
        onChange={(e) => setTimeline(e.target.value)}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-4">
        <Button
          type="submit"
          disabled={pending || selectedPlatforms.size === 0}
          leadingIcon={<Rocket className="h-4 w-4" />}
        >
          {pending ? 'Creating…' : 'Create campaign'}
        </Button>
      </div>
    </form>
  );
}
