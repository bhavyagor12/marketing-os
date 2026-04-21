"""HeyGen BYO key loader. Mirror of anthropic_client.py pattern."""

from __future__ import annotations

import os

import psycopg

from ..config import settings
from ..crypto import decrypt_secret


async def load_heygen_key(organization_id: str) -> str | None:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT encrypted_key
                FROM ai_provider_credentials
                WHERE organization_id = %s AND provider = 'heygen'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (organization_id,),
            )
            row = await cur.fetchone()
    if row:
        return decrypt_secret(row[0])
    return os.environ.get("HEYGEN_API_KEY")
