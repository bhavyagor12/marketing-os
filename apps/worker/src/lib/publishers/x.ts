/**
 * X (Twitter) v2 publisher.
 *  - Single tweet: POST /2/tweets
 *  - Thread: sequential POST /2/tweets with reply.in_reply_to_tweet_id
 *  - URLs in the body get wrapped in our tracking endpoint so clicks attribute back to the commit.
 *
 * Media upload is intentionally NOT implemented yet — X v1.1 media/upload + v2 reference is a
 * bigger lift; landing when we build the creative agent.
 */
import type { AssetPayload } from '@marketing-os/shared';
import { wrapUrlsWithTracking } from '../tracking';

export type XPublishResult = {
  externalPostId: string;
  externalUrl: string;
  additionalIds?: string[];
};

const X_API = 'https://api.x.com/2/tweets';
const TWEET_LIMIT = 280;

export async function publishToX(params: {
  accessToken: string;
  commitId: string;
  payload: AssetPayload;
  handleForUrl: string;
}): Promise<XPublishResult> {
  if (params.payload.kind === 'text_post') {
    const text = wrapUrlsWithTracking(params.payload.body, params.commitId);
    if (text.length > TWEET_LIMIT) {
      throw new Error(
        `Post exceeds X's ${TWEET_LIMIT} char limit (got ${text.length}). Shorten or convert to a thread.`,
      );
    }
    const id = await postTweet({ accessToken: params.accessToken, text });
    return {
      externalPostId: id,
      externalUrl: tweetUrl(params.handleForUrl, id),
    };
  }

  if (params.payload.kind === 'thread') {
    const items = params.payload.items.map((i) =>
      wrapUrlsWithTracking(i.body, params.commitId),
    );
    const oversized = items.find((t) => t.length > TWEET_LIMIT);
    if (oversized) {
      throw new Error(
        `One thread item is ${oversized.length} chars (max ${TWEET_LIMIT}). Split it before publishing.`,
      );
    }
    const ids: string[] = [];
    let replyTo: string | undefined;
    for (const text of items) {
      const id = await postTweet({ accessToken: params.accessToken, text, replyTo });
      ids.push(id);
      replyTo = id;
    }
    const first = ids[0]!;
    return {
      externalPostId: first,
      externalUrl: tweetUrl(params.handleForUrl, first),
      additionalIds: ids.slice(1),
    };
  }

  throw new Error(
    `X publisher doesn't support content type "${params.payload.kind}" yet — text_post and thread only.`,
  );
}

async function postTweet(params: {
  accessToken: string;
  text: string;
  replyTo?: string;
}): Promise<string> {
  const body: Record<string, unknown> = { text: params.text };
  if (params.replyTo) body.reply = { in_reply_to_tweet_id: params.replyTo };

  const res = await fetch(X_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    data?: { id: string };
    title?: string;
    detail?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !data.data?.id) {
    const reason = data.detail ?? data.errors?.[0]?.message ?? data.title ?? res.statusText;
    throw new Error(`X API ${res.status}: ${reason}`);
  }
  return data.data.id;
}

function tweetUrl(handle: string, id: string): string {
  const cleanHandle = handle.replace(/^@/, '');
  return `https://x.com/${cleanHandle}/status/${id}`;
}
