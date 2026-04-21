'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export function CancelInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('Cancel this invitation?')) return;
        start(async () => {
          await authClient.organization.cancelInvitation({ invitationId });
          router.refresh();
        });
      }}
      className="rounded p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
      aria-label="Cancel invitation"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
