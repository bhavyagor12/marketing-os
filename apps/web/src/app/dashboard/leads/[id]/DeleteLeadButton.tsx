'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { deleteLead } from '../actions';

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending}
      leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
      onClick={() => {
        if (!confirm('Delete this lead? History will be preserved in events.')) return;
        start(async () => {
          const res = await deleteLead(leadId);
          if (res?.ok) {
            router.push('/dashboard/leads');
            router.refresh();
          }
        });
      }}
    >
      {pending ? 'Deleting…' : 'Delete'}
    </Button>
  );
}
