import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, emit, commits, campaigns } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';

export const runtime = 'nodejs';

/**
 * /p/[commitId] — a 1×1 transparent GIF for impression tracking.
 *
 * Embed as `<img src="https://marketing-os/p/COMMIT_ID" width="1" height="1" />` in emails or
 * landing pages served by the platform. Not useful on social posts (platforms strip them), but
 * unlocks email open tracking + on-site impression tracking.
 *
 * Fires ExternalImpression events scoped to the commit and its campaign.
 */
const GIF_1x1 = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ commitId: string }> },
) {
  const { commitId } = await params;

  try {
    const [c] = await db
      .select({ campaignId: commits.campaignId })
      .from(commits)
      .where(eq(commits.id, commitId))
      .limit(1);
    if (c) {
      const [camp] = await db
        .select({ organizationId: campaigns.organizationId })
        .from(campaigns)
        .where(eq(campaigns.id, c.campaignId))
        .limit(1);
      if (camp) {
        await emit({
          organizationId: camp.organizationId,
          type: EventType.ExternalImpression,
          actor: { system: true },
          subject: { type: EventSubjectType.Commit, id: commitId },
          campaignId: c.campaignId,
          commitId,
          properties: {
            referer: req.headers.get('referer'),
            userAgent: req.headers.get('user-agent'),
            ip: req.headers.get('x-forwarded-for') ?? null,
          },
        });
      }
    }
  } catch (err) {
    console.warn('[pixel] emit failed', err);
  }

  return new NextResponse(GIF_1x1, {
    status: 200,
    headers: {
      'content-type': 'image/gif',
      'content-length': String(GIF_1x1.length),
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });
}
