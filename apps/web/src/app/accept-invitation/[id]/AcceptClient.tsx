'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/auth-client';

export function AcceptClient({
  invitationId,
  organizationName,
  role,
}: {
  invitationId: string;
  organizationName: string;
  role: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm text-stone-700">
          You&apos;ve been invited to join{' '}
          <span className="font-semibold text-stone-900">{organizationName}</span> as a{' '}
          <span className="font-semibold text-stone-900">{role}</span>.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button
          disabled={pending}
          leadingIcon={<Check className="h-4 w-4" />}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const res = await authClient.organization.acceptInvitation({ invitationId });
                if (res.error) {
                  setError(res.error.message ?? 'Failed to accept');
                  return;
                }
                if (res.data?.invitation?.organizationId) {
                  await authClient.organization.setActive({
                    organizationId: res.data.invitation.organizationId,
                  });
                }
                router.push('/dashboard');
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to accept');
              }
            })
          }
        >
          {pending ? 'Accepting…' : 'Accept invitation'}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          leadingIcon={<X className="h-4 w-4" />}
          onClick={() =>
            start(async () => {
              try {
                await authClient.organization.rejectInvitation({ invitationId });
                router.push('/dashboard');
              } catch {
                /* ignore */
              }
            })
          }
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
