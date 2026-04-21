import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { db, emit, socialConnections } from '@marketing-os/db';
import { EventType, EventSubjectType } from '@marketing-os/shared';
import { auth } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';

export const runtime = 'nodejs';

const TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const ME_ACCOUNTS_URL =
  'https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account';

/**
 * Meta OAuth callback.
 *
 * One Facebook user → many Pages → at most one IG Business account per Page. We store a
 * row per IG-enabled Page so each can be picked as a publish target independently. The page
 * access_token (long-lived, per Page) is what Instagram Graph API wants — not the user token.
 */
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
    back.searchParams.set('meta_error', error);
    return NextResponse.redirect(back);
  }
  if (!code || !state) {
    back.searchParams.set('meta_error', 'missing_code_or_state');
    return NextResponse.redirect(back);
  }

  const cookieJar = await cookies();
  const expected = cookieJar.get('meta_oauth_state')?.value;
  cookieJar.delete('meta_oauth_state');
  if (!expected || state !== expected) {
    back.searchParams.set('meta_error', 'state_mismatch');
    return NextResponse.redirect(back);
  }

  const clientId = process.env.META_APP_ID!;
  const clientSecret = process.env.META_APP_SECRET!;
  const redirectUri =
    process.env.META_REDIRECT_URI ?? 'http://localhost:3000/api/connections/meta/callback';

  // 1. Exchange code for short-lived user token
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const tokenRes = await fetch(`${TOKEN_URL}?${tokenParams.toString()}`);
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    back.searchParams.set(
      'meta_error',
      tokenJson.error?.message ?? `token_exchange_${tokenRes.status}`,
    );
    return NextResponse.redirect(back);
  }
  const userToken = tokenJson.access_token;

  // 2. List Pages + their linked IG Business accounts, store each IG-enabled page separately
  const pagesRes = await fetch(`${ME_ACCOUNTS_URL}&access_token=${userToken}`);
  const pagesJson = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }>;
  };
  if (!pagesRes.ok || !pagesJson.data) {
    back.searchParams.set('meta_error', 'me_accounts_failed');
    return NextResponse.redirect(back);
  }

  const igPages = pagesJson.data.filter((p) => p.instagram_business_account?.id);
  if (igPages.length === 0) {
    back.searchParams.set(
      'meta_error',
      'no_instagram_business_account_linked_to_any_page',
    );
    return NextResponse.redirect(back);
  }

  for (const page of igPages) {
    const igId = page.instagram_business_account!.id;
    const [row] = await db
      .insert(socialConnections)
      .values({
        organizationId: activeOrgId,
        platform: 'instagram',
        accountHandle: page.name,
        externalAccountId: igId,
        encryptedAccessToken: encryptSecret(page.access_token),
        scopes: [
          'instagram_basic',
          'instagram_content_publish',
          'pages_show_list',
        ],
        connectedByUserId: session.user.id,
        status: 'active',
      })
      .returning();

    await emit({
      organizationId: activeOrgId,
      type: EventType.SocialConnected,
      actor: { userId: session.user.id },
      subject: { type: EventSubjectType.SocialConnection, id: row!.id },
      platform: 'instagram',
      properties: { handle: page.name, instagramId: igId, pageId: page.id },
      message: `Connected Instagram via page ${page.name}`,
    });
  }

  back.searchParams.set('connected', 'instagram');
  return NextResponse.redirect(back);
}
