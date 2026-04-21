import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Mail,
  UserCheck,
  UserCircle,
} from 'lucide-react';
import { db, leads, events, user, member } from '@marketing-os/db';
import { EventSubjectType } from '@marketing-os/shared';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ActivityFeed } from '@/components/events/ActivityFeed';
import { requireOrgSession } from '@/lib/require-session';
import { LeadStatusMenu } from '../LeadStatusMenu';
import { DeleteLeadButton } from './DeleteLeadButton';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { activeOrgId } = await requireOrgSession();

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.organizationId, activeOrgId)))
    .limit(1);
  if (!lead) notFound();

  const leadEvents = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.organizationId, activeOrgId),
        eq(events.subjectType, EventSubjectType.Lead),
        eq(events.subjectId, lead.id),
      ),
    )
    .orderBy(desc(events.occurredAt))
    .limit(50);

  const members = await db
    .select({ userId: member.userId, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, activeOrgId));
  const users = members.map((m) => ({ id: m.userId, name: m.name }));

  const display =
    lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-stone-400" />
            {display}
          </span>
        }
        subtitle={lead.email}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/leads">
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                All leads
              </Button>
            </Link>
            <LeadStatusMenu leadId={lead.id} status={lead.status} />
            <DeleteLeadButton leadId={lead.id} />
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader title="Details" />
              <CardBody>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Detail icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={lead.email} />
                  <Detail
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    label="Company"
                    value={lead.company || '—'}
                  />
                  <Detail label="First name" value={lead.firstName || '—'} />
                  <Detail label="Last name" value={lead.lastName || '—'} />
                  <Detail label="Title" value={lead.title || '—'} />
                  <Detail label="Source" value={lead.source} />
                  {lead.linkedinUrl ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                        LinkedIn
                      </p>
                      <a
                        href={lead.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-sm text-stone-800 underline hover:text-stone-900"
                      >
                        {lead.linkedinUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : null}
                  {lead.phone ? <Detail label="Phone" value={lead.phone} /> : null}
                </dl>
                {lead.tags.length > 0 ? (
                  <div className="mt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                      Tags
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {lead.tags.map((t) => (
                        <Badge key={t} tone="info">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Engagement" />
              <CardBody>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <EngagementStat
                    label="Last contacted"
                    value={lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleDateString() : '—'}
                  />
                  <EngagementStat
                    label="Last opened"
                    value={lead.lastOpenedAt ? new Date(lead.lastOpenedAt).toLocaleDateString() : '—'}
                  />
                  <EngagementStat
                    label="Last clicked"
                    value={lead.lastClickedAt ? new Date(lead.lastClickedAt).toLocaleDateString() : '—'}
                  />
                  <EngagementStat
                    label="Last replied"
                    value={lead.lastRepliedAt ? new Date(lead.lastRepliedAt).toLocaleDateString() : '—'}
                  />
                </div>
                <p className="mt-3 text-xs text-stone-500">
                  These fields update automatically once outreach sequences land (P3-17).
                </p>
              </CardBody>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader title="Timeline" />
              <CardBody>
                <ActivityFeed events={leadEvents as never} users={users} dense />
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-sm text-stone-800">{value}</p>
    </div>
  );
}

function EngagementStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
        <UserCheck className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
}
