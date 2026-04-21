import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { db, emit, socialConnections } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { auth } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';

export const runtime = 'nodejs';

const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL('/signin', req.url));

  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) return NextResponse.redirect(new URL('/signup', req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const back = new URL('/dashboard/connections', req.url);

  if (error) {
    back.searchParams.set('linkedin_error', error);
    return NextResponse.redirect(back);
  }
  if (!code || !state) {
    back.searchParams.set('linkedin_error', 'missing_code_or_state');
    return NextResponse.redirect(back);
  }

  const cookieJar = await cookies();
  const expectedState = cookieJar.get('li_oauth_state')?.value;
  cookieJar.delete('li_oauth_state');
  if (!expectedState || state !== expectedState) {
    back.searchParams.set('linkedin_error', 'state_mismatch');
    return NextResponse.redirect(back);
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI ?? 'http://localhost:3000/api/connections/linkedin/callback';

  // LinkedIn accepts credentials in the body, form-urlencoded.
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    back.searchParams.set(
      'linkedin_error',
      tokenJson.error_description ??
        tokenJson.error ??
        `token_exchange_${tokenRes.status}`,
    );
    return NextResponse.redirect(back);
  }

  // OIDC userinfo endpoint — gives sub (person URN suffix), name, email.
  const meRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const meJson = (await meRes.json()) as {
    sub?: string;
    name?: string;
    email?: string;
  };
  if (!meRes.ok || !meJson.sub) {
    back.searchParams.set('linkedin_error', 'userinfo_failed');
    return NextResponse.redirect(back);
  }

  const handle = meJson.email ?? meJson.name ?? meJson.sub;
  const scopes = (tokenJson.scope ?? '').split(/[,\s]+/).filter(Boolean);
  const tokenExpiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000)
    : null;

  const [row] = await db
    .insert(socialConnections)
    .values({
      organizationId: activeOrgId,
      platform: 'linkedin',
      accountHandle: handle,
      externalAccountId: meJson.sub,
      encryptedAccessToken: encryptSecret(tokenJson.access_token),
      encryptedRefreshToken: null,
      tokenExpiresAt,
      scopes,
      connectedByUserId: session.user.id,
      status: 'active',
    })
    .returning();

  await emit({
    organizationId: activeOrgId,
    type: EventType.SocialConnected,
    actor: { userId: session.user.id },
    subject: { type: EventSubjectType.SocialConnection, id: row!.id },
    platform: 'linkedin',
    properties: { handle, sub: meJson.sub, name: meJson.name },
    message: `Connected LinkedIn account ${handle}`,
  });

  back.searchParams.set('connected', 'linkedin');
  return NextResponse.redirect(back);
}
