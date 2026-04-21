'use client';

import { useTransition } from 'react';
import { Unplug } from 'lucide-react';
import { disconnectSocial } from './actions';

export function DisconnectSocialButton({ id, handle }: { id: string; handle: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Disconnect @${handle}? Scheduled publishes to this account will fail.`))
          return;
        start(async () => {
          await disconnectSocial(id);
        });
      }}
      className="rounded p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
      aria-label="Disconnect"
    >
      <Unplug className="h-3.5 w-3.5" />
    </button>
  );
}
