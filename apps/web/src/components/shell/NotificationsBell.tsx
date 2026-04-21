'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { Bell } from 'lucide-react';
import { cx } from '@/lib/cx';
import { EventIcon, relativeTime, actorLabel, type EventLike } from '@/components/events/eventRenderer';
import { getNotifications, markNotificationsRead } from '@/app/dashboard/notifications-actions';

type Fetched = {
  events: EventLike[];
  users: { id: string; name: string }[];
  unread: number;
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Fetched | null>(null);
  const [loading, setLoading] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await getNotifications();
      setData(res as never);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (!open) void refresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next && (data?.unread ?? 0) > 0) {
        start(async () => {
          await markNotificationsRead();
          await refresh();
        });
      }
      return next;
    });
  }

  const userLookup = new Map((data?.users ?? []).map((u) => [u.id, { name: u.name }]));
  const unread = data?.unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className={cx(
          'relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition',
          'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
        )}
      >
        <Bell className="h-4 w-4" />
        <span className="flex-1 text-left">Notifications</span>
        {unread > 0 ? (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 mb-1 w-80 rounded-md border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Activity
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && !data ? (
              <p className="px-3 py-6 text-center text-xs text-stone-500">Loading…</p>
            ) : !data?.events.length ? (
              <p className="px-3 py-6 text-center text-xs text-stone-500">
                No activity from teammates yet.
              </p>
            ) : (
              <ul>
                {data.events.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-2.5 px-3 py-2 hover:bg-stone-50"
                  >
                    <EventIcon type={e.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug text-stone-800">
                        {actorLabel(e, userLookup)}{' '}
                        <span className="text-stone-600">{e.message ?? prettify(e.type)}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-stone-400">
                        {relativeTime(e.occurredAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function prettify(type: string): string {
  return type
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
