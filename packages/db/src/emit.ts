import { db } from './index';
import { events } from './schema/events';
import type { EventTypeValue, EventSubjectTypeValue, Platform } from '@marketing-os/shared';

export type EmitActor =
  | { userId: string; agentRunId?: never; system?: never }
  | { agentRunId: string; userId?: never; system?: never }
  | { system: true; userId?: never; agentRunId?: never };

export type EmitParams = {
  organizationId: string;
  type: EventTypeValue;
  actor?: EmitActor;
  subject?: { type: EventSubjectTypeValue; id: string };
  // Attribution — denormalized for fast queries
  campaignId?: string | null;
  commitId?: string | null;
  assetId?: string | null;
  // External
  platform?: Platform | null;
  externalId?: string | null;
  // Revenue (Action → Revenue attribution)
  amountUsdMicros?: number | null;
  // Free-form
  properties?: Record<string, unknown> | null;
  message?: string | null;
  occurredAt?: Date;
};

/**
 * Record a single event. Call this from every write path — server actions, worker jobs,
 * agent completions, webhook handlers. Awaited by default (simple, correct); if a caller
 * is in a hot loop it can fire-and-forget with `void emit(...)`.
 *
 * Swallows errors so that instrumentation never breaks the primary write. Errors are
 * logged; we'll surface them via an internal dashboard later.
 */
export async function emit(params: EmitParams): Promise<void> {
  try {
    await db.insert(events).values({
      organizationId: params.organizationId,
      actorUserId: params.actor && 'userId' in params.actor ? params.actor.userId : null,
      actorAgentRunId:
        params.actor && 'agentRunId' in params.actor ? params.actor.agentRunId : null,
      actorSystem: Boolean(params.actor && 'system' in params.actor && params.actor.system),
      type: params.type,
      subjectType: params.subject?.type ?? null,
      subjectId: params.subject?.id ?? null,
      campaignId: params.campaignId ?? null,
      commitId: params.commitId ?? null,
      assetId: params.assetId ?? null,
      platform: params.platform ?? null,
      externalId: params.externalId ?? null,
      amountUsdMicros: params.amountUsdMicros ?? null,
      properties: (params.properties ?? null) as never,
      message: params.message ?? null,
      occurredAt: params.occurredAt ?? new Date(),
    });
  } catch (err) {
    console.error('[emit] failed to record event', { type: params.type, err });
  }
}
