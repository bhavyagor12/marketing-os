/**
 * Rewrite every http(s) URL in the given text so that clicks route through our
 * tracking endpoint (/t/<commitId>), preserving the destination in a query param.
 * Attribution chain: post published on X → user clicks wrapped URL → /t/ emits
 * ExternalClick event with commit_id → redirect to original URL.
 */
export function wrapUrlsWithTracking(text: string, commitId: string): string {
  const baseUrl = (process.env.TRACKING_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  // Matches http(s) URLs up to whitespace or closing punctuation we'd never want to include.
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g;
  return text.replace(urlRe, (match) => {
    // Strip trailing punctuation that's almost certainly sentence-level, not part of the URL.
    let tail = '';
    let url = match;
    while (url.length > 0 && /[.,;!?]$/.test(url)) {
      tail = url.slice(-1) + tail;
      url = url.slice(0, -1);
    }
    const wrapped = `${baseUrl}/t/${commitId}?to=${encodeURIComponent(url)}`;
    return wrapped + tail;
  });
}
