import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq } from 'drizzle-orm';
import { ArrowLeft, Send, UserCheck, Mail } from 'lucide-react';
import {
  db,
  outreachSequences,
  outreachSequenceSteps,
  outreachEnrollments,
  outreachSends,
  leads,
  socialConnections,
} from '@marketing-os/db';
import { PageHeader, PageBody } from '@/components/shell/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireOrgSession } from '@/lib/require-session';
import { StepEditor, type StepInput } from './StepEditor';
import { StatusToggle } from './StatusToggle';
import { StopEnrollmentButton } from './StopEnrollmentButton';

export default async function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { activeOrgId } = await requireOrgSession();

  const [seq] = await db
    .select()
    .from(outreachSequences)
    .where(
      and(
        eq(outreachSequences.id, id),
        eq(outreachSequences.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!seq) notFound();

  const sender = seq.socialConnectionId
    ? (
        await db
          .select({
            handle: socialConnections.accountHandle,
            name: socialConnections.externalAccountId,
          })
          .from(socialConnections)
          .where(eq(socialConnections.id, seq.socialConnectionId))
          .limit(1)
      )[0]
    : null;

  const steps = await db
    .select()
    .from(outreachSequenceSteps)
    .where(eq(outreachSequenceSteps.sequenceId, id))
    .orderBy(asc(outreachSequenceSteps.stepOrder));

  const enrollmentRows = await db
    .select({
      id: outreachEnrollments.id,
      status: outreachEnrollments.status,
      currentStepOrder: outreachEnrollments.currentStepOrder,
      nextSendAt: outreachEnrollments.nextSendAt,
      startedAt: outreachEnrollments.startedAt,
      leadEmail: leads.email,
      leadName: leads.fullName,
      leadCompany: leads.company,
    })
    .from(outreachEnrollments)
    .innerJoin(leads, eq(leads.id, outreachEnrollments.leadId))
    .where(eq(outreachEnrollments.sequenceId, id))
    .orderBy(desc(outreachEnrollments.startedAt))
    .limit(200);

  const sendRows = await db
    .select({
      id: outreachSends.id,
      enrollmentId: outreachSends.enrollmentId,
      renderedSubject: outreachSends.renderedSubject,
      sentAt: outreachSends.sentAt,
      openedAt: outreachSends.openedAt,
      clickedAt: outreachSends.clickedAt,
      repliedAt: outreachSends.repliedAt,
      leadEmail: leads.email,
    })
    .from(outreachSends)
    .innerJoin(leads, eq(leads.id, outreachSends.leadId))
    .innerJoin(
      outreachEnrollments,
      eq(outreachEnrollments.id, outreachSends.enrollmentId),
    )
    .where(eq(outreachEnrollments.sequenceId, id))
    .orderBy(desc(outreachSends.sentAt))
    .limit(50);

  const stepInputs: StepInput[] = steps.map((s) => ({
    id: s.id,
    stepOrder: s.stepOrder,
    delayDaysAfterPrevious: s.delayDaysAfterPrevious,
    subjectTemplate: s.subjectTemplate,
    bodyTemplate: s.bodyTemplate,
  }));

  const activeCount = enrollmentRows.filter((e) => e.status === 'active').length;

  return (
    <>
      <PageHeader
        title={seq.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-stone-500">
            <Badge tone={statusTone(seq.status)} dot>
              {seq.status}
            </Badge>
            {sender?.handle ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {sender.handle}
              </span>
            ) : null}
            <span>
              {steps.length} step{steps.length === 1 ? '' : 's'} · {activeCount} active enrollment
              {activeCount === 1 ? '' : 's'}
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/sequences">
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                Back
              </Button>
            </Link>
            <StatusToggle sequenceId={seq.id} current={seq.status} />
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <Card>
              <CardHeader
                title="Steps"
                subtitle="Templates — the agent personalizes each at send time."
              />
              <CardBody>
                <StepEditor sequenceId={seq.id} existingSteps={stepInputs} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Recent sends"
                subtitle={`${sendRows.length} shown`}
              />
              <CardBody>
                {sendRows.length === 0 ? (
                  <EmptyState
                    icon={<Send className="h-4 w-4" />}
                    title="No sends yet"
                    description="Activate the sequence and enroll leads to start sending."
                  />
                ) : (
                  <ul className="divide-y divide-stone-200">
                    {sendRows.map((s) => (
                      <li key={s.id} className="flex items-start gap-3 py-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                          <Send className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stone-900">
                            {s.renderedSubject}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-500">
                            → {s.leadEmail} · {new Date(s.sentAt).toLocaleString()}
                          </p>
                        </div>
                        {s.repliedAt ? (
                          <Badge tone="success" dot>
                            Replied
                          </Badge>
                        ) : s.clickedAt ? (
                          <Badge tone="info" dot>
                            Clicked
                          </Badge>
                        ) : s.openedAt ? (
                          <Badge tone="info">Opened</Badge>
                        ) : (
                          <Badge tone="neutral">Sent</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader
                title="Enrollments"
                subtitle={`${enrollmentRows.length} total`}
              />
              <CardBody>
                {enrollmentRows.length === 0 ? (
                  <EmptyState
                    icon={<UserCheck className="h-4 w-4" />}
                    title="No enrollments"
                    description="Head to Leads and click Enroll on any lead to queue them into this sequence."
                  />
                ) : (
                  <ul className="divide-y divide-stone-200">
                    {enrollmentRows.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stone-900">
                            {e.leadName || e.leadEmail}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-stone-500">
                            {e.leadCompany || e.leadEmail}
                            {e.nextSendAt && e.status === 'active'
                              ? ` · next ${new Date(e.nextSendAt).toLocaleString()}`
                              : ''}
                          </p>
                        </div>
                        <Badge tone={enrollmentTone(e.status)} dot>
                          {e.status}
                        </Badge>
                        {e.status === 'active' ? (
                          <StopEnrollmentButton enrollmentId={e.id} />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
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

function enrollmentTone(
  s: string,
): 'success' | 'warning' | 'neutral' | 'info' | 'danger' {
  if (s === 'active') return 'info';
  if (s === 'completed') return 'success';
  if (s === 'replied') return 'success';
  if (s === 'bounced') return 'danger';
  if (s === 'unsubscribed') return 'danger';
  return 'neutral';
}
