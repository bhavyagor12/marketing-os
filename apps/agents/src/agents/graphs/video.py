"""HeyGen video generation.

Two-phase flow (because HeyGen renders take 1-5+ minutes):
  1. `craft_video_script` + `submit_video`  — Claude writes a script from the plan item +
     brand; we POST /v2/video/generate to HeyGen and return the video_id.
  2. `check_video_status` — web/worker polls HeyGen `/v1/video_status.get`, returns URL when
     ready.

The caller (worker job) owns the polling loop and downloads the final MP4 for S3 upload.
"""

from __future__ import annotations

import json
import os

import httpx
import psycopg
from langchain_core.messages import HumanMessage, SystemMessage

from ..clients.anthropic_client import make_anthropic
from ..clients.heygen_client import load_heygen_key
from ..config import settings

SCRIPT_SYSTEM = """You are a video scriptwriter for social media.

Given a plan item (platform, angle, hook, CTA) and the brand's voice, write a short, punchy
video script. Output ONLY the spoken words — no scene directions, no stage notes, no labels.

Constraints:
- 60-120 words.
- One continuous monologue, no multiple speakers.
- Start with a hook in the first line.
- Match voice.attributes; avoid voice.avoid.
- End with a clear call to action (but don't sound like a billboard).
"""

HEYGEN_GENERATE = "https://api.heygen.com/v2/video/generate"
HEYGEN_STATUS = "https://api.heygen.com/v1/video_status.get"

# Defaults — can be overridden per request. Pick recognizable free-tier-friendly options.
DEFAULT_AVATAR_ID = os.environ.get("HEYGEN_DEFAULT_AVATAR_ID", "Daisy-inskirt-20220818")
DEFAULT_VOICE_ID = os.environ.get("HEYGEN_DEFAULT_VOICE_ID", "1bd001e7e50f421d891986aad5158bc8")


async def _load_brand(organization_id: str) -> dict:
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
            row = await cur.fetchone()
    return {"identity": row[0] if row else None, "voice": row[1] if row else None}


async def craft_video_script(
    *,
    organization_id: str,
    plan_item: dict,
    override_script: str | None = None,
) -> str:
    if override_script and override_script.strip():
        return override_script.strip()

    brand = await _load_brand(organization_id)
    model = await make_anthropic(
        organization_id=organization_id, model="claude-sonnet-4-6", max_tokens=600
    )
    user = (
        f"Plan item:\n{json.dumps(plan_item, indent=2)}\n\n"
        f"Brand context:\n{json.dumps(brand, indent=2, default=str)}"
    )
    resp = await model.ainvoke(
        [SystemMessage(content=SCRIPT_SYSTEM), HumanMessage(content=user)]
    )
    text = resp.content if isinstance(resp.content, str) else str(resp.content)
    return text.strip()


async def submit_video(
    *,
    organization_id: str,
    plan_item: dict | None,
    override_script: str | None,
    avatar_id: str | None = None,
    voice_id: str | None = None,
) -> dict:
    api_key = await load_heygen_key(organization_id)
    if not api_key:
        raise RuntimeError(
            "No HeyGen API key available. Add one via Connections or set HEYGEN_API_KEY."
        )

    script = await craft_video_script(
        organization_id=organization_id,
        plan_item=plan_item or {},
        override_script=override_script,
    )

    body = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": avatar_id or DEFAULT_AVATAR_ID,
                    "avatar_style": "normal",
                },
                "voice": {
                    "type": "text",
                    "input_text": script,
                    "voice_id": voice_id or DEFAULT_VOICE_ID,
                },
            }
        ],
        "dimension": {"width": 1280, "height": 720},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            HEYGEN_GENERATE,
            headers={"X-Api-Key": api_key, "Content-Type": "application/json"},
            json=body,
        )
        if resp.status_code != 200:
            detail = resp.text[:300]
            raise RuntimeError(f"HeyGen generate {resp.status_code}: {detail}")
        data = resp.json()

    video_id = (data.get("data") or {}).get("video_id")
    if not video_id:
        raise RuntimeError(f"HeyGen response missing video_id: {data}")
    return {"video_id": video_id, "script": script}


async def check_video_status(
    *, organization_id: str, video_id: str
) -> dict:
    api_key = await load_heygen_key(organization_id)
    if not api_key:
        raise RuntimeError("No HeyGen API key available.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            HEYGEN_STATUS,
            headers={"X-Api-Key": api_key},
            params={"video_id": video_id},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"HeyGen status {resp.status_code}: {resp.text[:200]}")
        data = resp.json().get("data") or {}

    # HeyGen status values: pending, processing, completed, failed
    return {
        "status": data.get("status"),
        "video_url": data.get("video_url"),
        "thumbnail_url": data.get("thumbnail_url"),
        "duration": data.get("duration"),
        "error": data.get("error"),
    }
