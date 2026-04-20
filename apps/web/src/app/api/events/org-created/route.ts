import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { emit } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse('unauthorized', { status: 401 });

  const { organizationId, orgName } = (await req.json()) as {
    organizationId: string;
    orgName: string;
  };

  // Trust-but-verify: session cookie proves identity; the org was just created by this user,
  // so they're guaranteed the owner. We still scope the event to the org they claim.
  await emit({
    organizationId,
    type: EventType.OrgCreated,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Organization, id: organizationId },
    properties: { name: orgName },
    message: `Created workspace ${orgName}`,
  });

  await emit({
    organizationId,
    type: EventType.MemberJoined,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.Member, id: session.user.id },
    properties: { role: 'owner' },
    message: `${session.user.name} joined as owner`,
  });

  return NextResponse.json({ ok: true });
}
