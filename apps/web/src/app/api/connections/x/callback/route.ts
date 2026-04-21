import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { db, emit, socialConnections } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { auth } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';

export const runtime = 'nodejs';

const X_TOKEN = 'https://api.x.com/2/oauth2/token';
const X_ME = 'https://api.x.com/2/users/me';

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
    back.searchParams.set('x_error', error);
    return NextResponse.redirect(back);
  }
  if (!code || !state) {
    back.searchParams.set('x_error', 'missing_code_or_state');
    return NextResponse.redirect(back);
  }

  const cookieJar = await cookies();
  const pkceCookie = cookieJar.get('x_oauth_pkce')?.value;
  cookieJar.delete('x_oauth_pkce');
  if (!pkceCookie) {
    back.searchParams.set('x_error', 'pkce_cookie_missing');
    return NextResponse.redirect(back);
  }
  const { verifier, state: expectedState } = JSON.parse(pkceCookie) as {
    verifier: string;
    state: string;
  };
  if (state !== expectedState) {
    back.searchParams.set('x_error', 'state_mismatch');
    return NextResponse.redirect(back);
  }

  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const redirectUri = process.env.X_REDIRECT_URI!;

  // Confidential client → Basic auth header.
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch(X_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    back.searchParams.set(
      'x_error',
      tokenJson.error_description ?? tokenJson.error ?? `token_exchange_${tokenRes.status}`,
    );
    return NextResponse.redirect(back);
  }

  // Fetch the authenticated user to store handle + external id.
  const meRes = await fetch(X_ME, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const meJson = (await meRes.json()) as {
    data?: { id: string; username: string; name?: string };
  };
  if (!meRes.ok || !meJson.data) {
    back.searchParams.set('x_error', 'users_me_failed');
    return NextResponse.redirect(back);
  }

  const scopes = (tokenJson.scope ?? '').split(' ').filter(Boolean);
  const tokenExpiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000)
    : null;

  const [row] = await db
    .insert(socialConnections)
    .values({
      organizationId: activeOrgId,
      platform: 'x',
      accountHandle: meJson.data.username,
      externalAccountId: meJson.data.id,
      encryptedAccessToken: encryptSecret(tokenJson.access_token),
      encryptedRefreshToken: tokenJson.refresh_token
        ? encryptSecret(tokenJson.refresh_token)
        : null,
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
    platform: 'x',
    properties: { handle: meJson.data.username, externalAccountId: meJson.data.id },
    message: `Connected X account @${meJson.data.username}`,
  });

  back.searchParams.set('connected', 'x');
  return NextResponse.redirect(back);
}
