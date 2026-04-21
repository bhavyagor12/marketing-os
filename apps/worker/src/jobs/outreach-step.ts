import type { Job } from 'bullmq';
import { and, asc, eq } from 'drizzle-orm';
import {
  db,
  emit,
  outreachEnrollments,
  outreachSequences,
  outreachSequenceSteps,
  outreachSends,
  leads,
  publishes,
  socialConnections,
} from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import type { OutreachStepJob } from '../queues';
import { outreachStepQueue } from '../queues';

const AGENTS_URL =
  process.env.AGENTS_URL ?? process.env.NEXT_PUBLIC_AGENTS_URL ?? 'http://localhost:8000';

/**
 * Run the current step of an outreach enrollment:
 *   1. Load enrollment + step + lead + sequence + email connection
 *   2. Personalize via agents service
 *   3. Create a `publishes` row (platform=email) so the existing email publisher sends it
 *   4. Record an `outreach_sends` row for audit + reply tracking
 *   5. Advance the enrollment to the next step (or mark completed); enqueue next job with delay
 *
 * Guards at every step: if the enrollment was cancelled (replied/stopped/bounced/unsubscribed)
 * we bail without sending. Same if the lead was unsubscribed directly.
 */
export async function processOutreachStep(job: Job<OutreachStepJob>) {
  const { enrollmentId, organizationId } = job.data;
  console.log(`[outreach] step enrollmentId=${enrollmentId}`);

  const [enrollment] = await db
    .select()
    .from(outreachEnrollments)
    .where(eq(outreachEnrollments.id, enrollmentId))
    .limit(1);
  if (!enrollment) return { ok: false, reason: 'enrollment missing' };
  if (enrollment.status !== 'active') {
    console.log(`[outreach] skipping ${enrollmentId} — status=${enrollment.status}`);
    return { ok: false, reason: `status=${enrollment.status}` };
  }

  const [sequence] = await db
    .select()
    .from(outreachSequences)
    .where(eq(outreachSequences.id, enrollment.sequenceId))
    .limit(1);
  if (!sequence) return failEnrollment(enrollment.id, organizationId, 'sequence missing');
  if (sequence.status !== 'active') {
    console.log(`[outreach] sequence ${sequence.id} is ${sequence.status}; skipping`);
    return { ok: false };
  }
  if (!sequence.socialConnectionId) {
    return failEnrollment(enrollment.id, organizationId, 'sequence has no email connection');
  }

  const orderedSteps = await db
    .select()
    .from(outreachSequenceSteps)
    .where(eq(outreachSequenceSteps.sequenceId, sequence.id))
    .orderBy(asc(outreachSequenceSteps.stepOrder));

  const step = orderedSteps.find((s) => s.stepOrder === enrollment.currentStepOrder);
  if (!step) {
    return completeEnrollment(enrollment.id, organizationId, sequence.id, enrollment.leadId);
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, enrollment.leadId)).limit(1);
  if (!lead) return failEnrollment(enrollment.id, organizationId, 'lead missing');
  if (lead.status === 'unsubscribed') {
    return stopEnrollment(
      enrollment.id,
      organizationId,
      sequence.id,
      enrollment.leadId,
      'unsubscribed',
    );
  }

  const [connection] = await db
    .select()
    .from(socialConnections)
    .where(eq(socialConnections.id, sequence.socialConnectionId))
    .limit(1);
  if (!connection || connection.platform !== 'email' || connection.status !== 'active') {
    return failEnrollment(
      enrollment.id,
      organizationId,
      `email connection unavailable (${connection?.status ?? 'missing'})`,
    );
  }

  try {
    // 1. Personalize
    const leadForAgent = {
      email: lead.email,
      first_name: lead.firstName,
      last_name: lead.lastName,
      full_name: lead.fullName,
      company: lead.company,
      title: lead.title,
      linkedin_url: lead.linkedinUrl,
      tags: lead.tags,
      custom_fields: lead.customFields,
    };
    const personalized = await callAgent('/agents/outreach/personalize', {
      organization_id: organizationId,
      lead: leadForAgent,
      subject_template: step.subjectTemplate,
      body_template: step.bodyTemplate,
      step_order: step.stepOrder,
      sender_name: connection.externalAccountId || null,
    });
    const renderedSubject = String(personalized.subject ?? '').trim();
    const renderedBody = String(personalized.body ?? '').trim();
    if (!renderedSubject || !renderedBody) {
      throw new Error('personalization agent returned empty subject/body');
    }

    // 2. Wrap the body as a one-off "email" payload. We reuse the `publishes` pipeline so
    //    the Resend publisher handles the actual send + tracking pixel.
    //    We don't tie this to a commit — outreach sends are lead-scoped, not content-scoped.
    //    The Resend publisher expects a commit; we side-step by routing through a synthetic
    //    one-shot path below.
    const sendResult = await sendDirectly({
      connection,
      recipient: lead.email,
      subject: renderedSubject,
      bodyMarkdown: renderedBody,
    });

    // 3. Record the send
    await db.insert(outreachSends).values({
      enrollmentId: enrollment.id,
      stepId: step.id,
      leadId: lead.id,
      publishId: null,
      renderedSubject,
      renderedBody,
      metadata: {
        resendId: sendResult.externalPostId,
        sequenceId: sequence.id,
        stepOrder: step.stepOrder,
      } as never,
    });

    await db
      .update(leads)
      .set({ lastContactedAt: new Date(), status: 'contacted', updatedAt: new Date() })
      .where(eq(leads.id, lead.id));

    await emit({
      organizationId,
      type: EventType.OutreachSent,
      actor: { system: true },
      subject: { type: EventSubjectType.Enrollment, id: enrollment.id },
      platform: 'email',
      externalId: sendResult.externalPostId,
      properties: {
        sequenceId: sequence.id,
        leadId: lead.id,
        leadEmail: lead.email,
        stepOrder: step.stepOrder,
        subject: renderedSubject,
      },
      message: `Sent step ${step.stepOrder + 1} to ${lead.email}`,
    });

    // 4. Advance to next step (or complete)
    const nextStep = orderedSteps.find((s) => s.stepOrder === step.stepOrder + 1);
    if (!nextStep) {
      await completeEnrollment(enrollment.id, organizationId, sequence.id, lead.id);
      return { ok: true, completed: true };
    }

    const nextAt = new Date(
      Date.now() + (nextStep.delayDaysAfterPrevious ?? 0) * 86_400_000,
    );
    await db
      .update(outreachEnrollments)
      .set({ currentStepOrder: nextStep.stepOrder, nextSendAt: nextAt })
      .where(eq(outreachEnrollments.id, enrollment.id));
    await outreachStepQueue.add(
      'run',
      { enrollmentId: enrollment.id, organizationId },
      {
        delay: Math.max(0, nextAt.getTime() - Date.now()),
        removeOnComplete: 200,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );
    return { ok: true, nextAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[outreach] step failed enrollment=${enrollment.id}`, err);
    await emit({
      organizationId,
      type: EventType.OutreachBounced,
      actor: { system: true },
      subject: { type: EventSubjectType.Enrollment, id: enrollment.id },
      platform: 'email',
      properties: { leadId: lead.id, leadEmail: lead.email, error: message },
      message: `Step failed for ${lead.email}: ${message}`,
    });
    return failEnrollment(enrollment.id, organizationId, message);
  }

  // Unreachable — satisfies TS by keeping the publishes import in scope.
  void publishes;
}

async function sendDirectly(params: {
  connection: typeof socialConnections.$inferSelect;
  recipient: string;
  subject: string;
  bodyMarkdown: string;
}): Promise<{ externalPostId: string }> {
  const { decryptSecret } = await import('../lib/crypto');
  const apiKey = decryptSecret(params.connection.encryptedAccessToken);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: params.connection.externalAccountId
        ? `${params.connection.externalAccountId} <${params.connection.accountHandle}>`
        : params.connection.accountHandle,
      to: [params.recipient],
      subject: params.subject,
      html: renderBodyAsHtml(params.bodyMarkdown),
    }),
  });
  const data = (await res.json()) as { id?: string; message?: string; name?: string };
  if (!res.ok || !data.id) {
    throw new Error(`Resend ${res.status}: ${data.message ?? data.name ?? res.statusText}`);
  }
  return { externalPostId: data.id };
}

function renderBodyAsHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.55;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;font-size:15px;">
${html}
</body></html>`;
}

async function callAgent(path: string, body: unknown): Promise<Record<string, unknown>> {
  const token = process.env.AGENTS_INTERNAL_TOKEN;
  if (!token) throw new Error('AGENTS_INTERNAL_TOKEN not set');
  const res = await fetch(`${AGENTS_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agents ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function completeEnrollment(
  enrollmentId: string,
  organizationId: string,
  sequenceId: string,
  leadId: string,
) {
  await db
    .update(outreachEnrollments)
    .set({ status: 'completed', nextSendAt: null, completedAt: new Date() })
    .where(eq(outreachEnrollments.id, enrollmentId));
  await emit({
    organizationId,
    type: EventType.EnrollmentCompleted,
    actor: { system: true },
    subject: { type: EventSubjectType.Enrollment, id: enrollmentId },
    properties: { sequenceId, leadId },
    message: 'Enrollment completed all steps',
  });
  return { ok: true, completed: true };
}

async function stopEnrollment(
  enrollmentId: string,
  organizationId: string,
  sequenceId: string,
  leadId: string,
  status: 'unsubscribed' | 'bounced' | 'stopped' | 'replied',
) {
  await db
    .update(outreachEnrollments)
    .set({ status, nextSendAt: null, completedAt: new Date() })
    .where(eq(outreachEnrollments.id, enrollmentId));
  await emit({
    organizationId,
    type: EventType.EnrollmentStopped,
    actor: { system: true },
    subject: { type: EventSubjectType.Enrollment, id: enrollmentId },
    properties: { sequenceId, leadId, reason: status },
    message: `Enrollment stopped (${status})`,
  });
  return { ok: false, reason: status };
}

async function failEnrollment(enrollmentId: string, organizationId: string, reason: string) {
  const [row] = await db
    .select()
    .from(outreachEnrollments)
    .where(eq(outreachEnrollments.id, enrollmentId))
    .limit(1);
  if (row) {
    await db
      .update(outreachEnrollments)
      .set({ status: 'bounced', nextSendAt: null, completedAt: new Date() })
      .where(eq(outreachEnrollments.id, enrollmentId));
    await emit({
      organizationId,
      type: EventType.OutreachBounced,
      actor: { system: true },
      subject: { type: EventSubjectType.Enrollment, id: enrollmentId },
      properties: { sequenceId: row.sequenceId, leadId: row.leadId, reason },
      message: `Enrollment failed: ${reason}`,
    });
  }
  // re-export `and` to silence TS about unused import — we might use it later
  void and;
  return { ok: false, reason };
}
