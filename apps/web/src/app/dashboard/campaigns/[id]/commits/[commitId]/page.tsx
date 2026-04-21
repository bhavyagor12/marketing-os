import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import {
  ArrowLeft,
  Bot,
  User as UserIcon,
  GitCommit,
  GitCompare,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  db,
  campaigns,
  commits,
  assets,
  branches,
  approvals,
  events,
  user,
  member,
  socialConnections,
  publishes,
  commitComments,
  agentRuns,
} from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ActivityFeed } from '@/components/events/ActivityFeed';
import { CommitMetrics } from '@/components/metrics/CommitMetrics';
import { loadCommitMetrics } from '@/lib/commit-metrics';
import { requireOrgSession } from '@/lib/require-session';
import { EditCommitForm } from './EditCommitForm';
import { ReviewPanel } from './ReviewPanel';
import { PublishPanel } from './PublishPanel';
import { AttributionPanel } from './AttributionPanel';
import { CommentsPanel } from './CommentsPanel';
import { ImagePanel } from './ImagePanel';
import { VideoPanel } from './VideoPanel';
import { ArticlePreview } from './ArticlePreview';
import { payloadToEditableText } from './payload-to-text';

export default async function CommitPage({
  params,
}: {
  params: Promise<{ id: string; commitId: string }>;
}) {
  const { id, commitId } = await params;
  const { session, activeOrgId } = await requireOrgSession();

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, activeOrgId)))
    .limit(1);
  if (!campaign) notFound();

  const [commit] = await db
    .select()
    .from(commits)
    .where(eq(commits.id, commitId))
    .limit(1);
  if (!commit || commit.campaignId !== id) notFound();

  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.commitId, commitId))
    .limit(1);

  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, commit.branchId))
    .limit(1);

  const isHead = branch?.headCommitId === commit.id;

  const approvalRows = await db
    .select({
      id: approvals.id,
      reviewerUserId: approvals.reviewerUserId,
      status: approvals.status,
      note: approvals.note,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .where(eq(approvals.commitId, commitId))
    .orderBy(desc(approvals.createdAt));

  const commitEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.organizationId, activeOrgId), eq(events.commitId, commitId)))
    .orderBy(desc(events.occurredAt))
    .limit(30);

  const availableConnections = await db
    .select({
      id: socialConnections.id,
      platform: socialConnections.platform,
      accountHandle: socialConnections.accountHandle,
    })
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.organizationId, activeOrgId),
        eq(socialConnections.status, 'active'),
      ),
    );

  const commitPublishes = await db
    .select({
      id: publishes.id,
      platform: publishes.platform,
      socialConnectionId: publishes.socialConnectionId,
      scheduledFor: publishes.scheduledFor,
      status: publishes.status,
      externalUrl: publishes.externalUrl,
      error: publishes.error,
      publishedAt: publishes.publishedAt,
      createdAt: publishes.createdAt,
    })
    .from(publishes)
    .where(eq(publishes.commitId, commitId))
    .orderBy(desc(publishes.createdAt));

  const commitIdsToMeasure = [commitId];
  if (commit.parentCommitId) commitIdsToMeasure.push(commit.parentCommitId);
  const metricsMap = await loadCommitMetrics(commitIdsToMeasure);
  const metrics = metricsMap.get(commitId)!;
  const parentMetrics = commit.parentCommitId ? metricsMap.get(commit.parentCommitId) : null;

  const commentsRows = await db
    .select()
    .from(commitComments)
    .where(eq(commitComments.commitId, commitId))
    .orderBy(commitComments.createdAt);

  // Any in-flight video render for THIS commit — used to show "Rendering…" in VideoPanel.
  const pendingVideoRuns = await db
    .select({ id: agentRuns.id, startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.campaignId, campaign.id),
        eq(agentRuns.status, 'running'),
        eq(agentRuns.agentKind, 'creative'),
      ),
    )
    .limit(5);
  // The creative agent is shared between image + video — we use output shape to tell them
  // apart, but for the UI it's fine to treat any running creative run as "in flight".
  const pendingVideoRun = pendingVideoRuns[0] ?? null;

  const trackingBaseUrl =
    process.env.TRACKING_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000';

  const members = await db
    .select({ userId: member.userId, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));

  const users = members.map((m) => ({ id: m.userId, name: m.name }));
  const authorName =
    users.find((u) => u.id === commit.authorUserId)?.name ?? 'Unknown';

  const initialText = asset ? payloadToEditableText(asset.payload as never) : '';

  const attachedBlobIds = extractBlobIds(asset?.payload as never);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GitCommit className="h-5 w-5 text-stone-400" />
            <span className="truncate">{commit.message ?? 'Untitled commit'}</span>
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2 text-stone-500">
            <span className="font-mono text-[11px]">{commit.contentHash.slice(0, 12)}</span>
            <span>·</span>
            <span>{authorName}</span>
            <span>·</span>
            <span>{new Date(commit.createdAt).toLocaleString()}</span>
            {isHead ? (
              <Badge tone="success" dot>
                HEAD
              </Badge>
            ) : null}
            <Badge tone={commit.authoredBy === 'agent' ? 'info' : 'neutral'}>
              {commit.authoredBy === 'agent' ? 'agent' : 'human'}
            </Badge>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/campaigns/${id}`}>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                Back
              </Button>
            </Link>
            {commit.parentCommitId ? (
              <Link href={`/dashboard/campaigns/${id}/commits/${commit.id}/diff`}>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<GitCompare className="h-3.5 w-3.5" />}
                >
                  Compare to parent
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <Card>
              <CardHeader
                title="Content"
                subtitle={
                  asset
                    ? `${asset.contentType} · ${(asset.platforms as string[]).join(', ')}`
                    : 'No asset attached'
                }
              />
              <CardBody className="space-y-4">
                {asset?.contentType === 'video' && attachedBlobIds[0] ? (
                  <video
                    controls
                    src={`/api/media/${attachedBlobIds[0]}`}
                    className="w-full rounded-md border border-stone-200 bg-black"
                  />
                ) : null}
                {asset?.contentType === 'article' &&
                (asset.payload as { kind?: string }).kind === 'article' ? (
                  <ArticlePreview
                    title={(asset.payload as { title: string }).title}
                    bodyMarkdown={(asset.payload as { bodyMarkdown: string }).bodyMarkdown}
                  />
                ) : null}
                {asset ? (
                  <EditCommitForm
                    campaignId={id}
                    commitId={commit.id}
                    initialText={initialText}
                  />
                ) : (
                  <p className="text-sm text-stone-500">No asset on this commit.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Creative"
                subtitle="Brand-aware image (DALL-E 3) and video (HeyGen) generation."
              />
              <CardBody className="space-y-4">
                <ImagePanel
                  commitId={commit.id}
                  campaignId={id}
                  attachedBlobIds={attachedBlobIds}
                />
                <VideoPanel commitId={commit.id} pendingRun={pendingVideoRun} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Publish"
                subtitle="Send this commit to a connected platform, now or scheduled."
              />
              <CardBody>
                <PublishPanel
                  commitId={commit.id}
                  connections={availableConnections}
                  publishesForCommit={commitPublishes as never}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Performance"
                subtitle={
                  parentMetrics
                    ? 'Current version vs. parent commit.'
                    : 'External engagement attributed to this commit.'
                }
              />
              <CardBody>
                <CommitMetrics current={metrics} parent={parentMetrics} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Attribution tools"
                subtitle="Share tracked links and embed impression pixels."
              />
              <CardBody>
                <AttributionPanel
                  commitId={commit.id}
                  trackingBaseUrl={trackingBaseUrl}
                  clickCount={metrics.clicks}
                  impressionCount={metrics.impressions}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Comments"
                subtitle={`${commentsRows.length} total · resolve when addressed`}
              />
              <CardBody>
                <CommentsPanel
                  commitId={commit.id}
                  currentUserId={session.user.id}
                  comments={commentsRows as never}
                  users={users}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Review" />
              <CardBody className="space-y-4">
                <ReviewPanel commitId={commit.id} />
                {approvalRows.length > 0 ? (
                  <ul className="divide-y divide-stone-200">
                    {approvalRows.map((a) => {
                      const reviewer =
                        users.find((u) => u.id === a.reviewerUserId)?.name ?? 'Unknown';
                      const tone =
                        a.status === 'approved'
                          ? 'success'
                          : a.status === 'changes_requested'
                            ? 'warning'
                            : 'neutral';
                      const Icon =
                        a.status === 'approved'
                          ? CheckCircle2
                          : a.status === 'changes_requested'
                            ? XCircle
                            : Clock;
                      return (
                        <li key={a.id} className="flex items-start gap-3 py-2.5">
                          <Icon
                            className={
                              a.status === 'approved'
                                ? 'mt-0.5 h-4 w-4 text-emerald-600'
                                : a.status === 'changes_requested'
                                  ? 'mt-0.5 h-4 w-4 text-amber-600'
                                  : 'mt-0.5 h-4 w-4 text-stone-500'
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-medium text-stone-900">{reviewer}</span>{' '}
                              <span className="text-stone-600">
                                {a.status === 'approved'
                                  ? 'approved'
                                  : a.status === 'changes_requested'
                                    ? 'requested changes'
                                    : 'requested approval'}
                              </span>
                            </p>
                            {a.note ? (
                              <p className="mt-0.5 text-xs text-stone-600">{a.note}</p>
                            ) : null}
                            <p className="mt-0.5 text-[11px] text-stone-400">
                              {new Date(a.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge tone={tone}>{a.status.replace('_', ' ')}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </CardBody>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Lineage" />
              <CardBody className="space-y-2 text-sm">
                <LineageRow
                  icon={commit.authoredBy === 'agent' ? <Bot className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
                  label="Author"
                  value={authorName}
                />
                <LineageRow
                  icon={<GitCommit className="h-3.5 w-3.5" />}
                  label="Branch"
                  value={branch?.name ?? 'unknown'}
                />
                {commit.parentCommitId ? (
                  <Link
                    href={`/dashboard/campaigns/${id}/commits/${commit.parentCommitId}`}
                    className="block rounded-md border border-stone-200 bg-white px-3 py-2 text-sm transition hover:bg-stone-50"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                      Parent commit
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-stone-700">
                      {commit.parentCommitId.slice(0, 12)}
                    </span>
                  </Link>
                ) : (
                  <p className="text-xs text-stone-500">Initial commit on branch</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Timeline" subtitle="Events on this commit." />
              <CardBody>
                <ActivityFeed events={commitEvents as never} users={users} dense />
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function extractBlobIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as { kind?: string; blobIds?: string[]; blobId?: string; slides?: { blobId?: string }[] };
  if (p.kind === 'image' && Array.isArray(p.blobIds)) return p.blobIds;
  if (p.kind === 'video' && typeof p.blobId === 'string') return [p.blobId];
  if (p.kind === 'carousel' && Array.isArray(p.slides)) {
    return p.slides.map((s) => s?.blobId).filter((id): id is string => !!id);
  }
  return [];
}

function LineageRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-100 text-stone-500">
        {icon}
      </span>
      <span className="text-xs uppercase tracking-wide text-stone-500">{label}</span>
      <span className="ml-auto text-sm text-stone-900">{value}</span>
    </div>
  );
}
