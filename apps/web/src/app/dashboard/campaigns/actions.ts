'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { eq, and, desc } from 'drizzle-orm';
import {
  db,
  emit,
  campaigns,
  branches,
  commits,
  assets,
  brandProfiles,
  agentRuns,
  approvals,
} from '@marketing-os/db';
import {
  EventType,
  EventSubjectType,
  campaignBriefSchema,
  campaignPlanSchema,
  type CampaignBrief,
  type CampaignPlanItem,
  type Platform,
  type ContentType,
  type AssetPayload,
} from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';

function contentHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// ---------------------------------------------------------------------------
// Create campaign
// ---------------------------------------------------------------------------

export async function createCampaign(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();

  const parsed = campaignBriefSchema.safeParse({
    goal: String(formData.get('goal') ?? '').trim(),
    product: String(formData.get('product') ?? '').trim(),
    audience: String(formData.get('audience') ?? '').trim(),
    platforms: formData.getAll('platforms').map(String),
    timeline: (formData.get('timeline') as string | null) || undefined,
    toneOverrides: (formData.get('toneOverrides') as string | null) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  const name = String(formData.get('name') ?? '').trim() || parsed.data.goal.slice(0, 80);
  const description = (formData.get('description') as string | null) || null;

  const [campaign] = await db
    .insert(campaigns)
    .values({
      organizationId: activeOrgId,
      name,
      description,
      status: 'draft',
      brief: parsed.data,
      createdByUserId: session.user.id,
    })
    .returning();

  // Every campaign gets a `main` branch immediately — it's the trunk for all commits.
  const [mainBranch] = await db
    .insert(branches)
    .values({
      campaignId: campaign!.id,
      name: 'main',
      createdByUserId: session.user.id,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.CampaignCreated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Campaign, id: campaign!.id },
    campaignId: campaign!.id,
    properties: { name, platforms: parsed.data.platforms, goal: parsed.data.goal },
    message: `Created campaign "${name}"`,
  });

  await emit({
    organizationId: activeOrgId,
    type: EventType.BranchCreated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Branch, id: mainBranch!.id },
    campaignId: campaign!.id,
    properties: { branch: 'main' },
    message: `Initialized main branch`,
  });

  revalidatePath('/dashboard/campaigns');
  return { ok: true, campaignId: campaign!.id };
}

// ---------------------------------------------------------------------------
// Run planner
// ---------------------------------------------------------------------------

export async function runPlanner(campaignId: string) {
  const { session, activeOrgId } = await requireOrgSession();

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, activeOrgId)))
    .limit(1);
  if (!campaign) return { error: 'campaign not found' };
  if (!campaign.brief) return { error: 'campaign has no brief' };

  const [brand] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, activeOrgId))
    .limit(1);

  const [run] = await db
    .insert(agentRuns)
    .values({
      organizationId: activeOrgId,
      campaignId,
      agentKind: 'planner',
      status: 'running',
      input: { brief: campaign.brief, brand: brand ?? null } as never,
      startedAt: new Date(),
      triggeredByUserId: session.user.id,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.AgentRunStarted,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.AgentRun, id: run!.id },
    campaignId,
    properties: { kind: 'planner' },
    message: 'Planner started',
  });

  try {
    const plan = await callAgent('/agents/planner/run', {
      organization_id: activeOrgId,
      brief: campaign.brief,
      brand: brand ?? null,
    });

    const parsed = campaignPlanSchema.safeParse(plan.plan);
    if (!parsed.success) {
      throw new Error(
        `planner returned invalid plan: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    await db
      .update(campaigns)
      .set({ plan: parsed.data, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    await db
      .update(agentRuns)
      .set({
        status: 'succeeded',
        output: { plan: parsed.data } as never,
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, run!.id));

    await emit({
      organizationId: activeOrgId,
      type: EventType.AgentRunCompleted,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.AgentRun, id: run!.id },
      campaignId,
      properties: { kind: 'planner', posts: parsed.data.posts.length },
      message: `Planner produced ${parsed.data.posts.length} post ideas`,
    });

    revalidatePath(`/dashboard/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(agentRuns)
      .set({ status: 'failed', error: message, completedAt: new Date() })
      .where(eq(agentRuns.id, run!.id));

    await emit({
      organizationId: activeOrgId,
      type: EventType.AgentRunFailed,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.AgentRun, id: run!.id },
      campaignId,
      properties: { kind: 'planner', error: message },
      message: `Planner failed: ${message}`,
    });
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// Generate draft for one plan item → commit on main + asset row
// ---------------------------------------------------------------------------

export async function generateDraftForPlanItem(
  campaignId: string,
  planItemIndex: number,
) {
  const { session, activeOrgId } = await requireOrgSession();

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, activeOrgId)))
    .limit(1);
  if (!campaign) return { error: 'campaign not found' };
  if (!campaign.plan) return { error: 'run the planner first' };

  const planItem = campaign.plan.posts[planItemIndex];
  if (!planItem) return { error: 'plan item out of range' };

  const [mainBranch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.campaignId, campaignId), eq(branches.name, 'main')))
    .limit(1);
  if (!mainBranch) return { error: 'main branch missing' };

  const [brand] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.organizationId, activeOrgId))
    .limit(1);

  const [run] = await db
    .insert(agentRuns)
    .values({
      organizationId: activeOrgId,
      campaignId,
      agentKind: 'content',
      status: 'running',
      input: { planItem, brand: brand ?? null } as never,
      startedAt: new Date(),
      triggeredByUserId: session.user.id,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.AgentRunStarted,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.AgentRun, id: run!.id },
    campaignId,
    properties: { kind: 'content', planItemIndex, platform: planItem.platform },
    message: `Drafting ${planItem.platform} · ${planItem.contentType}`,
  });

  try {
    const out = await callAgent('/agents/content/run', {
      organization_id: activeOrgId,
      plan_item: planItem,
      platform: planItem.platform,
      brand: brand ?? null,
    });
    const draft = String(out.draft ?? '').trim();
    if (!draft) throw new Error('agent returned empty draft');

    const payload = draftToPayload(draft, planItem.contentType, planItem.platform);
    const hash = contentHash(payload);

    const [commit] = await db
      .insert(commits)
      .values({
        campaignId,
        branchId: mainBranch.id,
        parentCommitId: mainBranch.headCommitId ?? null,
        contentHash: hash,
        message: `Draft: ${planItem.platform} · ${planItem.contentType} — ${planItem.hook.slice(0, 60)}`,
        authorUserId: session.user.id,
        authoredBy: 'agent',
        agentRunId: run!.id,
      })
      .returning();

    const [asset] = await db
      .insert(assets)
      .values({
        commitId: commit!.id,
        contentType: planItem.contentType,
        platforms: [planItem.platform] as Platform[],
        payload,
      })
      .returning();

    await db
      .update(branches)
      .set({ headCommitId: commit!.id })
      .where(eq(branches.id, mainBranch.id));

    await db
      .update(agentRuns)
      .set({
        status: 'succeeded',
        output: { commitId: commit!.id, assetId: asset!.id } as never,
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, run!.id));

    await emit({
      organizationId: activeOrgId,
      type: EventType.AgentRunCompleted,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.AgentRun, id: run!.id },
      campaignId,
      commitId: commit!.id,
      assetId: asset!.id,
      properties: { kind: 'content', platform: planItem.platform },
      message: `Drafted ${planItem.platform} post`,
    });

    await emit({
      organizationId: activeOrgId,
      type: EventType.CommitCreated,
      actor: { userId: session.user.id, agentRunId: undefined as never } as never,
      subject: { type: EventSubjectType.Commit, id: commit!.id },
      campaignId,
      commitId: commit!.id,
      assetId: asset!.id,
      properties: { platform: planItem.platform, contentType: planItem.contentType },
      message: `New commit on main`,
    });

    await emit({
      organizationId: activeOrgId,
      type: EventType.AssetCreated,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.Asset, id: asset!.id },
      campaignId,
      commitId: commit!.id,
      assetId: asset!.id,
      properties: { platform: planItem.platform, contentType: planItem.contentType },
    });

    revalidatePath(`/dashboard/campaigns/${campaignId}`);
    return { ok: true, commitId: commit!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(agentRuns)
      .set({ status: 'failed', error: message, completedAt: new Date() })
      .where(eq(agentRuns.id, run!.id));
    await emit({
      organizationId: activeOrgId,
      type: EventType.AgentRunFailed,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.AgentRun, id: run!.id },
      campaignId,
      properties: { kind: 'content', error: message },
      message: `Draft failed: ${message}`,
    });
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// Edit a commit → new child commit with updated payload
// ---------------------------------------------------------------------------

export async function editCommitContent(
  commitId: string,
  rawPayload: string,
  commitMessage: string | null,
) {
  const { session, activeOrgId } = await requireOrgSession();

  const [parent] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, commitId))
    .limit(1);
  if (!parent) return { error: 'commit not found' };

  const [parentAsset] = await db
    .select()
    .from(assets)
    .where(eq(assets.commitId, commitId))
    .limit(1);
  if (!parentAsset) return { error: 'commit has no asset' };

  // Merge the edited raw text back into the payload, preserving non-text fields.
  const updatedPayload = applyEditToPayload(
    parentAsset.payload as AssetPayload,
    rawPayload,
  );
  const hash = contentHash(updatedPayload);

  const [commit] = await db
    .insert(commits)
    .values({
      campaignId: parent.campaignId,
      branchId: parent.branchId,
      parentCommitId: parent.id,
      contentHash: hash,
      message: commitMessage || 'Edited draft',
      authorUserId: session.user.id,
      authoredBy: 'human',
    })
    .returning();

  const [asset] = await db
    .insert(assets)
    .values({
      commitId: commit!.id,
      contentType: parentAsset.contentType,
      platforms: parentAsset.platforms,
      payload: updatedPayload,
    })
    .returning();

  await db
    .update(branches)
    .set({ headCommitId: commit!.id })
    .where(eq(branches.id, parent.branchId));

  await emit({
    organizationId: activeOrgId,
    type: EventType.CommitCreated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Commit, id: commit!.id },
    campaignId: parent.campaignId,
    commitId: commit!.id,
    assetId: asset!.id,
    properties: { edited: true, parentCommitId: parent.id },
    message: commitMessage || 'Edited draft',
  });

  await emit({
    organizationId: activeOrgId,
    type: EventType.AssetEdited,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Asset, id: asset!.id },
    campaignId: parent.campaignId,
    commitId: commit!.id,
    assetId: asset!.id,
  });

  revalidatePath(`/dashboard/campaigns/${parent.campaignId}`);
  revalidatePath(`/dashboard/campaigns/${parent.campaignId}/commits/${commit!.id}`);
  return { ok: true, commitId: commit!.id };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function requestApproval(commitId: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [parent] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, commitId))
    .limit(1);
  if (!parent) return { error: 'commit not found' };

  await db.insert(approvals).values({
    commitId,
    reviewerUserId: session.user.id,
    status: 'requested',
  });

  await emit({
    organizationId: activeOrgId,
    type: EventType.ApprovalRequested,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Commit, id: commitId },
    campaignId: parent.campaignId,
    commitId,
    message: 'Requested approval',
  });

  revalidatePath(`/dashboard/campaigns/${parent.campaignId}/commits/${commitId}`);
  return { ok: true };
}

export async function reviewCommit(
  commitId: string,
  decision: 'approved' | 'changes_requested',
  note: string | null,
) {
  const { session, activeOrgId } = await requireOrgSession();
  const [parent] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, commitId))
    .limit(1);
  if (!parent) return { error: 'commit not found' };

  await db.insert(approvals).values({
    commitId,
    reviewerUserId: session.user.id,
    status: decision,
    note,
  });

  await emit({
    organizationId: activeOrgId,
    type:
      decision === 'approved'
        ? EventType.ApprovalGranted
        : EventType.ApprovalChangesRequested,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Commit, id: commitId },
    campaignId: parent.campaignId,
    commitId,
    properties: { note },
    message: decision === 'approved' ? 'Approved' : 'Requested changes',
  });

  revalidatePath(`/dashboard/campaigns/${parent.campaignId}/commits/${commitId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callAgent(path: string, body: unknown) {
  const agentsUrl =
    process.env.AGENTS_URL ?? process.env.NEXT_PUBLIC_AGENTS_URL ?? 'http://localhost:8000';
  const token = process.env.AGENTS_INTERNAL_TOKEN;
  if (!token) throw new Error('AGENTS_INTERNAL_TOKEN not set');

  const res = await fetch(`${agentsUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agents ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function draftToPayload(
  draft: string,
  contentType: ContentType,
  _platform: Platform,
): AssetPayload {
  if (contentType === 'thread') {
    const items = draft
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((body) => ({ body }));
    return { kind: 'thread', items: items.length > 0 ? items : [{ body: draft }] };
  }
  if (contentType === 'email') {
    const match = draft.match(/^\s*Subject:\s*(.+?)\s*\n([\s\S]*)$/i);
    if (match) {
      return {
        kind: 'email',
        subject: match[1]!.trim(),
        bodyMarkdown: match[2]!.trim(),
      };
    }
    return { kind: 'email', subject: 'Untitled', bodyMarkdown: draft };
  }
  // text_post / image / video / carousel — we only have the text piece right now;
  // media blob IDs get attached by a separate creative agent later.
  return { kind: 'text_post', body: draft };
}

function applyEditToPayload(original: AssetPayload, rawText: string): AssetPayload {
  if (original.kind === 'thread') {
    const items = rawText
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((body) => ({ body }));
    return { kind: 'thread', items: items.length > 0 ? items : [{ body: rawText }] };
  }
  if (original.kind === 'email') {
    const match = rawText.match(/^\s*Subject:\s*(.+?)\s*\n([\s\S]*)$/i);
    if (match) {
      return {
        kind: 'email',
        subject: match[1]!.trim(),
        bodyMarkdown: match[2]!.trim(),
        preheader: original.preheader,
      };
    }
    return {
      kind: 'email',
      subject: original.subject,
      bodyMarkdown: rawText,
      preheader: original.preheader,
    };
  }
  if (original.kind === 'image') {
    return { ...original, caption: rawText };
  }
  if (original.kind === 'video') {
    return { ...original, caption: rawText };
  }
  if (original.kind === 'carousel') {
    // Editing carousel text edits the first slide caption; full structural edits come later.
    return {
      ...original,
      slides: original.slides.map((s, i) => (i === 0 ? { ...s, caption: rawText } : s)),
    };
  }
  return { kind: 'text_post', body: rawText };
}

// Re-exported briefly so the form can narrow types without pulling shared everywhere.
export type { CampaignBrief, CampaignPlanItem };
