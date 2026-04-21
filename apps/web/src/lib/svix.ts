import crypto from 'node:crypto';

/**
 * Verifies a Svix-signed webhook (used by Resend, among others).
 * - Header `svix-signature` contains one or more space-separated `v1,<b64>` tuples
 * - HMAC is SHA256 of `${svix-id}.${svix-timestamp}.${rawBody}` using the decoded secret
 */
export function verifySvixSignature(params: {
  secret: string; // "whsec_..." format
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string;
}): boolean {
  if (!params.secret || !params.svixId || !params.svixTimestamp || !params.svixSignature) {
    return false;
  }

  // Reject stale deliveries (>5 minutes old)
  const ts = Number(params.svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Math.abs(Date.now() - ts * 1000);
  if (ageMs > 5 * 60 * 1000) return false;

  const clean = params.secret.replace(/^whsec_/, '');
  let key: Buffer;
  try {
    key = Buffer.from(clean, 'base64');
  } catch {
    return false;
  }

  const toSign = `${params.svixId}.${params.svixTimestamp}.${params.rawBody}`;
  const computed = crypto.createHmac('sha256', key).update(toSign).digest();

  const candidates = params.svixSignature
    .split(/\s+/)
    .map((part) => part.split(',', 2))
    .filter(([version]) => version === 'v1')
    .map(([, sig]) => sig)
    .filter((v): v is string => Boolean(v));

  for (const sig of candidates) {
    let supplied: Buffer;
    try {
      supplied = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (supplied.length !== computed.length) continue;
    if (crypto.timingSafeEqual(supplied, computed)) return true;
  }
  return false;
}
