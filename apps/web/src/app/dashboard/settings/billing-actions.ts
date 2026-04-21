'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, emit, orgBilling, PLAN_CONFIG, type BillingPlan } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { requireOrgSession } from '@/lib/require-session';
import { getOrCreateBilling } from '@/lib/billing';
import {
  dodoCreateCustomer,
  dodoCreateSubscriptionCheckout,
  dodoCancelSubscription,
  productIdForPlan,
} from '@/lib/dodo';

export async function startUpgradeCheckout(plan: 'managed' | 'managed_pro') {
  const { session, activeOrgId } = await requireOrgSession();

  // Sanity
  if (!PLAN_CONFIG[plan]) return { error: 'unknown plan' };

  const billing = await getOrCreateBilling(activeOrgId);

  let customerId = billing.dodoCustomerId;
  try {
    if (!customerId) {
      const customer = await dodoCreateCustomer({
        email: session.user.email,
        name: session.user.name,
        organizationId: activeOrgId,
      });
      customerId = customer.id;
      await db
        .update(orgBilling)
        .set({ dodoCustomerId: customerId, updatedAt: new Date() })
        .where(eq(orgBilling.organizationId, activeOrgId));
    }

    const productId = productIdForPlan(plan);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const checkout = await dodoCreateSubscriptionCheckout({
      productId,
      customerId,
      organizationId: activeOrgId,
      successUrl: `${appUrl}/dashboard/settings?billing=success`,
      cancelUrl: `${appUrl}/dashboard/settings?billing=cancelled`,
    });

    return { ok: true, paymentLink: checkout.paymentLink };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

export async function cancelSubscriptionAction() {
  const { session, activeOrgId } = await requireOrgSession();
  const [billing] = await db
    .select()
    .from(orgBilling)
    .where(eq(orgBilling.organizationId, activeOrgId))
    .limit(1);
  if (!billing?.dodoSubscriptionId) {
    return { error: 'no active subscription to cancel' };
  }

  try {
    await dodoCancelSubscription(billing.dodoSubscriptionId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  await db
    .update(orgBilling)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orgBilling.organizationId, activeOrgId));

  await emit({
    organizationId: activeOrgId,
    type: EventType.PlanCancelled,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Organization, id: activeOrgId },
    properties: { plan: billing.plan },
    message: 'Cancelled subscription — access continues until period end',
  });

  revalidatePath('/dashboard/settings');
  return { ok: true };
}

/**
 * Dev-only fallback that flips the org to a managed plan without hitting DODO.
 * Useful for smoke-testing quotas + rate-limit UX before real payment is wired.
 */
export async function devUpgrade(plan: BillingPlan) {
  if (process.env.NODE_ENV === 'production') {
    return { error: 'dev upgrade disabled in production' };
  }
  const { session, activeOrgId } = await requireOrgSession();
  await getOrCreateBilling(activeOrgId);

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86_400_000);
  await db
    .update(orgBilling)
    .set({
      plan,
      status: plan === 'free' ? 'free' : 'active',
      currentPeriodStart: plan === 'free' ? null : now,
      currentPeriodEnd: plan === 'free' ? null : periodEnd,
      cancelledAt: null,
      updatedAt: now,
    })
    .where(eq(orgBilling.organizationId, activeOrgId));

  await emit({
    organizationId: activeOrgId,
    type: plan === 'free' ? EventType.PlanDowngraded : EventType.PlanUpgraded,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Organization, id: activeOrgId },
    properties: { plan, dev: true },
    message: `Dev-switched plan to ${plan}`,
  });

  revalidatePath('/dashboard/settings');
  return { ok: true };
}
