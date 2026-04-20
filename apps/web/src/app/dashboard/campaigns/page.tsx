import { eq, desc } from 'drizzle-orm';
import { Megaphone, Plus } from 'lucide-react';
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
    .limit(50);

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Branded like Git: every campaign is a tree of branches and commits."
        actions={
          <Button leadingIcon={<Plus className="h-4 w-4" />} disabled>
            New campaign
          </Button>
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
                description="Create a brief, let the planner agent structure it, then branch off drafts — coming next."
              />
            ) : (
              <ul className="divide-y divide-stone-200">
                {rows.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-900">{c.name}</p>
                      {c.description ? (
                        <p className="mt-0.5 truncate text-xs text-stone-500">{c.description}</p>
                      ) : null}
                    </div>
                    <Badge tone={c.status === 'active' ? 'success' : 'neutral'} dot>
                      {c.status}
                    </Badge>
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
