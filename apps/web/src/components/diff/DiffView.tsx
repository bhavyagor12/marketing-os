import { diffLines, diffWordsWithSpace } from 'diff';
import { cx } from '@/lib/cx';

/**
 * DiffView renders either an inline unified diff or a side-by-side comparison
 * of two text strings. Line-level granularity; we also highlight word-level
 * changes within modified lines for readability.
 */
export function DiffView({
  before,
  after,
  mode = 'inline',
}: {
  before: string;
  after: string;
  mode?: 'inline' | 'split';
}) {
  const lineChanges = diffLines(before || '', after || '', { newlineIsToken: false });

  if (mode === 'split') {
    return <SplitDiff before={before} after={after} />;
  }

  return (
    <pre className="overflow-x-auto rounded-md border border-stone-200 bg-white font-mono text-xs leading-relaxed">
      {lineChanges.map((part, i) => {
        const classes = part.added
          ? 'bg-emerald-50 text-emerald-900'
          : part.removed
            ? 'bg-red-50 text-red-900'
            : 'text-stone-700';
        const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
        const lines = part.value.split('\n');
        // The last element after splitting trailing \n is empty — drop it for rendering
        if (lines[lines.length - 1] === '') lines.pop();
        return (
          <span key={i} className={classes}>
            {lines.map((line, li) => (
              <span key={li} className="block px-4 py-0.5 whitespace-pre-wrap">
                <span className="select-none pr-2 text-stone-400">{prefix}</span>
                {line || '\u00A0'}
              </span>
            ))}
          </span>
        );
      })}
    </pre>
  );
}

function SplitDiff({ before, after }: { before: string; after: string }) {
  const changes = diffLines(before || '', after || '');
  type Row = { left: string | null; right: string | null; kind: 'same' | 'add' | 'remove' | 'change' };
  const rows: Row[] = [];

  // Zip paired remove+add as a single "change" row; otherwise show as bare add or remove.
  let i = 0;
  while (i < changes.length) {
    const part = changes[i]!;
    const next = changes[i + 1];
    if (part.removed && next?.added) {
      const leftLines = trimNewlines(part.value).split('\n');
      const rightLines = trimNewlines(next.value).split('\n');
      const max = Math.max(leftLines.length, rightLines.length);
      for (let j = 0; j < max; j++) {
        rows.push({
          left: leftLines[j] ?? null,
          right: rightLines[j] ?? null,
          kind: 'change',
        });
      }
      i += 2;
    } else if (part.removed) {
      for (const line of trimNewlines(part.value).split('\n')) {
        rows.push({ left: line, right: null, kind: 'remove' });
      }
      i += 1;
    } else if (part.added) {
      for (const line of trimNewlines(part.value).split('\n')) {
        rows.push({ left: null, right: line, kind: 'add' });
      }
      i += 1;
    } else {
      for (const line of trimNewlines(part.value).split('\n')) {
        rows.push({ left: line, right: line, kind: 'same' });
      }
      i += 1;
    }
  }

  return (
    <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
      <div className="grid grid-cols-2 border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <div className="border-r border-stone-200 px-4 py-2">Before</div>
        <div className="px-4 py-2">After</div>
      </div>
      <div className="grid grid-cols-2 font-mono text-xs leading-relaxed">
        {rows.map((r, idx) => (
          <Row key={idx} row={r} />
        ))}
      </div>
    </div>
  );
}

function Row({ row }: { row: { left: string | null; right: string | null; kind: string } }) {
  const leftBg =
    row.kind === 'remove' || row.kind === 'change' ? 'bg-red-50 text-red-900' : 'text-stone-700';
  const rightBg =
    row.kind === 'add' || row.kind === 'change' ? 'bg-emerald-50 text-emerald-900' : 'text-stone-700';

  const inlineDiff = row.kind === 'change' && row.left !== null && row.right !== null
    ? diffWordsWithSpace(row.left, row.right)
    : null;

  return (
    <>
      <div className={cx('whitespace-pre-wrap border-r border-stone-200 px-4 py-0.5', leftBg)}>
        {row.left === null ? (
          '\u00A0'
        ) : inlineDiff ? (
          inlineDiff.map((part, i) =>
            part.removed ? (
              <span key={i} className="rounded bg-red-200/60 px-0.5">
                {part.value}
              </span>
            ) : part.added ? null : (
              <span key={i}>{part.value}</span>
            ),
          )
        ) : (
          row.left || '\u00A0'
        )}
      </div>
      <div className={cx('whitespace-pre-wrap px-4 py-0.5', rightBg)}>
        {row.right === null ? (
          '\u00A0'
        ) : inlineDiff ? (
          inlineDiff.map((part, i) =>
            part.added ? (
              <span key={i} className="rounded bg-emerald-200/60 px-0.5">
                {part.value}
              </span>
            ) : part.removed ? null : (
              <span key={i}>{part.value}</span>
            ),
          )
        ) : (
          row.right || '\u00A0'
        )}
      </div>
    </>
  );
}

function trimNewlines(s: string): string {
  return s.replace(/\n$/, '');
}
