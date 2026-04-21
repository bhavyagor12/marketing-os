'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Send, Check } from 'lucide-react';
import { cx } from '@/lib/cx';
import { enrollLeadsInSequence } from '../sequences/actions';

export function EnrollLeadButton({
  leadId,
  sequences,
}: {
  leadId: string;
  sequences: { id: string; name: string; status: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (sequences.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
        aria-label="Enroll in sequence"
      >
        <Send className="h-3 w-3" />
        Enroll
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Add to active sequence
          </p>
          {sequences.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={pending || s.status !== 'active'}
              onClick={() =>
                start(async () => {
                  setStatus('idle');
                  setMessage(null);
                  const res = await enrollLeadsInSequence({
                    sequenceId: s.id,
                    leadIds: [leadId],
                  });
                  if (res?.error) {
                    setStatus('error');
                    setMessage(res.error);
                  } else if (res?.ok) {
                    setStatus('ok');
                    setMessage(`Enrolled (${res.enrolled})`);
                    setTimeout(() => setOpen(false), 1200);
                  }
                })
              }
              className={cx(
                'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs',
                s.status === 'active'
                  ? 'hover:bg-stone-50'
                  : 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="truncate">{s.name}</span>
              <span
                className={
                  s.status === 'active'
                    ? 'text-[10px] uppercase tracking-wide text-emerald-600'
                    : 'text-[10px] uppercase tracking-wide text-stone-400'
                }
              >
                {s.status}
              </span>
            </button>
          ))}
          {status === 'ok' ? (
            <p className="flex items-center gap-1 border-t border-stone-200 px-3 py-1.5 text-[11px] text-emerald-600">
              <Check className="h-3 w-3" /> {message}
            </p>
          ) : status === 'error' ? (
            <p className="border-t border-stone-200 px-3 py-1.5 text-[11px] text-red-600">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
