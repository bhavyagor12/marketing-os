'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Send, Calendar, Plug, X as XIcon, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cx } from '@/lib/cx';
import { publishCommit, cancelPublish } from '../../../actions';

type Connection = {
  id: string;
  platform: string;
  accountHandle: string;
};

type Publish = {
  id: string;
  platform: string;
  socialConnectionId: string;
  scheduledFor: Date | string;
  status: 'pending' | 'publishing' | 'published' | 'failed' | 'cancelled';
  externalUrl: string | null;
  error: string | null;
  publishedAt: Date | string | null;
  createdAt: Date | string;
};

export function PublishPanel({
  commitId,
  connections,
  publishesForCommit,
}: {
  commitId: string;
  connections: Connection[];
  publishesForCommit: Publish[];
}) {
  const [selected, setSelected] = useState<string>(connections[0]?.id ?? '');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(defaultSchedule());
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectedConnection = connections.find((c) => c.id === selected);
  const isEmail = selectedConnection?.platform === 'email';

  if (connections.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stone-300 bg-stone-50/60 px-4 py-5 text-center">
        <Plug className="mx-auto mb-2 h-5 w-5 text-stone-400" />
        <p className="text-sm font-medium text-stone-900">No social accounts connected</p>
        <p className="mt-1 text-xs text-stone-500">
          Connect X (or other platforms) before publishing.
        </p>
        <Link href="/dashboard/connections">
          <Button size="sm" variant="secondary" className="mt-3">
            Go to Connections
          </Button>
        </Link>
      </div>
    );
  }

  function doPublish(schedule: boolean) {
    setError(null);
    if (isEmail && !recipient.trim()) {
      setError('Recipient email required for email publish');
      return;
    }
    start(async () => {
      const res = await publishCommit({
        commitId,
        connectionId: selected,
        scheduledFor: schedule ? scheduledFor : null,
        recipient: isEmail ? recipient.trim() : null,
      });
      if (res?.error) setError(res.error);
      else {
        setScheduleOpen(false);
        setRecipient('');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
          Account
        </label>
        <div className="flex flex-wrap gap-2">
          {connections.map((c) => {
            const active = c.id === selected;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition',
                  active
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
                )}
              >
                <span className="font-medium">@{c.accountHandle}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {c.platform}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isEmail ? (
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-600">
            Recipient
          </label>
          <input
            type="email"
            placeholder="someone@company.com"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
          <p className="mt-1 text-xs text-stone-500">
            MVP sends to one address. List segments and bulk sends come with the leads primitive.
          </p>
        </div>
      ) : null}

      {scheduleOpen ? (
        <div className="space-y-2 rounded-md border border-stone-200 bg-stone-50 p-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-stone-600">
            Schedule for
          </label>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="w-full rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
          <p className="text-xs text-stone-500">
            Your local timezone. The worker will fire at this time via BullMQ delayed job.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !selected}
          leadingIcon={<Send className="h-3.5 w-3.5" />}
          onClick={() => doPublish(scheduleOpen)}
        >
          {pending ? 'Queuing…' : scheduleOpen ? 'Schedule publish' : 'Publish now'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Calendar className="h-3.5 w-3.5" />}
          onClick={() => setScheduleOpen((v) => !v)}
        >
          {scheduleOpen ? 'Publish now instead' : 'Schedule…'}
        </Button>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {publishesForCommit.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            Publishes
          </h4>
          <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
            {publishesForCommit.map((p) => (
              <PublishRow key={p.id} p={p} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PublishRow({ p }: { p: Publish }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <StatusIcon status={p.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-900">{p.platform}</span>
          <StatusBadge status={p.status} />
          {p.externalUrl ? (
            <a
              href={p.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-stone-500 underline hover:text-stone-900"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-stone-500">
          {p.status === 'pending'
            ? `Scheduled ${new Date(p.scheduledFor).toLocaleString()}`
            : p.publishedAt
              ? `Sent ${new Date(p.publishedAt).toLocaleString()}`
              : `Created ${new Date(p.createdAt).toLocaleString()}`}
        </p>
        {p.error ? <p className="mt-0.5 text-xs text-red-600">{p.error}</p> : null}
      </div>
      {p.status === 'pending' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await cancelPublish(p.id);
            })
          }
          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
          aria-label="Cancel publish"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </li>
  );
}

function StatusIcon({ status }: { status: Publish['status'] }) {
  const cls =
    status === 'published'
      ? 'text-emerald-600'
      : status === 'failed'
        ? 'text-red-600'
        : status === 'cancelled'
          ? 'text-stone-400'
          : 'text-blue-600';
  const Icon =
    status === 'published' ? CheckCircle2 : status === 'failed' ? XIcon : Send;
  return <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', cls)} />;
}

function StatusBadge({ status }: { status: Publish['status'] }) {
  if (status === 'published') return <Badge tone="success" dot>Live</Badge>;
  if (status === 'failed') return <Badge tone="danger" dot>Failed</Badge>;
  if (status === 'cancelled') return <Badge tone="neutral">Cancelled</Badge>;
  if (status === 'publishing') return <Badge tone="info" dot>Publishing</Badge>;
  return <Badge tone="info">Scheduled</Badge>;
}

function defaultSchedule(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
