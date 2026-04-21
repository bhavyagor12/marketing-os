import { and, eq, gte, sql } from 'drizzle-orm';
import { db, orgBilling, events, PLAN_CONFIG, type BillingPlan } from '@marketing-os/db';
import { EventType } from '@marketing-os/shared';

export async function getOrCreateBilling(organizationId: string) {
  const [existing] = await db
    .select()
    .from(orgBilling)
    .where(eq(orgBilling.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(orgBilling)
    .values({
      organizationId,
      plan: 'free',
      status: 'free',
    })
    .returning();
  return created!;
}

export type UsageSnapshot = {
  plannerRuns: number;
  contentDrafts: number;
  imageGenerations: number;
  videoGenerations: number;
  outreachSends: number;
  periodStart: Date;
  periodEnd: Date | null;
};

/**
 * Usage for the current billing period. For free-plan orgs (no period) we fall back to a
 * rolling 30-day window so the dashboard still shows something useful.
 */
export async function getUsageSnapshot(
  organizationId: string,
  billing: typeof orgBilling.$inferSelect,
): Promise<UsageSnapshot> {
  const periodStart =
    billing.currentPeriodStart ?? new Date(Date.now() - 30 * 86_400_000);
  const periodEnd = billing.currentPeriodEnd ?? null;

  const [row] = await db
    .select({
      plannerRuns: sql<number>`count(*) filter (
        where ${events.type} = ${EventType.AgentRunCompleted}
          and ${events.properties} ->> 'kind' = 'planner'
      )`.mapWith(Number),
      contentDrafts: sql<number>`count(*) filter (
        where ${events.type} = ${EventType.AgentRunCompleted}
          and ${events.properties} ->> 'kind' = 'content'
      )`.mapWith(Number),
      imageGenerations: sql<number>`count(*) filter (
        where ${events.type} = ${EventType.AgentRunCompleted}
          and ${events.properties} ->> 'kind' = 'image'
      )`.mapWith(Number),
      videoGenerations: sql<number>`count(*) filter (
        where ${events.type} = ${EventType.AgentRunCompleted}
          and ${events.properties} ->> 'kind' = 'video'
      )`.mapWith(Number),
      outreachSends: sql<number>`count(*) filter (
        where ${events.type} = ${EventType.OutreachSent}
      )`.mapWith(Number),
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, organizationId),
        gte(events.occurredAt, periodStart),
      ),
    );

  return {
    plannerRuns: row?.plannerRuns ?? 0,
    contentDrafts: row?.contentDrafts ?? 0,
    imageGenerations: row?.imageGenerations ?? 0,
    videoGenerations: row?.videoGenerations ?? 0,
    outreachSends: row?.outreachSends ?? 0,
    periodStart,
    periodEnd,
  };
}

/**
 * checkQuota — returns `{ ok: true }` if the org is within its plan's allowance for
 * the given kind, or `{ ok: false, reason }` otherwise. Server actions that call agents
 * should gate on this before incurring cost.
 */
export async function checkQuota(
  organizationId: string,
  kind: keyof UsageSnapshot extends `${infer K}` ? K : never,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const billing = await getOrCreateBilling(organizationId);
  const plan: BillingPlan = billing.plan;
  const config = PLAN_CONFIG[plan];
  const usage = await getUsageSnapshot(organizationId, billing);

  // Free tier is effectively unlimited because the user is paying the API provider directly.
  if (config.billingSource === 'byo_key') return { ok: true };

  const quotaKey = kind as keyof typeof config.quotas;
  const limit = config.quotas[quotaKey];
  const used = usage[kind as keyof UsageSnapshot] as number;
  if (!Number.isFinite(limit)) return { ok: true };
  if (used >= limit) {
    return {
      ok: false,
      reason: `You've hit your ${plan} plan's ${String(quotaKey)} quota (${limit}) for this period. Upgrade on the Settings → Billing page, or switch back to BYO keys.`,
    };
  }
  return { ok: true };
}
