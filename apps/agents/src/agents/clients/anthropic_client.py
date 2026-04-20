from __future__ import annotations

import os

import psycopg
from langchain_anthropic import ChatAnthropic

from ..config import settings
from ..crypto import decrypt_secret


async def _load_org_anthropic_key(organization_id: str) -> str | None:
    """Fetch the most recently added Anthropic key for an org, decrypt it.

    Returns None if the org has no BYO key — callers should fall back to a managed key
    (future) or surface an error to the user.
    """
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT encrypted_key
                FROM ai_provider_credentials
                WHERE organization_id = %s AND provider = 'anthropic'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (organization_id,),
            )
            row = await cur.fetchone()
    if row is None:
        return None
    return decrypt_secret(row[0])


async def make_anthropic(
    *,
    organization_id: str,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 4096,
) -> ChatAnthropic:
    """Build a ChatAnthropic client scoped to an organization's BYO key.

    Fallback order: org BYO key -> ANTHROPIC_API_KEY env (dev bootstrap).
    """
    api_key = await _load_org_anthropic_key(organization_id) or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            f"No Anthropic API key available for organization {organization_id}. "
            "Add one via the web UI."
        )
    return ChatAnthropic(model=model, max_tokens=max_tokens, api_key=api_key)
