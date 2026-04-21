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
  publishes,
  socialConnections,
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
  return internalGenerateDraft({ campaignId, planItemIndex, branchName: 'main' });
}

/**
 * Create (or reuse) a variant branch for a plan item and generate a draft on it.
 * Naming convention: `variant-{planItemIndex}-{alpha}` where alpha is a,b,c,… based on
 * how many variant branches already exist for that plan item.
 */
export async function generateVariantForPlanItem(
  campaignId: string,
  planItemIndex: number,
) {
  const { activeOrgId } = await requireOrgSession();
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, activeOrgId)))
    .limit(1);
  if (!campaign) return { error: 'campaign not found' };

  const existing = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.campaignId, campaignId));
  const prefix = `variant-${planItemIndex}-`;
  const count = existing.filter((b) => b.name.startsWith(prefix)).length;
  const label = String.fromCharCode('b'.charCodeAt(0) + count);
  const branchName = `${prefix}${label}`;

  return internalGenerateDraft({
    campaignId,
    planItemIndex,
    branchName,
    variantLabel: label,
  });
}

async function internalGenerateDraft(params: {
  campaignId: string;
  planItemIndex: number;
  branchName: string;
  variantLabel?: string;
}) {
  const { campaignId, planItemIndex, branchName, variantLabel } = params;
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

  // Resolve or create the target branch.
  let [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.campaignId, campaignId), eq(branches.name, branchName)))
    .limit(1);
  if (!branch) {
    const [mainBranch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.campaignId, campaignId), eq(branches.name, 'main')))
      .limit(1);
    [branch] = await db
      .insert(branches)
      .values({
        campaignId,
        name: branchName,
        headCommitId: mainBranch?.headCommitId ?? null,
        createdByUserId: session.user.id,
      })
      .returning();
    await emit({
      organizationId: activeOrgId,
      type: EventType.BranchCreated,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.Branch, id: branch!.id },
      campaignId,
      properties: { branch: branchName, variantLabel: variantLabel ?? null, planItemIndex },
      message: `Created branch ${branchName}`,
    });
  }
  if (!branch) return { error: 'branch missing' };

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
        branchId: branch.id,
        parentCommitId: branch.headCommitId ?? null,
        contentHash: hash,
        message: variantLabel
          ? `Variant ${variantLabel.toUpperCase()}: ${planItem.platform} · ${planItem.contentType} — ${planItem.hook.slice(0, 60)}`
          : `Draft: ${planItem.platform} · ${planItem.contentType} — ${planItem.hook.slice(0, 60)}`,
        authorUserId: session.user.id,
        authoredBy: 'agent',
        agentRunId: run!.id,
        planItemIndex,
        variantLabel: variantLabel ?? null,
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
      .where(eq(branches.id, branch.id));

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

// ---------------------------------------------------------------------------
// Auto-iterate: regenerate a plan item using top-performing prior drafts as examples
// ---------------------------------------------------------------------------

export async function autoIterateForPlanItem(
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

  // Find every prior draft for this plan item across all branches.
  const priorDrafts = await db
    .select({
      id: commits.id,
      message: commits.message,
      payload: assets.payload,
    })
    .from(commits)
    .leftJoin(assets, eq(assets.commitId, commits.id))
    .where(
      and(
        eq(commits.campaignId, campaignId),
        eq(commits.planItemIndex, planItemIndex),
      ),
    );

  if (priorDrafts.length === 0) {
    return { error: 'no prior drafts for this plan item yet — use the Draft button first' };
  }

  // Rank by engagement score, keep top 3 as positive examples.
  const { loadCommitMetrics, engagementScore } = await import('@/lib/commit-metrics');
  const metricsMap = await loadCommitMetrics(priorDrafts.map((d) => d.id));
  const ranked = priorDrafts
    .map((d) => ({ ...d, metrics: metricsMap.get(d.id)! }))
    .sort((a, b) => engagementScore(b.metrics) - engagementScore(a.metrics));

  const pastWinners = ranked.slice(0, 3).map((d) => ({
    content: payloadToPlainText(d.payload as AssetPayload | null),
    metrics_summary: formatMetricsSummary(d.metrics),
  }));

  // Spawn a new variant branch so it's an A/B candidate against the current main.
  const existingVariants = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.campaignId, campaignId));
  const prefix = `variant-${planItemIndex}-`;
  const count = existingVariants.filter((b) => b.name.startsWith(prefix)).length;
  const label = String.fromCharCode('b'.charCodeAt(0) + count);
  const branchName = `${prefix}${label}`;

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
      agentKind: 'optimizer',
      status: 'running',
      input: {
        planItem,
        brand: brand ?? null,
        pastWinners,
        mode: 'auto-iterate',
      } as never,
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
    properties: {
      kind: 'auto-iterate',
      planItemIndex,
      basedOn: pastWinners.length,
    },
    message: `Auto-iterating from ${pastWinners.length} prior draft(s)`,
  });

  try {
    // Create branch
    const [mainBranch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.campaignId, campaignId), eq(branches.name, 'main')))
      .limit(1);
    const [branch] = await db
      .insert(branches)
      .values({
        campaignId,
        name: branchName,
        headCommitId: mainBranch?.headCommitId ?? null,
        createdByUserId: session.user.id,
      })
      .returning();

    await emit({
      organizationId: activeOrgId,
      type: EventType.BranchCreated,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.Branch, id: branch!.id },
      campaignId,
      properties: { branch: branchName, variantLabel: label, planItemIndex },
      message: `Created branch ${branchName}`,
    });

    const out = await callAgent('/agents/content/run', {
      organization_id: activeOrgId,
      plan_item: planItem,
      platform: planItem.platform,
      brand: brand ?? null,
      past_winners: pastWinners,
    });
    const draft = String(out.draft ?? '').trim();
    if (!draft) throw new Error('agent returned empty draft');

    const payload = draftToPayload(draft, planItem.contentType, planItem.platform);
    const hash = contentHash(payload);

    const [commit] = await db
      .insert(commits)
      .values({
        campaignId,
        branchId: branch!.id,
        parentCommitId: branch!.headCommitId ?? null,
        contentHash: hash,
        message: `Auto-iterate ${label.toUpperCase()}: ${planItem.platform} · ${planItem.contentType} — ${planItem.hook.slice(0, 60)}`,
        authorUserId: session.user.id,
        authoredBy: 'agent',
        agentRunId: run!.id,
        planItemIndex,
        variantLabel: label,
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
      .where(eq(branches.id, branch!.id));

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
      properties: { kind: 'auto-iterate', variant: label },
      message: `Auto-iterate produced variant ${label.toUpperCase()}`,
    });

    revalidatePath(`/dashboard/campaigns/${campaignId}`);
    return { ok: true, commitId: commit!.id, branch: branchName };
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
      properties: { kind: 'auto-iterate', error: message },
      message: `Auto-iterate failed: ${message}`,
    });
    return { error: message };
  }
}

function payloadToPlainText(payload: AssetPayload | null): string {
  if (!payload) return '';
  if (payload.kind === 'text_post') return payload.body;
  if (payload.kind === 'thread') return payload.items.map((i) => i.body).join('\n\n');
  if (payload.kind === 'email') return `${payload.subject}\n\n${payload.bodyMarkdown}`;
  if (payload.kind === 'image') return payload.caption;
  if (payload.kind === 'video') return payload.caption;
  if (payload.kind === 'carousel') return payload.slides.map((s) => s.caption ?? '').join('\n\n');
  return '';
}

function formatMetricsSummary(m: {
  impressions: number;
  clicks: number;
  signups: number;
  conversions: number;
  revenueUsdMicros: number;
}): string {
  const parts: string[] = [];
  if (m.impressions) parts.push(`${m.impressions.toLocaleString()} impressions`);
  if (m.clicks) parts.push(`${m.clicks.toLocaleString()} clicks`);
  if (m.signups) parts.push(`${m.signups} signups`);
  if (m.conversions) parts.push(`${m.conversions} conversions`);
  if (m.revenueUsdMicros) parts.push(`$${(m.revenueUsdMicros / 1_000_000).toFixed(2)} revenue`);
  return parts.length ? parts.join(' · ') : 'prior draft';
}

// ---------------------------------------------------------------------------
// Image generation — new child commit with image payload
// ---------------------------------------------------------------------------

export async function generateImageForCommit(params: {
  commitId: string;
  prompt?: string | null;
}) {
  const { session, activeOrgId } = await requireOrgSession();

  const [parent] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, params.commitId))
    .limit(1);
  if (!parent) return { error: 'commit not found' };

  const [parentAsset] = await db
    .select()
    .from(assets)
    .where(eq(assets.commitId, parent.id))
    .limit(1);

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, parent.campaignId))
    .limit(1);
  if (!campaign) return { error: 'campaign not found' };

  const planItem =
    parent.planItemIndex !== null && parent.planItemIndex !== undefined
      ? (campaign.plan?.posts?.[parent.planItemIndex] ?? null)
      : null;

  const [run] = await db
    .insert(agentRuns)
    .values({
      organizationId: activeOrgId,
      campaignId: parent.campaignId,
      agentKind: 'creative',
      status: 'running',
      input: { planItem, prompt: params.prompt ?? null } as never,
      startedAt: new Date(),
      triggeredByUserId: session.user.id,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.AgentRunStarted,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.AgentRun, id: run!.id },
    campaignId: parent.campaignId,
    commitId: parent.id,
    properties: { kind: 'image' },
    message: 'Generating image',
  });

  try {
    const out = await callAgent('/agents/image/generate', {
      organization_id: activeOrgId,
      plan_item: planItem,
      prompt: params.prompt ?? undefined,
    });
    const imageUrl = String(out.image_url ?? '');
    const promptUsed = String(out.prompt_used ?? '');
    if (!imageUrl) throw new Error('agents service returned no image_url');

    const { ingestRemoteImage } = await import('@/lib/media');
    const blob = await ingestRemoteImage({
      organizationId: activeOrgId,
      url: imageUrl,
      createdByUserId: session.user.id,
      sourceLabel: 'dall-e-3',
    });

    const caption = captionFromParent(
      parentAsset?.payload as AssetPayload | undefined,
      planItem,
    );
    const payload: AssetPayload = {
      kind: 'image',
      caption,
      blobIds: [blob.blobId],
    };
    const hash = contentHash(payload);

    const [commit] = await db
      .insert(commits)
      .values({
        campaignId: parent.campaignId,
        branchId: parent.branchId,
        parentCommitId: parent.id,
        contentHash: hash,
        message: `Image: ${promptUsed.slice(0, 80)}`,
        authorUserId: session.user.id,
        authoredBy: 'agent',
        agentRunId: run!.id,
        planItemIndex: parent.planItemIndex,
        variantLabel: parent.variantLabel,
      })
      .returning();

    const [asset] = await db
      .insert(assets)
      .values({
        commitId: commit!.id,
        contentType: 'image',
        platforms: (parentAsset?.platforms as Platform[] | undefined) ?? ['x'],
        payload,
      })
      .returning();

    await db
      .update(branches)
      .set({ headCommitId: commit!.id })
      .where(eq(branches.id, parent.branchId));

    await db
      .update(agentRuns)
      .set({
        status: 'succeeded',
        output: {
          commitId: commit!.id,
          assetId: asset!.id,
          blobId: blob.blobId,
          promptUsed,
          deduped: blob.deduped,
        } as never,
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, run!.id));

    await emit({
      organizationId: activeOrgId,
      type: EventType.AgentRunCompleted,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.AgentRun, id: run!.id },
      campaignId: parent.campaignId,
      commitId: commit!.id,
      assetId: asset!.id,
      properties: {
        kind: 'image',
        deduped: blob.deduped,
        model: out.model ?? 'dall-e-3',
      },
      message: 'Generated image',
    });

    await emit({
      organizationId: activeOrgId,
      type: EventType.AssetCreated,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.Asset, id: asset!.id },
      campaignId: parent.campaignId,
      commitId: commit!.id,
      assetId: asset!.id,
      properties: { kind: 'image' },
    });

    revalidatePath(`/dashboard/campaigns/${parent.campaignId}`);
    revalidatePath(`/dashboard/campaigns/${parent.campaignId}/commits/${commit!.id}`);
    return { ok: true, commitId: commit!.id, blobId: blob.blobId };
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
      campaignId: parent.campaignId,
      commitId: parent.id,
      properties: { kind: 'image', error: message },
      message: `Image generation failed: ${message}`,
    });
    return { error: message };
  }
}

function buildPublishMetadata(
  platform: string,
  recipient: string | null,
): Record<string, unknown> | null {
  if (platform === 'email') {
    if (!recipient) throw new Error('email publish requires a recipient');
    return { recipient };
  }
  return null;
}

function captionFromParent(
  parentPayload: AssetPayload | undefined,
  planItem: { hook?: string; cta?: string } | null,
): string {
  if (!parentPayload) return planItem?.hook ?? '';
  if (parentPayload.kind === 'text_post') return parentPayload.body;
  if (parentPayload.kind === 'thread') return parentPayload.items[0]?.body ?? '';
  if (parentPayload.kind === 'email') return parentPayload.subject;
  if (parentPayload.kind === 'image') return parentPayload.caption;
  if (parentPayload.kind === 'carousel') return parentPayload.slides[0]?.caption ?? '';
  return planItem?.hook ?? '';
}

// ---------------------------------------------------------------------------
// Publishing (P0-2 + P0-3: scheduled via BullMQ delay)
// ---------------------------------------------------------------------------

async function enqueuePublishJob(params: {
  publishId: string;
  organizationId: string;
  delayMs: number;
}) {
  const { Queue } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const q = new Queue('publish', { connection });
  try {
    await q.add(
      'run',
      { publishId: params.publishId, organizationId: params.organizationId },
      {
        delay: Math.max(0, params.delayMs),
        removeOnComplete: 200,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    );
  } finally {
    await q.close();
    await connection.quit();
  }
}

export async function publishCommit(params: {
  commitId: string;
  connectionId: string;
  scheduledFor?: string | null;
  recipient?: string | null;
}) {
  const { session, activeOrgId } = await requireOrgSession();

  const [commit] = await db.select().from(commits).where(eq(commits.id, params.commitId)).limit(1);
  if (!commit) return { error: 'commit not found' };

  const [connection] = await db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.id, params.connectionId),
        eq(socialConnections.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!connection) return { error: 'connection not found' };
  if (connection.status !== 'active') {
    return { error: `connection is ${connection.status}` };
  }

  const scheduledFor = params.scheduledFor ? new Date(params.scheduledFor) : new Date();
  if (Number.isNaN(scheduledFor.getTime())) {
    return { error: 'invalid schedule timestamp' };
  }

  const [row] = await db
    .insert(publishes)
    .values({
      organizationId: activeOrgId,
      commitId: commit.id,
      platform: connection.platform,
      socialConnectionId: connection.id,
      scheduledFor,
      status: 'pending',
      metadata: buildPublishMetadata(connection.platform, params.recipient ?? null),
      createdByUserId: session.user.id,
    })
    .returning();

  await enqueuePublishJob({
    publishId: row!.id,
    organizationId: activeOrgId,
    delayMs: scheduledFor.getTime() - Date.now(),
  });

  await emit({
    organizationId: activeOrgId,
    type: EventType.PublishScheduled,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Publish, id: row!.id },
    campaignId: commit.campaignId,
    commitId: commit.id,
    platform: connection.platform,
    properties: {
      scheduledFor: scheduledFor.toISOString(),
      handle: connection.accountHandle,
    },
    message:
      scheduledFor.getTime() <= Date.now() + 5000
        ? `Queued publish to ${connection.platform} @${connection.accountHandle}`
        : `Scheduled ${connection.platform} publish for ${scheduledFor.toLocaleString()}`,
  });

  revalidatePath(`/dashboard/campaigns/${commit.campaignId}/commits/${commit.id}`);
  return { ok: true, publishId: row!.id };
}

export async function cancelPublish(publishId: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(publishes)
    .where(
      and(eq(publishes.id, publishId), eq(publishes.organizationId, activeOrgId)),
    )
    .limit(1);
  if (!row) return { error: 'publish not found' };
  if (row.status !== 'pending') return { error: `cannot cancel status=${row.status}` };

  await db
    .update(publishes)
    .set({ status: 'cancelled' })
    .where(eq(publishes.id, publishId));

  await emit({
    organizationId: activeOrgId,
    type: EventType.PublishFailed, // reuse — "cancelled" is a terminal non-success for the feed
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Publish, id: row.id },
    campaignId: null,
    commitId: row.commitId,
    platform: row.platform,
    properties: { cancelled: true },
    message: 'Cancelled scheduled publish',
  });

  revalidatePath(`/dashboard/campaigns/${row.commitId}`);
  return { ok: true };
}

// Re-exported briefly so the form can narrow types without pulling shared everywhere.
export type { CampaignBrief, CampaignPlanItem };
