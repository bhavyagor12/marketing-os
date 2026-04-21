import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import {
  ArrowLeft,
  FileEdit,
  GitCommit,
  Sparkles,
  User,
  Bot,
} from 'lucide-react';
import {
  db,
  campaigns,
  branches,
  commits,
  assets,
  events,
  user,
  member,
} from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityFeed } from '@/components/events/ActivityFeed';
import { loadCommitMetrics, engagementScore } from '@/lib/commit-metrics';
import { requireOrgSession } from '@/lib/require-session';
import { RunPlannerButton } from './RunPlannerButton';
import { PlanItemRow, type PlanItemDraft } from './PlanItemRow';
import { PerformanceCard, type RankedCommit } from './PerformanceCard';

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { activeOrgId } = await requireOrgSession();

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, activeOrgId)))
    .limit(1);
  if (!campaign) notFound();

  const [mainBranch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.campaignId, id), eq(branches.name, 'main')))
    .limit(1);

  const campaignCommits = await db
    .select({
      id: commits.id,
      branchId: commits.branchId,
      parentCommitId: commits.parentCommitId,
      message: commits.message,
      authoredBy: commits.authoredBy,
      authorUserId: commits.authorUserId,
      createdAt: commits.createdAt,
      contentHash: commits.contentHash,
      planItemIndex: commits.planItemIndex,
      variantLabel: commits.variantLabel,
      branchName: branches.name,
      branchHeadCommitId: branches.headCommitId,
      assetContentType: assets.contentType,
      assetPlatforms: assets.platforms,
      assetPayload: assets.payload,
    })
    .from(commits)
    .leftJoin(assets, eq(assets.commitId, commits.id))
    .innerJoin(branches, eq(branches.id, commits.branchId))
    .where(eq(commits.campaignId, id))
    .orderBy(desc(commits.createdAt));

  const campaignEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.organizationId, activeOrgId), eq(events.campaignId, id)))
    .orderBy(desc(events.occurredAt))
    .limit(50);

  const members = await db
    .select({ userId: member.userId, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));

  const users = members.map((m) => ({ id: m.userId, name: m.name }));

  const draftsByPlanItem = new Map<number, typeof campaignCommits>();
  // Roughly group drafts per plan item by matching message prefix — good enough for now.
  const planPosts = campaign.plan?.posts ?? [];

  const metricsByCommit = await loadCommitMetrics(campaignCommits.map((c) => c.id));
  const rankedCommits: RankedCommit[] = campaignCommits
    .map((c) => ({
      id: c.id,
      message: c.message,
      contentType: c.assetContentType,
      platforms: (c.assetPlatforms as string[] | null) ?? [],
      authoredBy: c.authoredBy,
      metrics: metricsByCommit.get(c.id)!,
    }))
    .sort((a, b) => engagementScore(b.metrics) - engagementScore(a.metrics));

  // Group commits by plan item index for the plan display — each plan item shows its
  // drafts (main branch) + any A/B variant branches.
  const draftsByPlanIndex = new Map<number, PlanItemDraft[]>();
  for (const c of campaignCommits) {
    if (c.planItemIndex === null || c.planItemIndex === undefined) continue;
    const draft: PlanItemDraft = {
      id: c.id,
      branchName: c.branchName,
      variantLabel: c.variantLabel,
      isHeadOfBranch: c.branchHeadCommitId === c.id,
      message: c.message,
      contentHash: c.contentHash,
      createdAt: c.createdAt,
      authoredBy: c.authoredBy,
      metrics: metricsByCommit.get(c.id)!,
    };
    const arr = draftsByPlanIndex.get(c.planItemIndex) ?? [];
    arr.push(draft);
    draftsByPlanIndex.set(c.planItemIndex, arr);
  }

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={
          campaign.brief?.goal
            ? campaign.brief.goal
            : 'Draft brief — run the planner to produce a structured plan.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/campaigns">
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                All campaigns
              </Button>
            </Link>
            <RunPlannerButton campaignId={id} hasPlan={Boolean(campaign.plan)} />
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <PerformanceCard campaignId={id} commits={rankedCommits} />

            <Card>
              <CardHeader title="Brief" />
              <CardBody className="space-y-3 text-sm">
                <BriefRow label="Goal" value={campaign.brief?.goal ?? ''} />
                <BriefRow label="Product" value={campaign.brief?.product ?? ''} />
                <BriefRow label="Audience" value={campaign.brief?.audience ?? ''} />
                {campaign.brief?.timeline ? (
                  <BriefRow label="Timeline" value={campaign.brief.timeline} />
                ) : null}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    Platforms
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(campaign.brief?.platforms ?? []).map((p) => (
                      <Badge key={p} tone="info">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Plan"
                subtitle={
                  campaign.plan
                    ? `${planPosts.length} posts planned`
                    : 'Click "Run planner" to generate'
                }
              />
              <CardBody>
                {!campaign.plan ? (
                  <EmptyState
                    icon={<Sparkles className="h-4 w-4" />}
                    title="No plan yet"
                    description="The planner agent reads your brief + brand profile and produces a structured set of posts."
                  />
                ) : (
                  <>
                    {campaign.plan.objective ? (
                      <p className="mb-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                        <span className="font-medium text-stone-900">Objective:</span>{' '}
                        {campaign.plan.objective}
                      </p>
                    ) : null}
                    <ul className="divide-y divide-stone-200">
                      {planPosts.map((item, i) => (
                        <PlanItemRow
                          key={i}
                          campaignId={id}
                          index={i}
                          item={item}
                          drafts={(draftsByPlanIndex.get(i) ?? []).sort(
                            (a, b) =>
                              new Date(b.createdAt).getTime() -
                              new Date(a.createdAt).getTime(),
                          )}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Drafts on main"
                subtitle={`${campaignCommits.length} commit${campaignCommits.length === 1 ? '' : 's'}`}
              />
              <CardBody>
                {campaignCommits.length === 0 ? (
                  <EmptyState
                    icon={<GitCommit className="h-4 w-4" />}
                    title="No drafts yet"
                    description="Generate drafts from the plan above. Each draft lands as a commit on the main branch."
                  />
                ) : (
                  <ul className="divide-y divide-stone-200">
                    {campaignCommits.map((c) => {
                      const isLatest = mainBranch?.headCommitId === c.id;
                      const authorName =
                        users.find((u) => u.id === c.authorUserId)?.name ?? 'Unknown';
                      return (
                        <li key={c.id}>
                          <Link
                            href={`/dashboard/campaigns/${id}/commits/${c.id}`}
                            className="group flex items-start gap-3 py-3 transition hover:bg-stone-50"
                          >
                            <span
                              className={
                                c.authoredBy === 'agent'
                                  ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-600'
                                  : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600'
                              }
                            >
                              {c.authoredBy === 'agent' ? (
                                <Bot className="h-4 w-4" />
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-stone-900">
                                  {c.message ?? 'Untitled commit'}
                                </p>
                                {isLatest ? (
                                  <Badge tone="success" dot>
                                    HEAD
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-xs text-stone-500">
                                {authorName} · {new Date(c.createdAt).toLocaleString()} ·{' '}
                                <span className="font-mono">{c.contentHash.slice(0, 7)}</span>
                              </p>
                            </div>
                            {c.assetContentType ? (
                              <Badge tone="neutral">{c.assetContentType}</Badge>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader title="Timeline" subtitle="Every action on this campaign." />
              <CardBody>
                <ActivityFeed events={campaignEvents as never} users={users} dense />
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-sm text-stone-800">{value}</p>
    </div>
  );
}
