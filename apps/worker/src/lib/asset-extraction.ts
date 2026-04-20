import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const USER_AGENT = 'MarketingOS-Bot/0.1';

export type ImageCandidate = {
  kind: 'image' | 'logo' | 'favicon' | 'og_image';
  url: string;
  alt: string | null;
  prominence: number;
};

export type ColorCandidate = { hex: string; prominence: number };
export type FontCandidate = { family: string; provider: 'google' | 'font-face' | 'system' };

// ----- discovery from HTML -----

export function discoverImageCandidates(html: string, pageUrl: string): ImageCandidate[] {
  const $ = cheerio.load(html);
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();

  const push = (c: ImageCandidate) => {
    try {
      const abs = new URL(c.url, pageUrl).toString();
      if (seen.has(abs)) return;
      if (abs.startsWith('data:')) return;
      seen.add(abs);
      out.push({ ...c, url: abs });
    } catch {
      /* ignore */
    }
  };

  // og:image / twitter:image — the canonical share asset
  const og = $('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]')
    .first()
    .attr('content');
  if (og) push({ kind: 'og_image', url: og, alt: 'Open Graph image', prominence: 100 });

  // Favicons + apple-touch-icon
  $('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) push({ kind: 'favicon', url: href, alt: 'Favicon', prominence: 70 });
  });

  // Images in header / nav regions — usually the logo
  $('header img, nav img').each((_, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src');
    if (!src) return;
    const alt = $(el).attr('alt') ?? null;
    const cls = ($(el).attr('class') ?? '').toLowerCase();
    const isLogoish = /logo|brand|wordmark/.test(src.toLowerCase())
      || /logo|brand|wordmark/.test((alt ?? '').toLowerCase())
      || /logo|brand|wordmark/.test(cls);
    push({
      kind: isLogoish ? 'logo' : 'image',
      url: src,
      alt,
      prominence: isLogoish ? 90 : 60,
    });
  });

  // All other images, ranked by declared size
  $('img').each((_, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src');
    if (!src) return;
    const alt = $(el).attr('alt') ?? null;
    const w = parseInt($(el).attr('width') ?? '0', 10) || 0;
    const h = parseInt($(el).attr('height') ?? '0', 10) || 0;
    // Filter out obvious spacers / trackers
    if ((w > 0 && w < 32) || (h > 0 && h < 32)) return;
    const area = w * h;
    const prominence = area > 0 ? Math.min(50, Math.floor(area / 10_000)) : 20;
    push({ kind: 'image', url: src, alt, prominence });
  });

  // Sort by prominence desc, cap to 12
  return out.sort((a, b) => b.prominence - a.prominence).slice(0, 12);
}

export function discoverColorsFromHtml(html: string): ColorCandidate[] {
  const $ = cheerio.load(html);
  const found = new Map<string, number>();

  const add = (hex: string, weight: number) => {
    const norm = normalizeHex(hex);
    if (!norm) return;
    found.set(norm, (found.get(norm) ?? 0) + weight);
  };

  // Strongest signal
  const theme = $('meta[name="theme-color"]').attr('content');
  if (theme) add(theme, 100);

  const msTile = $('meta[name="msapplication-TileColor"]').attr('content');
  if (msTile) add(msTile, 60);

  // Inline <style> blocks
  $('style').each((_, el) => {
    const css = $(el).text();
    for (const hex of extractHexFromCss(css)) add(hex, 3);
  });

  // Inline style attributes
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') ?? '';
    for (const hex of extractHexFromCss(style)) add(hex, 2);
  });

  return Array.from(found.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([hex, prominence]) => ({ hex, prominence }));
}

export async function discoverColorsFromStylesheets(
  html: string,
  pageUrl: string,
  existing: ColorCandidate[],
): Promise<ColorCandidate[]> {
  const $ = cheerio.load(html);
  const sheetUrls: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        sheetUrls.push(new URL(href, pageUrl).toString());
      } catch {
        /* skip */
      }
    }
  });

  const counts = new Map<string, number>(existing.map((c) => [c.hex, c.prominence]));

  // Cap at first 3 stylesheets — enough signal, avoid hammering sites
  for (const url of sheetUrls.slice(0, 3)) {
    try {
      const css = await fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
      for (const hex of extractHexFromCss(css)) {
        const norm = normalizeHex(hex);
        if (!norm) continue;
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
      }
    } catch {
      /* skip broken stylesheet */
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([hex, prominence]) => ({ hex, prominence }));
}

export async function discoverFonts(html: string, pageUrl: string): Promise<FontCandidate[]> {
  const $ = cheerio.load(html);
  const out = new Map<string, FontCandidate>();

  // Google Fonts link
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const u = new URL(href, pageUrl);
      const families = u.searchParams.getAll('family');
      for (const f of families) {
        const family = decodeURIComponent(f.split(':')[0] ?? '').replace(/\+/g, ' ').trim();
        if (family) out.set(family, { family, provider: 'google' });
      }
    } catch {
      /* skip */
    }
  });

  // @font-face in inline + linked stylesheets
  const cssBlocks: string[] = [];
  $('style').each((_, el) => cssBlocks.push($(el).text()));

  const sheetUrls: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        sheetUrls.push(new URL(href, pageUrl).toString());
      } catch {
        /* skip */
      }
    }
  });

  for (const url of sheetUrls.slice(0, 3)) {
    try {
      const css = await fetchTextWithTimeout(url, FETCH_TIMEOUT_MS);
      cssBlocks.push(css);
    } catch {
      /* skip */
    }
  }

  for (const css of cssBlocks) {
    // @font-face { font-family: 'X' }
    const re = /@font-face[^}]*font-family\s*:\s*["']?([^"';}]+)["']?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const fam = m[1]?.trim();
      if (fam && !out.has(fam)) out.set(fam, { family: fam, provider: 'font-face' });
    }
  }

  return Array.from(out.values()).slice(0, 8);
}

// ----- image download -----

export async function downloadImage(url: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
} | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? 'application/octet-stream';
    if (!/^(image\/|application\/(octet-stream|pdf))/.test(ct)) return null;
    const len = parseInt(res.headers.get('content-length') ?? '0', 10);
    if (len && len > MAX_IMAGE_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;
    if (buf.byteLength < 100) return null; // tracking pixels / empty
    return { bytes: new Uint8Array(buf), mimeType: ct };
  } catch {
    return null;
  }
}

export function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('svg')) return 'svg';
  if (mimeType.includes('avif')) return 'avif';
  if (mimeType.includes('ico')) return 'ico';
  return 'bin';
}

// ----- helpers -----

function normalizeHex(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (s.startsWith('rgb')) {
    const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => parseInt(n ?? '0', 10));
    return rgbToHex(r!, g!, b!);
  }
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9a-f]{6}$/.test(s)) return null;
  // Skip pure black/white/transparent-ish greys — too generic
  if (s === '#000000' || s === '#ffffff') return null;
  return s;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`;
}

function* extractHexFromCss(css: string): Generator<string> {
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  const rgbRe = /rgba?\([^)]+\)/g;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(css))) yield m[0];
  while ((m = rgbRe.exec(css))) yield m[0];
}

async function fetchTextWithTimeout(url: string, ms: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
