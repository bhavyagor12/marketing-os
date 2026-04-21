import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { generatePkceVerifier, pkceChallengeFromVerifier, generateState } from '@/lib/pkce';

export const runtime = 'nodejs';

const X_AUTHORIZE = 'https://x.com/i/oauth2/authorize';
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse('unauthorized', { status: 401 });
  if (!session.session.activeOrganizationId) {
    return new NextResponse('no active organization', { status: 400 });
  }

  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return new NextResponse(
      'X_CLIENT_ID / X_REDIRECT_URI not configured — add them to .env and restart.',
      { status: 500 },
    );
  }

  const verifier = generatePkceVerifier();
  const challenge = pkceChallengeFromVerifier(verifier);
  const state = generateState();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const cookieJar = await cookies();
  cookieJar.set('x_oauth_pkce', JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes to complete OAuth
  });

  return NextResponse.redirect(`${X_AUTHORIZE}?${params.toString()}`);
}
