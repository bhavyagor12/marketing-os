import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { generateState } from '@/lib/pkce';

export const runtime = 'nodejs';

const META_AUTHORIZE = 'https://www.facebook.com/v19.0/dialog/oauth';
// Scopes needed to publish to an Instagram Business/Creator account linked to a Facebook Page.
const SCOPES = [
  'email',
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse('unauthorized', { status: 401 });
  if (!session.session.activeOrganizationId) {
    return new NextResponse('no active organization', { status: 400 });
  }

  const clientId = process.env.META_APP_ID;
  const redirectUri =
    process.env.META_REDIRECT_URI ?? 'http://localhost:3000/api/connections/meta/callback';
  if (!clientId) {
    return new NextResponse(
      'META_APP_ID not configured — add it to .env and restart.',
      { status: 500 },
    );
  }

  const state = generateState();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(','),
    response_type: 'code',
    state,
  });

  const cookieJar = await cookies();
  cookieJar.set('meta_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return NextResponse.redirect(`${META_AUTHORIZE}?${params.toString()}`);
}
