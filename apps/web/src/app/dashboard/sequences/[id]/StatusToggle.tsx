'use client';

import { useTransition } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { updateSequenceStatus } from '../actions';
import type { OutreachSequenceStatus } from '@marketing-os/db';

export function StatusToggle({
  sequenceId,
  current,
}: {
  sequenceId: string;
  current: OutreachSequenceStatus;
}) {
  const [pending, start] = useTransition();
  const next: OutreachSequenceStatus =
    current === 'active' ? 'paused' : current === 'paused' ? 'active' : 'active';
  const label = current === 'active' ? 'Pause' : current === 'paused' ? 'Resume' : 'Activate';
  const icon = current === 'active' ? Pause : Play;

  return (
    <Button
      size="sm"
      variant={current === 'active' ? 'secondary' : 'primary'}
      disabled={pending}
      leadingIcon={icon({ className: 'h-3.5 w-3.5' } as never)}
      onClick={() =>
        start(async () => {
          await updateSequenceStatus(sequenceId, next);
        })
      }
    >
      {pending ? 'Updating…' : label}
    </Button>
  );
}
