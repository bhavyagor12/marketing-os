// Naive paragraph-aware chunker. Splits on blank lines, packs paragraphs up to targetChars,
// with a soft minimum to avoid tiny chunks. Good enough for brand corpus ingestion; we'll
// swap to a smarter splitter once we wire embeddings.

export function chunkText(
  input: string,
  { targetChars = 1500, minChars = 300 }: { targetChars?: number; minChars?: number } = {},
): string[] {
  const cleaned = input
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let buf: string[] = [];
  let bufLen = 0;

  for (const p of paragraphs) {
    if (bufLen + p.length > targetChars && bufLen >= minChars) {
      chunks.push(buf.join('\n\n'));
      buf = [];
      bufLen = 0;
    }
    buf.push(p);
    bufLen += p.length + 2;
  }
  if (buf.length > 0) chunks.push(buf.join('\n\n'));

  // Merge any too-small trailing chunk into the previous one.
  if (chunks.length >= 2 && chunks[chunks.length - 1]!.length < minChars) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n${tail}`;
  }
  return chunks;
}
