"""Personalization agent for outreach sequences.

Takes a step template (subject + body) and a lead, returns a filled subject and body that
reads naturally. The template may use {{firstName}}/{{company}}/etc. variables as hints, or
be plain English instructions — the agent reads the lead's context (name/title/company/tags/
custom fields) and the brand's voice to produce something that doesn't feel templated.
"""

from __future__ import annotations

import json
import re

import psycopg
from langchain_core.messages import HumanMessage, SystemMessage

from ..clients.anthropic_client import make_anthropic
from ..config import settings
from ..retrieval import retrieve_brand_chunks

SYSTEM_PROMPT = """You are a senior outbound SDR. Your job: personalize a cold-email step
using the lead's real context and the brand's voice. The email must feel 1:1, not blasted.

Rules:
- Output strict JSON: {"subject": string, "body": string}. Nothing else.
- Honor the template's intent and structure, but rewrite phrasing to flow naturally with
  the lead's name, title, company, tags, and any custom fields that are relevant.
- If the template uses {{firstName}}/{{company}}/etc., resolve those; otherwise use the lead
  context you were given.
- Keep the subject under 70 characters, preferably under 50.
- Keep the body under 140 words for the first step, under 90 words for follow-ups.
- Never invent facts about the lead. If a detail isn't present, drop the reference rather
  than guessing.
- Match the brand's voice.attributes; avoid anything in voice.avoid.
- Sign off consistent with the brand's pointOfView (e.g., "we" vs founder-first).
- Do NOT wrap URLs in extra punctuation — the worker wraps them for tracking.
"""


async def _load_brand(organization_id: str) -> dict:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT identity, positioning, voice
                FROM brand_profiles
                WHERE organization_id = %s
                LIMIT 1
                """,
                (organization_id,),
            )
            row = await cur.fetchone()
    if not row:
        return {}
    identity, positioning, voice = row
    return {"identity": identity, "positioning": positioning, "voice": voice}


def _extract_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.lower().startswith("json"):
            t = t[4:]
        t = t.strip()
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"personalization agent output is not JSON: {text[:200]!r}")
    return json.loads(t[start : end + 1])


def _preprocess_variables(template: str, lead: dict) -> str:
    """Lightly pre-resolve {{var}} placeholders with lead fields. The agent still gets to
    make the prose feel natural; this just saves it from guessing for trivial substitutions."""
    repls = {
        "firstName": str(lead.get("first_name") or "").strip(),
        "lastName": str(lead.get("last_name") or "").strip(),
        "fullName": str(lead.get("full_name") or "").strip(),
        "company": str(lead.get("company") or "").strip(),
        "title": str(lead.get("title") or "").strip(),
        "email": str(lead.get("email") or "").strip(),
    }
    for k, v in repls.items():
        template = re.sub(r"\{\{\s*" + re.escape(k) + r"\s*\}\}", v, template)
    return template


async def personalize_outreach(
    *,
    organization_id: str,
    lead: dict,
    subject_template: str,
    body_template: str,
    step_order: int,
    sender_name: str | None = None,
) -> dict:
    brand = await _load_brand(organization_id)

    pre_subject = _preprocess_variables(subject_template, lead)
    pre_body = _preprocess_variables(body_template, lead)

    # Retrieve brand snippets that might inform tone/positioning for this lead's context.
    retrieval_query = " | ".join(
        filter(None, [lead.get("company"), lead.get("title"), subject_template])
    )[:500] or "brand voice"
    relevant = await retrieve_brand_chunks(
        organization_id=organization_id, query=retrieval_query, k=4
    )

    model = await make_anthropic(
        organization_id=organization_id,
        model="claude-sonnet-4-6",
        max_tokens=1200,
    )

    user_parts = [
        f"Step order: {step_order} ({'first touch' if step_order == 0 else 'follow-up'})",
        f"Lead context:\n{json.dumps(lead, indent=2, default=str)}",
        f"Brand context:\n{json.dumps(brand, indent=2, default=str)}",
        f"Subject template (pre-filled):\n{pre_subject}",
        f"Body template (pre-filled):\n{pre_body}",
    ]
    if sender_name:
        user_parts.append(f"Send from: {sender_name}")
    if relevant:
        corpus = "\n\n---\n\n".join(c[:900] for c in relevant)
        user_parts.append(f"Relevant brand snippets:\n{corpus}")
    user_parts.append("Produce the final subject + body JSON.")

    resp = await model.ainvoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content="\n\n".join(user_parts))]
    )
    raw = resp.content if isinstance(resp.content, str) else str(resp.content)
    out = _extract_json(raw)
    return {
        "subject": str(out.get("subject", "")).strip()[:200],
        "body": str(out.get("body", "")).strip(),
    }
