import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { Megaphone, Plus, ArrowUpRight } from 'lucide-react';
import { db, campaigns } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';

export default async function CampaignsPage() {
  const { activeOrgId } = await requireOrgSession();
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.organizationId, activeOrgId))
    .orderBy(desc(campaigns.createdAt))
    .limit(100);

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Every campaign is a tree of branches and commits — Git for marketing."
        actions={
          <Link href="/dashboard/campaigns/new">
            <Button leadingIcon={<Plus className="h-4 w-4" />}>New campaign</Button>
          </Link>
        }
      />
      <PageBody>
        <Card>
          <CardHeader title="All campaigns" subtitle={`${rows.length} total`} />
          <div className="p-5">
            {rows.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="h-4 w-4" />}
                title="No campaigns yet"
                description="Create a brief, let the planner agent structure it, then generate drafts."
                action={
                  <Link href="/dashboard/campaigns/new">
                    <Button leadingIcon={<Plus className="h-4 w-4" />}>
                      Start your first campaign
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-stone-200">
                {rows.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/campaigns/${c.id}`}
                      className="group flex items-center gap-3 py-3 transition hover:bg-stone-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600 group-hover:bg-white group-hover:ring-1 group-hover:ring-stone-200">
                        <Megaphone className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">{c.name}</p>
                        {c.description ? (
                          <p className="mt-0.5 truncate text-xs text-stone-500">
                            {c.description}
                          </p>
                        ) : c.brief?.goal ? (
                          <p className="mt-0.5 truncate text-xs text-stone-500">
                            {c.brief.goal}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        tone={
                          c.status === 'active'
                            ? 'success'
                            : c.status === 'archived'
                              ? 'neutral'
                              : 'info'
                        }
                        dot
                      >
                        {c.status}
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
