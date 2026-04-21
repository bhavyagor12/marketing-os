/**
 * Resend email publisher.
 *
 * - Reads API key + from-address from the socialConnection (platform='email').
 * - Reads recipient from publishes.metadata.recipient.
 * - Converts the asset payload into subject + HTML body.
 * - Calls Resend `POST /emails`; returns the Resend message id as externalPostId.
 */
import type { AssetPayload } from '@marketing-os/shared';
import { wrapUrlsWithTracking } from '../tracking';

const RESEND_URL = 'https://api.resend.com/emails';

export type EmailPublishResult = {
  externalPostId: string;
  externalUrl: string;
};

export async function publishToEmail(params: {
  apiKey: string;
  fromAddress: string;
  fromName: string | null;
  recipient: string;
  commitId: string;
  payload: AssetPayload;
  pixelBaseUrl: string;
}): Promise<EmailPublishResult> {
  const { subject, html } = renderEmail({
    commitId: params.commitId,
    payload: params.payload,
    pixelBaseUrl: params.pixelBaseUrl,
  });

  const fromHeader = params.fromName
    ? `${params.fromName} <${params.fromAddress}>`
    : params.fromAddress;

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [params.recipient],
      subject,
      html,
    }),
  });
  const data = (await res.json()) as {
    id?: string;
    message?: string;
    name?: string;
    statusCode?: number;
  };
  if (!res.ok || !data.id) {
    const reason = data.message ?? data.name ?? res.statusText;
    throw new Error(`Resend ${res.status}: ${reason}`);
  }

  return {
    externalPostId: data.id,
    externalUrl: `https://resend.com/emails/${data.id}`,
  };
}

function renderEmail(params: {
  commitId: string;
  payload: AssetPayload;
  pixelBaseUrl: string;
}): { subject: string; html: string } {
  const pixel = `${params.pixelBaseUrl.replace(/\/$/, '')}/p/${params.commitId}`;

  if (params.payload.kind === 'email') {
    const html = renderMarkdownToHtml(
      wrapUrlsWithTracking(params.payload.bodyMarkdown, params.commitId),
    );
    return {
      subject: params.payload.subject || 'Untitled',
      html: wrapEmail(html, pixel, params.payload.preheader),
    };
  }

  // Fallback — any other content type gets a minimal render so the user can test quickly.
  const subject = deriveSubject(params.payload);
  const body = bodyFromPayload(params.payload);
  const html = renderMarkdownToHtml(wrapUrlsWithTracking(body, params.commitId));
  return { subject, html: wrapEmail(html, pixel) };
}

function deriveSubject(payload: AssetPayload): string {
  if (payload.kind === 'email') return payload.subject;
  if (payload.kind === 'text_post') return payload.body.slice(0, 80);
  if (payload.kind === 'thread') return payload.items[0]?.body.slice(0, 80) ?? 'Thread';
  if (payload.kind === 'image') return payload.caption.slice(0, 80) || 'Image';
  if (payload.kind === 'video') return payload.caption.slice(0, 80) || 'Video';
  if (payload.kind === 'carousel') return payload.slides[0]?.caption?.slice(0, 80) ?? 'Carousel';
  return 'Marketing OS';
}

function bodyFromPayload(payload: AssetPayload): string {
  if (payload.kind === 'text_post') return payload.body;
  if (payload.kind === 'thread') return payload.items.map((i) => i.body).join('\n\n');
  if (payload.kind === 'image') return payload.caption;
  if (payload.kind === 'video') return payload.caption;
  if (payload.kind === 'carousel') return payload.slides.map((s) => s.caption ?? '').join('\n\n');
  if (payload.kind === 'email') return payload.bodyMarkdown;
  return '';
}

/** Ultra-minimal markdown→HTML for the MVP. Handles paragraphs, bold, italic, links. */
function renderMarkdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.55;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function wrapEmail(bodyHtml: string, pixelUrl: string, preheader?: string): string {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>`
    : '';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;">
    ${preheaderHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;max-width:600px;">
            <tr>
              <td style="padding:32px;font-size:15px;">
                ${bodyHtml}
                <img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;" />
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
