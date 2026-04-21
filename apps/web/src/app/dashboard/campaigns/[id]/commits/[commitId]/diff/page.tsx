import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, GitCompare, Rows3, Columns2 } from 'lucide-react';
import { db, campaigns, commits, assets } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DiffView } from '@/components/diff/DiffView';
import { requireOrgSession } from '@/lib/require-session';
import { payloadToEditableText } from '../payload-to-text';

export default async function CommitDiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; commitId: string }>;
  searchParams: Promise<{ mode?: string; against?: string }>;
}) {
  const { id, commitId } = await params;
  const sp = await searchParams;
  const mode = sp.mode === 'split' ? 'split' : 'inline';

  const { activeOrgId } = await requireOrgSession();

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, activeOrgId)))
    .limit(1);
  if (!campaign) notFound();

  const [current] = await db.select().from(commits).where(eq(commits.id, commitId)).limit(1);
  if (!current || current.campaignId !== id) notFound();

  const parentId = sp.against || current.parentCommitId;
  const [parent] = parentId
    ? await db.select().from(commits).where(eq(commits.id, parentId)).limit(1)
    : [null];

  const [currentAsset] = await db
    .select()
    .from(assets)
    .where(eq(assets.commitId, commitId))
    .limit(1);
  const [parentAsset] = parent
    ? await db.select().from(assets).where(eq(assets.commitId, parent.id)).limit(1)
    : [null];

  const before = parentAsset ? payloadToEditableText(parentAsset.payload as never) : '';
  const after = currentAsset ? payloadToEditableText(currentAsset.payload as never) : '';

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-stone-400" />
            Diff
          </span>
        }
        subtitle={
          parent ? (
            <span className="flex items-center gap-2 font-mono text-xs text-stone-500">
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
                {parent.contentHash.slice(0, 7)}
              </span>
              <span>→</span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                {current.contentHash.slice(0, 7)}
              </span>
            </span>
          ) : (
            'No parent commit — this is the initial version.'
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/campaigns/${id}/commits/${commitId}`}>
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                Back to commit
              </Button>
            </Link>
            {parent ? <ModeToggle current={mode} campaignId={id} commitId={commitId} /> : null}
          </div>
        }
      />
      <PageBody>
        {!parent ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={<GitCompare className="h-4 w-4" />}
                title="Nothing to compare against"
                description="This is the initial commit on the branch. Edit it to create a child commit you can diff against."
              />
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span>Before</span>
                    <Badge tone="danger">
                      {parent.message?.slice(0, 40) ?? 'parent'}
                    </Badge>
                    <span className="text-stone-400">→</span>
                    <span>After</span>
                    <Badge tone="success">
                      {current.message?.slice(0, 40) ?? 'current'}
                    </Badge>
                  </span>
                }
                subtitle={`${before.length.toLocaleString()} → ${after.length.toLocaleString()} chars`}
              />
              <CardBody>
                {before === after ? (
                  <EmptyState
                    icon={<GitCompare className="h-4 w-4" />}
                    title="No textual differences"
                    description="These commits have the same content."
                  />
                ) : (
                  <DiffView before={before} after={after} mode={mode} />
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </PageBody>
    </>
  );
}

function ModeToggle({
  current,
  campaignId,
  commitId,
}: {
  current: 'inline' | 'split';
  campaignId: string;
  commitId: string;
}) {
  const base = `/dashboard/campaigns/${campaignId}/commits/${commitId}/diff`;
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
      <Link
        href={`${base}?mode=inline`}
        className={
          current === 'inline'
            ? 'inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white'
            : 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100'
        }
      >
        <Rows3 className="h-3.5 w-3.5" />
        Inline
      </Link>
      <Link
        href={`${base}?mode=split`}
        className={
          current === 'split'
            ? 'inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white'
            : 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100'
        }
      >
        <Columns2 className="h-3.5 w-3.5" />
        Split
      </Link>
    </div>
  );
}
