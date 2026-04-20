import crypto from 'node:crypto';

// Envelope-style encryption for BYO API keys + social OAuth tokens.
// Root key comes from KEY_ENCRYPTION_KEY (base64-encoded 32 bytes).
// AES-256-GCM; prefix format: v1:<iv_b64>:<tag_b64>:<ct_b64>

const ALGO = 'aes-256-gcm';
const KEY_VERSION = 'v1';

function loadRootKey(): Buffer {
  const raw = process.env.KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error('KEY_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('KEY_ENCRYPTION_KEY must decode to 32 bytes (base64)');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadRootKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${KEY_VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(encoded: string): string {
  const key = loadRootKey();
  const [version, ivB64, tagB64, ctB64] = encoded.split(':');
  if (version !== KEY_VERSION) throw new Error(`unsupported key version: ${version}`);
  const iv = Buffer.from(ivB64!, 'base64');
  const tag = Buffer.from(tagB64!, 'base64');
  const ct = Buffer.from(ctB64!, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export function keyFingerprint(plaintext: string): string {
  return plaintext.slice(-4);
}
