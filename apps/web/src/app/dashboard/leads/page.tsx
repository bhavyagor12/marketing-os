import Link from 'next/link';
import { eq, desc, sql } from 'drizzle-orm';
import { Users, ArrowUpRight } from 'lucide-react';
import { db, leads } from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';
import { AddLeadForm } from './AddLeadForm';
import { ImportCsvForm } from './ImportCsvForm';
import { LeadStatusMenu } from './LeadStatusMenu';

export default async function LeadsPage() {
  const { activeOrgId } = await requireOrgSession();

  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.organizationId, activeOrgId))
    .orderBy(desc(leads.createdAt))
    .limit(200);

  const [stats] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      qualified: sql<number>`count(*) filter (where status = 'qualified')`.mapWith(Number),
      contacted: sql<number>`count(*) filter (where status in ('contacted','engaged'))`.mapWith(
        Number,
      ),
      unsubscribed: sql<number>`count(*) filter (where status = 'unsubscribed')`.mapWith(
        Number,
      ),
    })
    .from(leads)
    .where(eq(leads.organizationId, activeOrgId));

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={
          stats?.total
            ? `${stats.total} leads · ${stats.qualified} qualified · ${stats.contacted} in-flight · ${stats.unsubscribed} unsubscribed`
            : 'Your outbound list — import CSVs or add manually.'
        }
        actions={<AddLeadForm />}
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader
                title="All leads"
                subtitle={`${rows.length} shown · newest first`}
              />
              <CardBody>
                {rows.length === 0 ? (
                  <EmptyState
                    icon={<Users className="h-4 w-4" />}
                    title="No leads yet"
                    description="Import a CSV on the right, or add leads manually with the button above."
                  />
                ) : (
                  <ul className="divide-y divide-stone-200">
                    {rows.map((l) => {
                      const display = l.fullName || [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email;
                      return (
                        <li key={l.id} className="flex items-center gap-3 py-3">
                          <Link
                            href={`/dashboard/leads/${l.id}`}
                            className="group flex flex-1 items-center gap-3"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[11px] font-semibold text-stone-600">
                              {(display[0] ?? '?').toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-stone-900 group-hover:underline">
                                {display}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-stone-500">
                                {l.email}
                                {l.company ? ` · ${l.company}` : ''}
                                {l.title ? ` · ${l.title}` : ''}
                              </p>
                              {l.tags.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {l.tags.slice(0, 4).map((t) => (
                                    <Badge key={t} tone="neutral">
                                      {t}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-stone-300 group-hover:text-stone-500" />
                          </Link>
                          <LeadStatusMenu leadId={l.id} status={l.status} />
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
              <CardHeader
                title="Import CSV"
                subtitle="Bulk-add leads from a spreadsheet."
              />
              <CardBody>
                <ImportCsvForm />
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
