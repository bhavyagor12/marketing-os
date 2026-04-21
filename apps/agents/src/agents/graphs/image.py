"""Image generation graph.

Flow:
 1. Fetch brand identity + voice + visual assets (colors, fonts).
 2. Use Claude to craft a detailed, brand-aware image prompt from the plan item.
 3. Call OpenAI DALL-E 3 (or fallback model) with that prompt.
 4. Return the signed URL + the final prompt the model used.

The caller (web server action) downloads the image and uploads it to our S3. We don't
persist anything from this graph — it's a pure generator.
"""

from __future__ import annotations

import json

import httpx
import psycopg
from langchain_core.messages import HumanMessage, SystemMessage

from ..clients.anthropic_client import make_anthropic
from ..clients.openai_client import load_openai_key
from ..config import settings

DALLE_URL = "https://api.openai.com/v1/images/generations"
DEFAULT_MODEL = "dall-e-3"
DEFAULT_SIZE = "1024x1024"

PROMPT_SYSTEM = """You are a visual art director. You will be given a social post's plan item
(angle, hook, platform) plus the brand's identity, voice, and visual signals (colors, fonts).
Produce a single detailed image-generation prompt.

Output ONLY the prompt text — no preamble, no quotes, no headings. Requirements:
- Specify the concrete subject and composition in the first sentence.
- Mention style (photography / illustration / 3D / flat / etc.) based on the brand voice.
- Mention color palette using the brand's hex values (e.g., "dominant #1a73e8 with #f5f7fa background").
- Keep it under 250 words.
- Do not add text-in-image unless the brand clearly uses typography in visuals.
- Don't describe any person by protected attributes; describe role/action instead.
"""


async def _load_brand_visual_context(organization_id: str) -> dict:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT identity, voice
                FROM brand_profiles
                WHERE organization_id = %s
                LIMIT 1
                """,
                (organization_id,),
            )
            profile_row = await cur.fetchone()

            await cur.execute(
                """
                SELECT kind, hex, font_family
                FROM brand_assets
                WHERE organization_id = %s AND kind IN ('color', 'font')
                ORDER BY prominence DESC
                LIMIT 20
                """,
                (organization_id,),
            )
            asset_rows = await cur.fetchall()

    identity, voice = (profile_row or (None, None))
    colors = [r[1] for r in asset_rows if r[0] == "color" and r[1]]
    fonts = [r[2] for r in asset_rows if r[0] == "font" and r[2]]
    return {
        "identity": identity,
        "voice": voice,
        "colors": colors[:8],
        "fonts": fonts[:4],
    }


async def craft_image_prompt(
    *,
    organization_id: str,
    plan_item: dict,
    override_prompt: str | None = None,
) -> str:
    if override_prompt and override_prompt.strip():
        return override_prompt.strip()

    visual = await _load_brand_visual_context(organization_id)
    model = await make_anthropic(
        organization_id=organization_id,
        model="claude-sonnet-4-6",
        max_tokens=512,
    )
    user = (
        f"Plan item:\n{json.dumps(plan_item, indent=2)}\n\n"
        f"Brand visual context:\n{json.dumps(visual, indent=2, default=str)}"
    )
    resp = await model.ainvoke(
        [SystemMessage(content=PROMPT_SYSTEM), HumanMessage(content=user)]
    )
    prompt = resp.content if isinstance(resp.content, str) else str(resp.content)
    return prompt.strip()


async def generate_image(
    *,
    organization_id: str,
    plan_item: dict | None,
    prompt_override: str | None = None,
    size: str = DEFAULT_SIZE,
) -> dict:
    api_key = await load_openai_key(organization_id)
    if not api_key:
        raise RuntimeError(
            "No OpenAI API key available. Add one via Connections or set OPENAI_API_KEY."
        )

    prompt = await craft_image_prompt(
        organization_id=organization_id,
        plan_item=plan_item or {},
        override_prompt=prompt_override,
    )

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            DALLE_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEFAULT_MODEL,
                "prompt": prompt,
                "size": size,
                "quality": "standard",
                "n": 1,
                "response_format": "url",
            },
        )
        if resp.status_code != 200:
            detail = resp.json().get("error", {}).get("message", resp.text[:200])
            raise RuntimeError(f"OpenAI images {resp.status_code}: {detail}")
        data = resp.json()

    item = (data.get("data") or [{}])[0]
    url = item.get("url")
    if not url:
        raise RuntimeError("OpenAI image response had no url")

    return {
        "image_url": url,
        "prompt_used": prompt,
        "revised_prompt": item.get("revised_prompt"),
        "model": DEFAULT_MODEL,
        "size": size,
    }
