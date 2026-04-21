import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { organization } from './auth';

export type BillingPlan = 'free' | 'managed' | 'managed_pro';

/**
 * Plan definitions live in code (not DB) so changing quotas is a deploy, not a migration.
 * Managed plans charge through DODO; `free` is the default BYO-key tier.
 *
 * Quotas count agent runs in the current billing period, derived from our events stream.
 */
export const PLAN_CONFIG: Record<
  BillingPlan,
  {
    label: string;
    priceUsdCents: number;
    quotas: {
      plannerRuns: number;
      contentDrafts: number;
      imageGenerations: number;
      videoGenerations: number;
      outreachSends: number;
    };
    billingSource: 'byo_key' | 'managed';
  }
> = {
  free: {
    label: 'Free (BYO keys)',
    priceUsdCents: 0,
    billingSource: 'byo_key',
    quotas: {
      // Free tier = unlimited (your own API keys pay for it).
      plannerRuns: Number.POSITIVE_INFINITY,
      contentDrafts: Number.POSITIVE_INFINITY,
      imageGenerations: Number.POSITIVE_INFINITY,
      videoGenerations: Number.POSITIVE_INFINITY,
      outreachSends: Number.POSITIVE_INFINITY,
    },
  },
  managed: {
    label: 'Managed',
    priceUsdCents: 9900,
    billingSource: 'managed',
    quotas: {
      plannerRuns: 30,
      contentDrafts: 500,
      imageGenerations: 100,
      videoGenerations: 10,
      outreachSends: 2_000,
    },
  },
  managed_pro: {
    label: 'Managed Pro',
    priceUsdCents: 29900,
    billingSource: 'managed',
    quotas: {
      plannerRuns: 150,
      contentDrafts: 2_500,
      imageGenerations: 500,
      videoGenerations: 60,
      outreachSends: 20_000,
    },
  },
};

/**
 * org_billing — one row per organization. Holds current plan + DODO subscription
 * references + current period window. Rows are created on signup (defaulted to 'free')
 * via a server action / trigger, or on first upgrade attempt.
 */
export const orgBilling = pgTable(
  'org_billing',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    plan: text('plan').$type<BillingPlan>().notNull().default('free'),
    dodoCustomerId: text('dodo_customer_id'),
    dodoSubscriptionId: text('dodo_subscription_id'),
    status: text('status').$type<
      'active' | 'past_due' | 'cancelled' | 'incomplete' | 'trialing' | 'free'
    >().notNull().default('free'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelledAt: timestamp('cancelled_at'),
    // Stored as raw JSON from DODO for audit — we don't parse all of it.
    lastEventAt: timestamp('last_event_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    // Vanity field — shown in UI as "last payment" if set.
    lastChargeAmountCents: integer('last_charge_amount_cents'),
  },
  (t) => ({
    subIdx: index('org_billing_dodo_sub_idx').on(t.dodoSubscriptionId),
    custIdx: index('org_billing_dodo_cust_idx').on(t.dodoCustomerId),
  }),
);
