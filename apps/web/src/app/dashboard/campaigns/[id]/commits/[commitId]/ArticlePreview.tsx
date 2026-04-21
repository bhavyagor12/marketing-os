'use client';

import { useMemo, useState } from 'react';
import { Copy, Check, FileText } from 'lucide-react';

/**
 * Minimal markdown → HTML for article preview. Handles headings, bold, italics, links,
 * paragraphs, and ordered/unordered lists. Not a full implementation — good enough to
 * show the shape of the draft.
 */
function renderMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const out: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let buffer: string[] = [];

  function flushParagraph() {
    if (buffer.length === 0) return;
    out.push(`<p class="mt-4 leading-relaxed">${buffer.join(' ')}</p>`);
    buffer = [];
  }
  function closeList() {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      flushParagraph();
      closeList();
      const m = line.match(/^(#{1,6})\s+(.+)$/)!;
      const level = m[1]!.length;
      const size =
        level === 1
          ? 'mt-6 text-2xl font-semibold tracking-tight'
          : level === 2
            ? 'mt-6 text-xl font-semibold tracking-tight'
            : 'mt-4 text-lg font-semibold';
      out.push(`<h${level} class="${size}">${inlineMd(m[2]!)}</h${level}>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushParagraph();
      if (inList !== 'ol') {
        closeList();
        out.push('<ol class="mt-3 list-decimal pl-6 space-y-1">');
        inList = 'ol';
      }
      out.push(`<li>${inlineMd(ol[1]!)}</li>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      if (inList !== 'ul') {
        closeList();
        out.push('<ul class="mt-3 list-disc pl-6 space-y-1">');
        inList = 'ul';
      }
      out.push(`<li>${inlineMd(ul[1]!)}</li>`);
      continue;
    }

    closeList();
    buffer.push(inlineMd(line));
  }
  flushParagraph();
  closeList();
  return out.join('\n');
}

function inlineMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="underline" href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-stone-100 px-1 py-0.5 text-[90%]">$1</code>');
}

export function ArticlePreview({
  title,
  bodyMarkdown,
}: {
  title: string;
  bodyMarkdown: string;
}) {
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => renderMarkdown(bodyMarkdown), [bodyMarkdown]);
  const fullMarkdown = `# ${title}\n\n${bodyMarkdown}`;

  async function copyMd() {
    try {
      await navigator.clipboard.writeText(fullMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  const wordCount = bodyMarkdown.trim().split(/\s+/).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-xs text-stone-500">
          <FileText className="h-3 w-3" />
          {wordCount.toLocaleString()} words
        </p>
        <button
          type="button"
          onClick={copyMd}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-50"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-600" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy markdown
            </>
          )}
        </button>
      </div>
      <article className="rounded-md border border-stone-200 bg-white px-6 py-5 text-stone-800">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        <div
          className="text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </div>
  );
}
