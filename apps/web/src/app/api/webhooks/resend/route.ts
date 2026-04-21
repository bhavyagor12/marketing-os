import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  emit,
  outreachSends,
  outreachEnrollments,
  leads,
} from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { verifySvixSignature } from '@/lib/svix';

export const runtime = 'nodejs';

/**
 * Resend webhook receiver.
 *
 * Resend signs via Svix (headers: svix-id, svix-timestamp, svix-signature).
 * Event types we handle:
 *   - email.opened / email.clicked  → update outreach_sends + lead engagement timestamps
 *   - email.bounced / email.failed  → mark send bounced, flip enrollment to 'bounced'
 *   - email.complained              → hard-unsubscribe the lead + stop all its enrollments
 *   - email.delivered               → informational only
 *
 * We match incoming events back to our records via data.email_id, which we stored as
 * outreach_sends.metadata.resendId at send time.
 */

type ResendEvent = {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; reason?: string };
    click?: { link?: string };
    [k: string]: unknown;
  };
};

export async function POST(req: Request) {
  const raw = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const svixId = req.headers.get('svix-id') ?? '';
    const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
    const svixSignature = req.headers.get('svix-signature') ?? '';
    const ok = verifySvixSignature({
      secret,
      svixId,
      svixTimestamp,
      svixSignature,
      rawBody: raw,
    });
    if (!ok) return new NextResponse('invalid signature', { status: 401 });
  }

  let body: ResendEvent;
  try {
    body = JSON.parse(raw) as ResendEvent;
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }

  const emailId = body.data?.email_id;
  if (!emailId) {
    // Nothing we can correlate.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Find the matching outreach_send by the Resend message id we saved at send time.
  const [send] = await db
    .select({
      id: outreachSends.id,
      enrollmentId: outreachSends.enrollmentId,
      leadId: outreachSends.leadId,
      renderedSubject: outreachSends.renderedSubject,
    })
    .from(outreachSends)
    .where(
      sql`${outreachSends.metadata} ->> 'resendId' = ${emailId}`,
    )
    .limit(1);

  if (!send) {
    // Might be a legitimate transactional email we're not tracking; ack and move on.
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const [enrollment] = await db
    .select()
    .from(outreachEnrollments)
    .where(eq(outreachEnrollments.id, send.enrollmentId))
    .limit(1);
  if (!enrollment) return NextResponse.json({ ok: true, orphan: true });

  const orgId = enrollment.organizationId;
  const now = new Date();

  switch (body.type) {
    case 'email.opened':
      await db
        .update(outreachSends)
        .set({ openedAt: now })
        .where(and(eq(outreachSends.id, send.id), sql`${outreachSends.openedAt} IS NULL`));
      await db
        .update(leads)
        .set({ lastOpenedAt: now })
        .where(eq(leads.id, send.leadId));
      await emit({
        organizationId: orgId,
        type: EventType.OutreachOpened,
        actor: { system: true },
        subject: { type: EventSubjectType.Enrollment, id: enrollment.id },
        platform: 'email',
        externalId: emailId,
        properties: { leadId: send.leadId, subject: send.renderedSubject },
        message: `Lead opened: ${send.renderedSubject}`,
      });
      break;

    case 'email.clicked':
      await db
        .update(outreachSends)
        .set({ clickedAt: now })
        .where(and(eq(outreachSends.id, send.id), sql`${outreachSends.clickedAt} IS NULL`));
      await db
        .update(leads)
        .set({ lastClickedAt: now })
        .where(eq(leads.id, send.leadId));
      await emit({
        organizationId: orgId,
        type: EventType.OutreachClicked,
        actor: { system: true },
        subject: { type: EventSubjectType.Enrollment, id: enrollment.id },
        platform: 'email',
        externalId: emailId,
        properties: {
          leadId: send.leadId,
          link: body.data?.click?.link ?? null,
          subject: send.renderedSubject,
        },
        message: `Lead clicked: ${body.data?.click?.link ?? send.renderedSubject}`,
      });
      break;

    case 'email.bounced':
    case 'email.failed':
      await db
        .update(outreachSends)
        .set({ bouncedAt: now })
        .where(and(eq(outreachSends.id, send.id), sql`${outreachSends.bouncedAt} IS NULL`));
      if (enrollment.status === 'active') {
        await db
          .update(outreachEnrollments)
          .set({ status: 'bounced', nextSendAt: null, completedAt: now })
          .where(eq(outreachEnrollments.id, enrollment.id));
      }
      await emit({
        organizationId: orgId,
        type: EventType.OutreachBounced,
        actor: { system: true },
        subject: { type: EventSubjectType.Enrollment, id: enrollment.id },
        platform: 'email',
        externalId: emailId,
        properties: {
          leadId: send.leadId,
          reason: body.data?.bounce?.reason ?? body.type,
        },
        message: `Email bounced for lead`,
      });
      break;

    case 'email.complained':
      // Hard unsubscribe — honor it everywhere.
      await db
        .update(leads)
        .set({
          status: 'unsubscribed',
          unsubscribedAt: now,
          updatedAt: now,
        })
        .where(eq(leads.id, send.leadId));
      await db
        .update(outreachEnrollments)
        .set({ status: 'unsubscribed', nextSendAt: null, completedAt: now })
        .where(
          and(
            eq(outreachEnrollments.leadId, send.leadId),
            eq(outreachEnrollments.status, 'active'),
          ),
        );
      await emit({
        organizationId: orgId,
        type: EventType.LeadUnsubscribed,
        actor: { system: true },
        subject: { type: EventSubjectType.Lead, id: send.leadId },
        platform: 'email',
        externalId: emailId,
        message: `Lead unsubscribed (complaint received)`,
      });
      break;

    case 'email.delivered':
      // No-op for now — we already recorded the send. Useful later for deliverability stats.
      break;

    default:
      // Unknown type — ack so Resend doesn't retry.
      break;
  }

  return NextResponse.json({ ok: true });
}
