'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';
import { createSequence } from '../actions';

type Connection = { id: string; accountHandle: string };

export function NewSequenceForm({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('name', name);
    if (description) fd.set('description', description);
    if (connectionId) fd.set('connectionId', connectionId);
    start(async () => {
      const res = await createSequence(fd);
      if (res?.error) setError(res.error);
      else if (res?.id) {
        router.push(`/dashboard/sequences/${res.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="Name"
        required
        placeholder="Cold outbound — Q2 launch"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Description (optional)
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Who this is for, the angle, anything future-you needs to remember."
          className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Send from
        </label>
        {connections.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No email sender connected. Add one on Connections → Connect email (Resend), then come back.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {connections.map((c) => {
              const active = c.id === connectionId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setConnectionId(c.id)}
                  className={cx(
                    'rounded-md border px-3 py-1.5 text-sm transition',
                    active
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
                  )}
                >
                  {c.accountHandle}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end border-t border-stone-200 pt-4">
        <Button
          type="submit"
          disabled={pending || !name.trim() || connections.length === 0}
          leadingIcon={<Rocket className="h-4 w-4" />}
        >
          {pending ? 'Creating…' : 'Create sequence'}
        </Button>
      </div>
    </form>
  );
}
