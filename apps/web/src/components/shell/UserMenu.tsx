'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { cx } from '@/lib/cx';

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition',
          'hover:bg-stone-100',
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-900 text-[11px] font-semibold text-white">
          {initials || 'U'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-stone-900">{name}</span>
          <span className="block truncate text-xs text-stone-500">{email}</span>
        </span>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-stone-400" />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 mb-1 w-full rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          <button
            onClick={async () => {
              setOpen(false);
              await authClient.signOut();
              router.push('/signin');
              router.refresh();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
          >
            <LogOut className="h-4 w-4 text-stone-500" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
