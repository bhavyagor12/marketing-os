import crypto from 'node:crypto';

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function generatePkceVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function pkceChallengeFromVerifier(verifier: string): string {
  return base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
}

export function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(24));
}
