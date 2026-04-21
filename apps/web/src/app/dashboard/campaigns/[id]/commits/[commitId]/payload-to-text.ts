import type { AssetPayload } from '@marketing-os/shared';

export function payloadToEditableText(payload: AssetPayload): string {
  if (payload.kind === 'text_post') return payload.body;
  if (payload.kind === 'thread') return payload.items.map((i) => i.body).join('\n\n');
  if (payload.kind === 'email') return `Subject: ${payload.subject}\n\n${payload.bodyMarkdown}`;
  if (payload.kind === 'image') return payload.caption;
  if (payload.kind === 'video') return payload.caption;
  if (payload.kind === 'carousel') return payload.slides[0]?.caption ?? '';
  if (payload.kind === 'article') return `# ${payload.title}\n\n${payload.bodyMarkdown}`;
  return '';
}
