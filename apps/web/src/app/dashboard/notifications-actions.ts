'use server';

import { and, desc, eq, gt, ne, or, count } from 'drizzle-orm';
import { db, events, member, user } from '@marketing-os/db';
import { requireOrgSession } from '@/lib/require-session';

/**
 * Notifications are events in your org that aren't your own actions. Currently we exclude
 * the viewer's own events — future refinement will filter to events where the viewer is
 * explicitly involved (e.g., @mentioned, their commit got commented on).
 */

export async function getNotifications() {
  const { session, activeOrgId } = await requireOrgSession();

  const [me] = await db
    .select({ lastReadAt: member.notificationsLastReadAt })
    .from(member)
    .where(
      and(
        eq(member.organizationId, activeOrgId),
        eq(member.userId, session.user.id),
      ),
    )
    .limit(1);

  const lastReadAt = me?.lastReadAt ?? new Date(0);

  const recent = await db
    .select({
      id: events.id,
      type: events.type,
      message: events.message,
      properties: events.properties,
      occurredAt: events.occurredAt,
      actorUserId: events.actorUserId,
      actorSystem: events.actorSystem,
      actorAgentRunId: events.actorAgentRunId,
      subjectType: events.subjectType,
      subjectId: events.subjectId,
      campaignId: events.campaignId,
      commitId: events.commitId,
      assetId: events.assetId,
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, activeOrgId),
        or(ne(events.actorUserId, session.user.id), eq(events.actorSystem, true)),
      ),
    )
    .orderBy(desc(events.occurredAt))
    .limit(20);

  const [unreadRow] = await db
    .select({ total: count() })
    .from(events)
    .where(
      and(
        eq(events.organizationId, activeOrgId),
        or(ne(events.actorUserId, session.user.id), eq(events.actorSystem, true)),
        gt(events.occurredAt, lastReadAt),
      ),
    );

  const members = await db
    .select({ userId: member.userId, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));

  return {
    events: recent,
    users: members.map((m) => ({ id: m.userId, name: m.name })),
    unread: unreadRow?.total ?? 0,
    lastReadAt,
  };
}

export async function markNotificationsRead() {
  const { session, activeOrgId } = await requireOrgSession();
  await db
    .update(member)
    .set({ notificationsLastReadAt: new Date() })
    .where(
      and(
        eq(member.organizationId, activeOrgId),
        eq(member.userId, session.user.id),
      ),
    );
  return { ok: true };
}
