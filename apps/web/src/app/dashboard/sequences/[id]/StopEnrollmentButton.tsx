'use client';

import { useTransition } from 'react';
import { X } from 'lucide-react';
import { stopEnrollment } from '../actions';

export function StopEnrollmentButton({ enrollmentId }: { enrollmentId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await stopEnrollment(enrollmentId);
        })
      }
      className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
      aria-label="Stop enrollment"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
