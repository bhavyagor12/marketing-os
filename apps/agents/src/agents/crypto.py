import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings

KEY_VERSION = "v1"


def _load_root_key() -> bytes:
    key = base64.b64decode(settings.key_encryption_key)
    if len(key) != 32:
        raise ValueError("KEY_ENCRYPTION_KEY must decode to 32 bytes (base64)")
    return key


def decrypt_secret(encoded: str) -> str:
    """Mirror of apps/web/src/lib/crypto.ts — decrypts envelope ciphertexts produced there."""
    parts = encoded.split(":")
    if len(parts) != 4:
        raise ValueError("malformed ciphertext")
    version, iv_b64, tag_b64, ct_b64 = parts
    if version != KEY_VERSION:
        raise ValueError(f"unsupported key version: {version}")
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    ct = base64.b64decode(ct_b64)
    aes = AESGCM(_load_root_key())
    pt = aes.decrypt(iv, ct + tag, associated_data=None)
    return pt.decode("utf-8")
