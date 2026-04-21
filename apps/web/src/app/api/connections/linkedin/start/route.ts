import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { generateState } from '@/lib/pkce';

export const runtime = 'nodejs';

const LINKEDIN_AUTHORIZE = 'https://www.linkedin.com/oauth/v2/authorization';
const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse('unauthorized', { status: 401 });
  if (!session.session.activeOrganizationId) {
    return new NextResponse('no active organization', { status: 400 });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI ?? 'http://localhost:3000/api/connections/linkedin/callback';
  if (!clientId) {
    return new NextResponse(
      'LINKEDIN_CLIENT_ID not configured — add it to .env and restart.',
      { status: 500 },
    );
  }

  const state = generateState();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
  });

  const cookieJar = await cookies();
  cookieJar.set('li_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return NextResponse.redirect(`${LINKEDIN_AUTHORIZE}?${params.toString()}`);
}
