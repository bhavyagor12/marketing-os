'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, emit, commitComments, commits } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';

export async function addCommitComment(params: {
  commitId: string;
  body: string;
  parentCommentId?: string | null;
}) {
  const { session, activeOrgId } = await requireOrgSession();
  const body = params.body.trim();
  if (!body) return { error: 'Comment cannot be empty' };
  if (body.length > 5000) return { error: 'Comment is too long' };

  const [commit] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, params.commitId))
    .limit(1);
  if (!commit) return { error: 'commit not found' };

  const [row] = await db
    .insert(commitComments)
    .values({
      commitId: params.commitId,
      authorUserId: session.user.id,
      body,
      parentCommentId: params.parentCommentId ?? null,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.CommentCreated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Comment, id: row!.id },
    campaignId: commit.campaignId,
    commitId: commit.id,
    properties: { parentCommentId: params.parentCommentId ?? null },
    message: body.slice(0, 120),
  });

  revalidatePath(`/dashboard/campaigns/${commit.campaignId}/commits/${commit.id}`);
  return { ok: true };
}

export async function resolveCommitComment(commentId: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(commitComments)
    .where(eq(commitComments.id, commentId))
    .limit(1);
  if (!row) return { error: 'comment not found' };

  await db
    .update(commitComments)
    .set({ resolved: true, updatedAt: new Date() })
    .where(eq(commitComments.id, commentId));

  const [commit] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, row.commitId))
    .limit(1);

  await emit({
    organizationId: activeOrgId,
    type: EventType.CommentResolved,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Comment, id: row.id },
    campaignId: commit?.campaignId ?? null,
    commitId: row.commitId,
    message: 'Resolved a comment',
  });

  if (commit) {
    revalidatePath(`/dashboard/campaigns/${commit.campaignId}/commits/${commit.id}`);
  }
  return { ok: true };
}

export async function deleteCommitComment(commentId: string) {
  const { session } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(commitComments)
    .where(
      and(
        eq(commitComments.id, commentId),
        eq(commitComments.authorUserId, session.user.id),
      ),
    )
    .limit(1);
  if (!row) return { error: 'comment not found or not yours' };

  await db.delete(commitComments).where(eq(commitComments.id, commentId));

  const [commit] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, row.commitId))
    .limit(1);
  if (commit) {
    revalidatePath(`/dashboard/campaigns/${commit.campaignId}/commits/${commit.id}`);
  }
  return { ok: true };
}
