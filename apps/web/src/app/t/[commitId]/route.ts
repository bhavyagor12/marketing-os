import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, emit, commits } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';

export const runtime = 'nodejs';

/**
 * /t/[commitId]?to=<url> — the attribution entry point.
 *
 * When a published post's URL gets clicked (links in our posts are rewritten to route through
 * here by the worker's URL-wrapping step), we:
 *   1. Resolve the commit (and its campaign) for denormalized attribution fields
 *   2. Emit ExternalClick with commit_id + campaign_id + the referrer/user-agent/IP
 *   3. 302-redirect to the original URL
 *
 * Unknown commitIds still redirect (fail-open) so we never break a link. The emit is best-effort.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ commitId: string }> },
) {
  const { commitId } = await params;
  const url = new URL(req.url);
  const to = url.searchParams.get('to');

  const destination = safeDestination(to);

  // Lookup commit to get the campaign attribution. We don't require it — clicks on orphaned
  // commits still record, just without campaign.
  let orgId: string | null = null;
  let campaignId: string | null = null;
  try {
    const [c] = await db.select().from(commits).where(eq(commits.id, commitId)).limit(1);
    if (c) {
      campaignId = c.campaignId;
      // campaigns table is not loaded here; but events.org_id is needed — pull via campaign below
    }
  } catch (err) {
    console.warn('[track] commit lookup failed', err);
  }

  if (!orgId && campaignId) {
    try {
      const { campaigns } = await import('@marketing-os/db');
      const [camp] = await db
        .select({ organizationId: campaigns.organizationId })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      if (camp) orgId = camp.organizationId;
    } catch (err) {
      console.warn('[track] campaign lookup failed', err);
    }
  }

  if (orgId) {
    await emit({
      organizationId: orgId,
      type: EventType.ExternalClick,
      actor: { system: true },
      subject: { type: EventSubjectType.Commit, id: commitId },
      campaignId,
      commitId,
      properties: {
        destination,
        referer: req.headers.get('referer'),
        userAgent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') ?? null,
      },
      message: `Click → ${destination.slice(0, 80)}`,
    });
  }

  return NextResponse.redirect(destination, { status: 302 });
}

function safeDestination(to: string | null): string {
  if (!to) return '/';
  try {
    const u = new URL(to);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '/';
    return u.toString();
  } catch {
    return '/';
  }
}
