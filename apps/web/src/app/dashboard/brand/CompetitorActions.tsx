'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cx } from '@/lib/cx';
import { addCompetitor, deleteCompetitor } from './edit-actions';

const TYPES: { value: 'direct' | 'indirect' | 'alternative'; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'indirect', label: 'Indirect' },
  { value: 'alternative', label: 'Alternative' },
];

export function AddCompetitorForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [type, setType] = useState<'direct' | 'indirect' | 'alternative'>('direct');
  const [howWeDiffer, setHowWeDiffer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addCompetitor({
        name,
        website,
        competitorType: type,
        howWeDiffer,
      });
      if (res?.error) setError(res.error);
      else {
        setName('');
        setWebsite('');
        setHowWeDiffer('');
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
      >
        Add competitor
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4">
      <Input
        label="Name"
        required
        placeholder="Competitor Inc."
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label="Website"
        placeholder="https://competitor.com"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Type
        </label>
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cx(
                'rounded-md border px-3 py-1.5 text-sm transition',
                type === t.value
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          How we differ
        </label>
        <textarea
          rows={2}
          value={howWeDiffer}
          onChange={(e) => setHowWeDiffer(e.target.value)}
          placeholder="They focus on enterprise; we win with self-serve…"
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !name.trim()} leadingIcon={<Plus className="h-3.5 w-3.5" />}>
          {pending ? 'Saving…' : 'Add'}
        </Button>
      </div>
    </form>
  );
}

export function DeleteCompetitorButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete competitor "${name}"?`)) return;
        start(async () => {
          await deleteCompetitor(id);
        });
      }}
      className="rounded p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
      aria-label="Delete competitor"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
