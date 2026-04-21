import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, emit, orgBilling, type BillingPlan } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';

export const runtime = 'nodejs';

/**
 * DODO Payments webhook receiver.
 *
 * DODO signs webhooks with HMAC-SHA256 using your webhook secret. We verify the
 * `dodo-signature` header when DODO_WEBHOOK_SECRET is set. Events we handle:
 *   - subscription.created / subscription.active        → flip plan → active
 *   - subscription.renewed                               → roll period window forward
 *   - subscription.cancelled                             → set status=cancelled
 *   - payment.failed                                     → status=past_due
 *
 * Subscriptions carry `metadata.organizationId` (set at checkout creation) so we can
 * reconcile back to our org.
 */

type DodoEvent = {
  type: string;
  created_at?: string;
  data: Record<string, unknown> & {
    id?: string;
    customer_id?: string;
    product_id?: string;
    status?: string;
    current_period_start?: string;
    current_period_end?: string;
    metadata?: { organizationId?: string };
    amount?: number;
  };
};

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) return true; // dev mode — log + accept
  if (!signature) return false;
  const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  } catch {
    return false;
  }
}

function planForProduct(productId?: string): BillingPlan | null {
  if (!productId) return null;
  if (productId === process.env.DODO_PRODUCT_ID_MANAGED) return 'managed';
  if (productId === process.env.DODO_PRODUCT_ID_MANAGED_PRO) return 'managed_pro';
  return null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('dodo-signature');
  if (!verifySignature(raw, signature)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  let body: DodoEvent;
  try {
    body = JSON.parse(raw) as DodoEvent;
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  const orgId = body.data?.metadata?.organizationId;
  if (!orgId) {
    console.warn('[dodo] event without organizationId metadata:', body.type);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const now = new Date();
  const plan = planForProduct(body.data.product_id);

  switch (body.type) {
    case 'subscription.created':
    case 'subscription.active': {
      if (!plan) break;
      await db
        .update(orgBilling)
        .set({
          plan,
          dodoCustomerId: body.data.customer_id ?? undefined,
          dodoSubscriptionId: body.data.id ?? undefined,
          status: 'active',
          currentPeriodStart: body.data.current_period_start
            ? new Date(body.data.current_period_start)
            : now,
          currentPeriodEnd: body.data.current_period_end
            ? new Date(body.data.current_period_end)
            : null,
          cancelledAt: null,
          lastEventAt: now,
          updatedAt: now,
        })
        .where(eq(orgBilling.organizationId, orgId));
      await emit({
        organizationId: orgId,
        type: EventType.PlanUpgraded,
        actor: { system: true },
        subject: { type: EventSubjectType.Organization, id: orgId },
        properties: { plan, subscriptionId: body.data.id, amount: body.data.amount ?? null },
        message: `Upgraded to ${plan} via DODO`,
      });
      break;
    }

    case 'subscription.renewed':
    case 'invoice.paid': {
      await db
        .update(orgBilling)
        .set({
          status: 'active',
          currentPeriodStart: body.data.current_period_start
            ? new Date(body.data.current_period_start)
            : now,
          currentPeriodEnd: body.data.current_period_end
            ? new Date(body.data.current_period_end)
            : null,
          lastEventAt: now,
          lastChargeAmountCents:
            typeof body.data.amount === 'number' ? body.data.amount : null,
          updatedAt: now,
        })
        .where(eq(orgBilling.organizationId, orgId));
      await emit({
        organizationId: orgId,
        type: EventType.PlanRenewed,
        actor: { system: true },
        subject: { type: EventSubjectType.Organization, id: orgId },
        properties: { amount: body.data.amount ?? null },
        message: 'Subscription renewed',
      });
      break;
    }

    case 'subscription.cancelled':
    case 'subscription.canceled': {
      await db
        .update(orgBilling)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          lastEventAt: now,
          updatedAt: now,
        })
        .where(eq(orgBilling.organizationId, orgId));
      await emit({
        organizationId: orgId,
        type: EventType.PlanCancelled,
        actor: { system: true },
        subject: { type: EventSubjectType.Organization, id: orgId },
        properties: { subscriptionId: body.data.id },
        message: 'Subscription cancelled',
      });
      break;
    }

    case 'payment.failed':
    case 'invoice.payment_failed': {
      await db
        .update(orgBilling)
        .set({ status: 'past_due', lastEventAt: now, updatedAt: now })
        .where(eq(orgBilling.organizationId, orgId));
      await emit({
        organizationId: orgId,
        type: EventType.PlanPaymentFailed,
        actor: { system: true },
        subject: { type: EventSubjectType.Organization, id: orgId },
        properties: {},
        message: 'Payment failed — resolve to avoid interruption',
      });
      break;
    }

    default:
      // Unknown — ack anyway so DODO doesn't retry forever.
      break;
  }

  return NextResponse.json({ ok: true });
}
