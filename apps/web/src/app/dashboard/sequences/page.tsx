import Link from 'next/link';
import { eq, desc, sql } from 'drizzle-orm';
import { Send, Plus, ArrowUpRight } from 'lucide-react';
import {
  db,
  outreachSequences,
  outreachEnrollments,
} from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';

export default async function SequencesPage() {
  const { activeOrgId } = await requireOrgSession();

  const rows = await db
    .select({
      id: outreachSequences.id,
      name: outreachSequences.name,
      description: outreachSequences.description,
      status: outreachSequences.status,
      createdAt: outreachSequences.createdAt,
      activeCount: sql<number>`(
        SELECT count(*) FROM ${outreachEnrollments}
        WHERE ${outreachEnrollments.sequenceId} = ${outreachSequences.id}
          AND ${outreachEnrollments.status} = 'active'
      )`.mapWith(Number),
      totalCount: sql<number>`(
        SELECT count(*) FROM ${outreachEnrollments}
        WHERE ${outreachEnrollments.sequenceId} = ${outreachSequences.id}
      )`.mapWith(Number),
    })
    .from(outreachSequences)
    .where(eq(outreachSequences.organizationId, activeOrgId))
    .orderBy(desc(outreachSequences.createdAt));

  return (
    <>
      <PageHeader
        title="Sequences"
        subtitle="Multi-step outreach. Templates get personalized per-lead by the SDR agent at send time."
        actions={
          <Link href="/dashboard/sequences/new">
            <Button leadingIcon={<Plus className="h-4 w-4" />}>New sequence</Button>
          </Link>
        }
      />
      <PageBody>
        <Card>
          <CardHeader title="All sequences" subtitle={`${rows.length} total`} />
          <div className="p-5">
            {rows.length === 0 ? (
              <EmptyState
                icon={<Send className="h-4 w-4" />}
                title="No sequences yet"
                description="Create a sequence, add a few templated steps, then enroll leads. The agent personalizes each step per recipient."
                action={
                  <Link href="/dashboard/sequences/new">
                    <Button leadingIcon={<Plus className="h-4 w-4" />}>
                      Create your first sequence
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-stone-200">
                {rows.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/dashboard/sequences/${s.id}`}
                      className="group flex items-center gap-3 py-3 transition hover:bg-stone-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600 group-hover:bg-white group-hover:ring-1 group-hover:ring-stone-200">
                        <Send className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">{s.name}</p>
                        <p className="mt-0.5 truncate text-xs text-stone-500">
                          {s.description ||
                            `${s.totalCount} enrollments · ${s.activeCount} active`}
                        </p>
                      </div>
                      <Badge tone={statusTone(s.status)} dot>
                        {s.status}
                      </Badge>
                      <ArrowUpRight className="ml-1 h-4 w-4 text-stone-300 group-hover:text-stone-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </PageBody>
    </>
  );
}

function statusTone(
  s: string,
): 'success' | 'warning' | 'neutral' | 'info' {
  if (s === 'active') return 'success';
  if (s === 'paused') return 'warning';
  if (s === 'archived') return 'neutral';
  return 'info';
}
