'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import {
  db,
  emit,
  outreachSequences,
  outreachSequenceSteps,
  outreachEnrollments,
  leads,
  socialConnections,
} from '@marketing-os/db';
import type { OutreachSequenceStatus } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';

async function enqueueOutreachStep(data: {
  enrollmentId: string;
  organizationId: string;
  delayMs: number;
}) {
  const { Queue } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const q = new Queue('outreach-step', { connection });
  try {
    await q.add(
      'run',
      { enrollmentId: data.enrollmentId, organizationId: data.organizationId },
      {
        delay: Math.max(0, data.delayMs),
        removeOnComplete: 200,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );
  } finally {
    await q.close();
    await connection.quit();
  }
}

export async function createSequence(formData: FormData) {
  const { session, activeOrgId } = await requireOrgSession();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Name is required' };
  const description = (formData.get('description') as string | null)?.trim() || null;
  const connectionId = (formData.get('connectionId') as string | null)?.trim() || null;

  const [row] = await db
    .insert(outreachSequences)
    .values({
      organizationId: activeOrgId,
      name,
      description,
      status: 'draft',
      socialConnectionId: connectionId,
      createdByUserId: session.user.id,
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.SequenceCreated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Sequence, id: row!.id },
    properties: { name },
    message: `Created sequence "${name}"`,
  });

  revalidatePath('/dashboard/sequences');
  return { ok: true, id: row!.id };
}

export async function updateSequenceStatus(id: string, status: OutreachSequenceStatus) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(outreachSequences)
    .where(and(eq(outreachSequences.id, id), eq(outreachSequences.organizationId, activeOrgId)))
    .limit(1);
  if (!row) return { error: 'sequence not found' };

  await db
    .update(outreachSequences)
    .set({ status, updatedAt: new Date() })
    .where(eq(outreachSequences.id, id));

  await emit({
    organizationId: activeOrgId,
    type: EventType.SequenceStatusChanged,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Sequence, id },
    properties: { from: row.status, to: status },
    message: `Sequence "${row.name}" → ${status}`,
  });

  revalidatePath('/dashboard/sequences');
  revalidatePath(`/dashboard/sequences/${id}`);
  return { ok: true };
}

export async function upsertSequenceStep(params: {
  sequenceId: string;
  stepOrder: number;
  delayDaysAfterPrevious: number;
  subjectTemplate: string;
  bodyTemplate: string;
  notes?: string | null;
}) {
  const { activeOrgId } = await requireOrgSession();
  const [seq] = await db
    .select()
    .from(outreachSequences)
    .where(
      and(
        eq(outreachSequences.id, params.sequenceId),
        eq(outreachSequences.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!seq) return { error: 'sequence not found' };

  const subjectTemplate = params.subjectTemplate.trim();
  const bodyTemplate = params.bodyTemplate.trim();
  if (!subjectTemplate) return { error: 'subject required' };
  if (!bodyTemplate) return { error: 'body required' };

  const [existing] = await db
    .select()
    .from(outreachSequenceSteps)
    .where(
      and(
        eq(outreachSequenceSteps.sequenceId, params.sequenceId),
        eq(outreachSequenceSteps.stepOrder, params.stepOrder),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(outreachSequenceSteps)
      .set({
        delayDaysAfterPrevious: params.delayDaysAfterPrevious,
        subjectTemplate,
        bodyTemplate,
        notes: params.notes ?? null,
      })
      .where(eq(outreachSequenceSteps.id, existing.id));
  } else {
    await db.insert(outreachSequenceSteps).values({
      sequenceId: params.sequenceId,
      stepOrder: params.stepOrder,
      delayDaysAfterPrevious: params.delayDaysAfterPrevious,
      subjectTemplate,
      bodyTemplate,
      notes: params.notes ?? null,
    });
  }

  revalidatePath(`/dashboard/sequences/${params.sequenceId}`);
  return { ok: true };
}

export async function deleteSequenceStep(stepId: string) {
  const { activeOrgId } = await requireOrgSession();
  const [step] = await db
    .select({ id: outreachSequenceSteps.id, sequenceId: outreachSequenceSteps.sequenceId })
    .from(outreachSequenceSteps)
    .innerJoin(
      outreachSequences,
      eq(outreachSequenceSteps.sequenceId, outreachSequences.id),
    )
    .where(
      and(
        eq(outreachSequenceSteps.id, stepId),
        eq(outreachSequences.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!step) return { error: 'step not found' };

  await db.delete(outreachSequenceSteps).where(eq(outreachSequenceSteps.id, stepId));
  revalidatePath(`/dashboard/sequences/${step.sequenceId}`);
  return { ok: true };
}

export async function enrollLeadsInSequence(params: {
  sequenceId: string;
  leadIds: string[];
}) {
  const { session, activeOrgId } = await requireOrgSession();
  if (params.leadIds.length === 0) return { error: 'no leads selected' };

  const [seq] = await db
    .select()
    .from(outreachSequences)
    .where(
      and(
        eq(outreachSequences.id, params.sequenceId),
        eq(outreachSequences.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!seq) return { error: 'sequence not found' };
  if (seq.status !== 'active') {
    return { error: 'sequence must be active before enrolling leads' };
  }
  if (!seq.socialConnectionId) {
    return { error: 'sequence needs an email sender — edit settings and pick one' };
  }

  const firstStep = await db
    .select()
    .from(outreachSequenceSteps)
    .where(eq(outreachSequenceSteps.sequenceId, seq.id))
    .orderBy(outreachSequenceSteps.stepOrder)
    .limit(1);
  if (firstStep.length === 0) return { error: 'sequence has no steps yet' };

  // Only enroll leads that exist in this org and aren't already enrolled/unsubscribed.
  const targetLeads = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, activeOrgId),
        inArray(leads.id, params.leadIds),
      ),
    );

  const existing = await db
    .select({ leadId: outreachEnrollments.leadId })
    .from(outreachEnrollments)
    .where(
      and(
        eq(outreachEnrollments.sequenceId, seq.id),
        inArray(outreachEnrollments.leadId, params.leadIds),
      ),
    );
  const existingIds = new Set(existing.map((e) => e.leadId));

  let enrolled = 0;
  for (const lead of targetLeads) {
    if (existingIds.has(lead.id)) continue;
    if (lead.status === 'unsubscribed') continue;

    const nextSendAt = new Date(
      Date.now() + (firstStep[0]!.delayDaysAfterPrevious ?? 0) * 86_400_000,
    );
    const [row] = await db
      .insert(outreachEnrollments)
      .values({
        organizationId: activeOrgId,
        sequenceId: seq.id,
        leadId: lead.id,
        status: 'active',
        currentStepOrder: firstStep[0]!.stepOrder,
        nextSendAt,
        enrolledByUserId: session.user.id,
      })
      .returning();

    await enqueueOutreachStep({
      enrollmentId: row!.id,
      organizationId: activeOrgId,
      delayMs: nextSendAt.getTime() - Date.now(),
    });

    await emit({
      organizationId: activeOrgId,
      type: EventType.EnrollmentStarted,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.Enrollment, id: row!.id },
      properties: {
        sequenceId: seq.id,
        sequenceName: seq.name,
        leadId: lead.id,
        leadEmail: lead.email,
      },
      message: `Enrolled ${lead.email} in "${seq.name}"`,
    });
    enrolled += 1;
  }

  revalidatePath(`/dashboard/sequences/${seq.id}`);
  revalidatePath('/dashboard/leads');
  return { ok: true, enrolled, skipped: params.leadIds.length - enrolled };
}

export async function stopEnrollment(enrollmentId: string) {
  const { session, activeOrgId } = await requireOrgSession();
  const [row] = await db
    .select()
    .from(outreachEnrollments)
    .where(
      and(
        eq(outreachEnrollments.id, enrollmentId),
        eq(outreachEnrollments.organizationId, activeOrgId),
      ),
    )
    .limit(1);
  if (!row) return { error: 'enrollment not found' };
  if (row.status !== 'active') return { ok: true };

  await db
    .update(outreachEnrollments)
    .set({ status: 'stopped', nextSendAt: null, completedAt: new Date() })
    .where(eq(outreachEnrollments.id, enrollmentId));

  await emit({
    organizationId: activeOrgId,
    type: EventType.EnrollmentStopped,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Enrollment, id: enrollmentId },
    properties: { sequenceId: row.sequenceId, leadId: row.leadId, reason: 'manual' },
    message: 'Enrollment stopped manually',
  });

  revalidatePath(`/dashboard/sequences/${row.sequenceId}`);
  return { ok: true };
}

export async function listEmailConnections() {
  const { activeOrgId } = await requireOrgSession();
  return db
    .select({
      id: socialConnections.id,
      accountHandle: socialConnections.accountHandle,
      externalAccountId: socialConnections.externalAccountId,
      status: socialConnections.status,
    })
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.organizationId, activeOrgId),
        eq(socialConnections.platform, 'email'),
      ),
    );
}
