/**
 * LinkedIn v2 UGC Post publisher.
 *  - Uses w_member_social scope to post on behalf of the authenticated member.
 *  - URLs in the post body get tracker-wrapped for attribution.
 *  - Images/video come later — supports text_post / thread (joined) for now.
 */
import type { AssetPayload } from '@marketing-os/shared';
import { wrapUrlsWithTracking } from '../tracking';

const UGC_URL = 'https://api.linkedin.com/v2/ugcPosts';

export type LinkedInPublishResult = {
  externalPostId: string;
  externalUrl: string;
};

export async function publishToLinkedIn(params: {
  accessToken: string;
  personSub: string; // the `sub` field from /v2/userinfo — a stable id for the person
  commitId: string;
  payload: AssetPayload;
}): Promise<LinkedInPublishResult> {
  const text = buildText(params.payload, params.commitId);
  if (text.length > 3000) {
    throw new Error(
      `LinkedIn posts cap at 3,000 chars; got ${text.length}. Trim before publishing.`,
    );
  }

  const body = {
    author: `urn:li:person:${params.personSub}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const res = await fetch(UGC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LinkedIn ${res.status}: ${detail.slice(0, 240)}`);
  }

  const id = res.headers.get('x-restli-id') || '';
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  const urn = data.id || id;
  if (!urn) throw new Error('LinkedIn response missing post URN');

  // URN looks like urn:li:share:ACTIVITYID or urn:li:ugcPost:ID.
  const activityId = urn.split(':').pop() || urn;
  return {
    externalPostId: urn,
    externalUrl: `https://www.linkedin.com/feed/update/${urn}/`,
  };

  // activityId is not currently used but kept here to document the parse for the future.
  void activityId;
}

function buildText(payload: AssetPayload, commitId: string): string {
  if (payload.kind === 'text_post') {
    return wrapUrlsWithTracking(payload.body, commitId);
  }
  if (payload.kind === 'thread') {
    // LinkedIn doesn't support threads natively — join as line-break-separated paragraphs.
    return wrapUrlsWithTracking(
      payload.items.map((i) => i.body).join('\n\n'),
      commitId,
    );
  }
  if (payload.kind === 'image') {
    // Image-as-attachment requires the assets register flow (not yet implemented); caption-only.
    return wrapUrlsWithTracking(payload.caption, commitId);
  }
  if (payload.kind === 'video') return wrapUrlsWithTracking(payload.caption, commitId);
  if (payload.kind === 'carousel') {
    return wrapUrlsWithTracking(
      payload.slides.map((s) => s.caption ?? '').filter(Boolean).join('\n\n'),
      commitId,
    );
  }
  if (payload.kind === 'email') {
    return wrapUrlsWithTracking(
      `${payload.subject}\n\n${payload.bodyMarkdown}`,
      commitId,
    );
  }
  return '';
}
