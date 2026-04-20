import Link from 'next/link';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { Activity as ActivityIcon, Users2, User } from 'lucide-react';
import { db, events, user, member } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { ActivityFeed } from '@/components/events/ActivityFeed';
import { requireOrgSession } from '@/lib/require-session';

type Scope = 'me' | 'team' | 'all';
type Range = 'today' | '7d' | '30d' | 'all';

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const scope: Scope =
    sp.scope === 'me' || sp.scope === 'team' || sp.scope === 'all' ? sp.scope : 'team';
  const range: Range =
    sp.range === 'today' || sp.range === '7d' || sp.range === '30d' || sp.range === 'all'
      ? sp.range
      : '7d';

  const { session, activeOrgId } = await requireOrgSession();

  const since = rangeStart(range);

  const whereParts = [eq(events.organizationId, activeOrgId)];
  if (since) whereParts.push(gte(events.occurredAt, since));
  if (scope === 'me') whereParts.push(eq(events.actorUserId, session.user.id));

  const rows = await db
    .select()
    .from(events)
    .where(and(...whereParts))
    .orderBy(desc(events.occurredAt))
    .limit(200);

  const members = await db
    .select({ userId: member.userId, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));

  const users = members.map((m) => ({ id: m.userId, name: m.name }));

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle={`${rows.length} event${rows.length === 1 ? '' : 's'} · ${rangeLabel(range)}`}
      />
      <PageBody>
        <div className="mb-4 flex items-center justify-between gap-3">
          <ScopeTabs current={scope} range={range} />
          <RangePills current={range} scope={scope} />
        </div>

        <Card>
          <CardBody>
            <ActivityFeed
              events={rows as never}
              users={users}
              emptyTitle="Nothing happened yet"
              emptyDescription={
                scope === 'me'
                  ? 'Your actions will show up here.'
                  : 'Add a brand source, create a campaign, or invite a teammate to fill this stream.'
              }
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}

function rangeStart(r: Range): Date | null {
  const now = Date.now();
  if (r === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (r === '7d') return new Date(now - 7 * 86_400_000);
  if (r === '30d') return new Date(now - 30 * 86_400_000);
  return null;
}

function rangeLabel(r: Range): string {
  if (r === 'today') return 'today';
  if (r === '7d') return 'last 7 days';
  if (r === '30d') return 'last 30 days';
  return 'all time';
}

function ScopeTabs({ current, range }: { current: Scope; range: Range }) {
  const items: { value: Scope; label: string; icon: typeof User }[] = [
    { value: 'me', label: 'You', icon: User },
    { value: 'team', label: 'Team', icon: Users2 },
    { value: 'all', label: 'All', icon: ActivityIcon },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
      {items.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <Link
            key={value}
            href={`/dashboard/activity?scope=${value}&range=${range}`}
            className={
              active
                ? 'flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white'
                : 'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100'
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function RangePills({ current, scope }: { current: Range; scope: Scope }) {
  const items: { value: Range; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: 'All' },
  ];
  return (
    <div className="inline-flex items-center gap-1">
      {items.map(({ value, label }) => {
        const active = current === value;
        return (
          <Link
            key={value}
            href={`/dashboard/activity?scope=${scope}&range=${value}`}
            className={
              active
                ? 'rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white'
                : 'rounded-md px-2.5 py-1 text-xs font-medium text-stone-500 hover:text-stone-900'
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
