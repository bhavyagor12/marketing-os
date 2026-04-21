'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cx } from '@/lib/cx';
import { updateLeadStatus } from './actions';

const STATUSES: {
  value: 'new' | 'contacted' | 'engaged' | 'qualified' | 'disqualified' | 'unsubscribed';
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}[] = [
  { value: 'new', label: 'New', tone: 'neutral' },
  { value: 'contacted', label: 'Contacted', tone: 'info' },
  { value: 'engaged', label: 'Engaged', tone: 'info' },
  { value: 'qualified', label: 'Qualified', tone: 'success' },
  { value: 'disqualified', label: 'Disqualified', tone: 'warning' },
  { value: 'unsubscribed', label: 'Unsubscribed', tone: 'danger' },
];

export function LeadStatusMenu({
  leadId,
  status,
}: {
  leadId: string;
  status: (typeof STATUSES)[number]['value'];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = STATUSES.find((s) => s.value === status) ?? STATUSES[0]!;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="inline-flex items-center"
        aria-label="Change status"
      >
        <Badge tone={current.tone} dot>
          {current.label}
        </Badge>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={pending || s.value === status}
              onClick={() =>
                start(async () => {
                  setOpen(false);
                  await updateLeadStatus(leadId, s.value);
                })
              }
              className={cx(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-stone-50',
                s.value === status && 'font-semibold',
              )}
            >
              {s.value === status ? <Check className="h-3 w-3" /> : <span className="w-3" />}
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
