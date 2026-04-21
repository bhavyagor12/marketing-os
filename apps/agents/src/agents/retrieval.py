"""Brand-memory retrieval for RAG. Embeds a query via Voyage, cosine-searches pgvector."""

from __future__ import annotations

import os

import httpx
import psycopg

from .config import settings
from .crypto import decrypt_secret

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
EMBED_MODEL = "voyage-2"
EMBED_DIMS = 1536


async def _load_voyage_key(organization_id: str) -> str | None:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT encrypted_key
                FROM ai_provider_credentials
                WHERE organization_id = %s AND provider = 'voyage'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (organization_id,),
            )
            row = await cur.fetchone()
    if row:
        return decrypt_secret(row[0])
    return os.environ.get("VOYAGE_API_KEY")


async def _embed_query(api_key: str, text: str) -> list[float] | None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            VOYAGE_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"input": [text], "model": EMBED_MODEL, "input_type": "query"},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        items = data.get("data") or []
        if not items:
            return None
        return items[0].get("embedding")


async def retrieve_brand_chunks(
    organization_id: str,
    query: str,
    k: int = 8,
) -> list[str]:
    """Retrieve top-k brand memory chunks for `query`. Graceful degradation:
       - no Voyage key → return recent chunks (no vector search)
       - no embedded chunks → return recent chunks
    """
    api_key = await _load_voyage_key(organization_id)

    if not api_key:
        return await _load_recent_chunks(organization_id, k)

    vec = await _embed_query(api_key, query[:2000])
    if not vec or len(vec) != EMBED_DIMS:
        return await _load_recent_chunks(organization_id, k)

    # pgvector cosine search — '<=>' operator, ascending = most similar first.
    vec_literal = "[" + ",".join(f"{x:.6f}" for x in vec) + "]"
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT content
                FROM brand_memory
                WHERE organization_id = %s AND embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (organization_id, vec_literal, k),
            )
            rows = await cur.fetchall()
    if not rows:
        return await _load_recent_chunks(organization_id, k)
    return [r[0] for r in rows]


async def _load_recent_chunks(organization_id: str, k: int) -> list[str]:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT content
                FROM brand_memory
                WHERE organization_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (organization_id, k),
            )
            rows = await cur.fetchall()
    return [r[0] for r in rows]
