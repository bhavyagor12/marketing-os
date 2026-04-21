'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteAiProviderKey } from './actions';

export function DeleteKeyButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('Remove this API key? Agents will fail until a replacement is added.')) return;
        start(async () => {
          await deleteAiProviderKey(id);
        });
      }}
      className="rounded p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
      aria-label="Delete key"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
