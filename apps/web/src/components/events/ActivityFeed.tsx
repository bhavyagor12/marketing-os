import { EventIcon, relativeTime, actorLabel, type EventLike } from './eventRenderer';
import { EmptyState } from '@/components/ui/EmptyState';
import { Activity } from 'lucide-react';

export function ActivityFeed({
  events,
  users,
  emptyTitle = 'No activity yet',
  emptyDescription = 'Your team’s actions will appear here as they happen.',
  dense = false,
}: {
  events: EventLike[];
  users: { id: string; name: string }[];
  emptyTitle?: string;
  emptyDescription?: string;
  dense?: boolean;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-4 w-4" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const userLookup = new Map(users.map((u) => [u.id, { name: u.name }]));

  return (
    <ul className={dense ? 'space-y-1' : 'divide-y divide-stone-200'}>
      {events.map((e) => (
        <li
          key={e.id}
          className={
            dense
              ? 'flex items-start gap-3 rounded-md px-1 py-1.5 hover:bg-stone-50'
              : 'flex items-start gap-3 py-3 first:pt-0 last:pb-0'
          }
        >
          <EventIcon type={e.type} />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug text-stone-800">
              {actorLabel(e, userLookup)}{' '}
              <span className="text-stone-600">{e.message ?? prettifyType(e.type)}</span>
            </p>
            <p className="mt-0.5 text-xs text-stone-400">{relativeTime(e.occurredAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function prettifyType(type: string): string {
  return type
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
