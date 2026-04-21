'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { addValueProp, deleteValueProp } from './edit-actions';

export function AddValuePropForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proof, setProof] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addValueProp({
        title,
        description,
        proof: proof
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (res?.error) setError(res.error);
      else {
        setTitle('');
        setDescription('');
        setProof('');
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
        Add value prop
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4">
      <Input
        label="Title"
        required
        placeholder="10× faster campaign cycles"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Description
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Proof points (one per line)
        </label>
        <textarea
          rows={3}
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !title.trim()} leadingIcon={<Plus className="h-3.5 w-3.5" />}>
          {pending ? 'Saving…' : 'Add'}
        </Button>
      </div>
    </form>
  );
}

export function DeleteValuePropButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete value prop "${title}"?`)) return;
        start(async () => {
          await deleteValueProp(id);
        });
      }}
      className="rounded p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
      aria-label="Delete value prop"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
