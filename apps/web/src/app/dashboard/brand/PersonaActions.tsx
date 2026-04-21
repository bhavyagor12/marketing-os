'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { addPersona, deletePersona } from './edit-actions';

export function AddPersonaForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addPersona({
        name,
        description,
        painPoints: painPoints
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (res?.error) setError(res.error);
      else {
        setName('');
        setDescription('');
        setPainPoints('');
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<UserPlus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
      >
        Add persona
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-stone-200 bg-stone-50/60 p-4">
      <Input
        label="Name"
        required
        placeholder="Solo founders building on EVM"
        value={name}
        onChange={(e) => setName(e.target.value)}
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
          Pain points (one per line)
        </label>
        <textarea
          rows={3}
          value={painPoints}
          onChange={(e) => setPainPoints(e.target.value)}
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

export function DeletePersonaButton({ personaId, name }: { personaId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete persona "${name}"?`)) return;
        start(async () => {
          await deletePersona(personaId);
        });
      }}
      className="rounded p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
      aria-label="Delete persona"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
