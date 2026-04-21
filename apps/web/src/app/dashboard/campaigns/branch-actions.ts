'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, emit, branches, campaigns, commits } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';

const BRANCH_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,60}$/;

export async function createBranch(params: {
  campaignId: string;
  name: string;
  fromCommitId?: string | null;
}) {
  const { session, activeOrgId } = await requireOrgSession();

  const name = params.name.trim();
  if (!BRANCH_NAME_RE.test(name)) {
    return { error: 'Branch names can only use letters, digits, and . _ - /' };
  }
  if (name === 'main') return { error: 'main is reserved' };

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, params.campaignId), eq(campaigns.organizationId, activeOrgId)))
    .limit(1);
  if (!campaign) return { error: 'campaign not found' };

  const [existing] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.campaignId, params.campaignId), eq(branches.name, name)))
    .limit(1);
  if (existing) return { error: `Branch "${name}" already exists` };

  // Resolve starting head: either the provided commit, or main's current head.
  let startCommitId: string | null = params.fromCommitId ?? null;
  if (!startCommitId) {
    const [mainBranch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.campaignId, params.campaignId), eq(branches.name, 'main')))
      .limit(1);
    startCommitId = mainBranch?.headCommitId ?? null;
  } else {
    // Validate the commit actually belongs to this campaign.
    const [c] = await db
      .select({ campaignId: commits.campaignId })
      .from(commits)
      .where(eq(commits.id, startCommitId))
      .limit(1);
    if (!c || c.campaignId !== params.campaignId) {
      return { error: 'Source commit does not belong to this campaign' };
    }
  }

  const [row] = await db
    .insert(branches)
    .values({
      campaignId: params.campaignId,
      name,
      headCommitId: startCommitId,
      createdByUserId: session.user.id,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.BranchCreated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Branch, id: row!.id },
    campaignId: params.campaignId,
    properties: { branch: name, from: startCommitId },
    message: `Created branch ${name}`,
  });

  revalidatePath(`/dashboard/campaigns/${params.campaignId}`);
  return { ok: true, id: row!.id, name };
}
