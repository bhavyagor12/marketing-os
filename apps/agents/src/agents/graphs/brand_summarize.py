from __future__ import annotations

import json

import psycopg
from langchain_core.messages import HumanMessage, SystemMessage

from ..clients.anthropic_client import make_anthropic
from ..config import settings

SYSTEM_PROMPT = """You are a brand strategist. Given an organization's own content
(website copy, brand docs, PDFs), distill a complete brand profile across five pillars:
Identity, Audience, Offering, Expression, and Positioning.

Output ONLY valid JSON with this exact shape — no prose, no markdown fences:

{
  "identity": {
    "tradingName": string,
    "tagline": string,
    "mission": string,
    "vision": string,
    "foundingStory": string,
    "foundedYear": number,
    "category": string,
    "subCategory": string,
    "stage": "idea"|"pre-seed"|"seed"|"series-a"|"series-b-plus"|"profitable"|"public",
    "hqLocation": string,
    "markets": string[]
  },

  "positioning": {
    "category": string,
    "categoryPosition": string,
    "pointOfView": string,
    "uniqueInsight": string,
    "differentiators": string[],
    "elevatorPitch": string
  },

  "voice": {
    "attributes": string[],
    "avoid": string[],
    "signaturePhrases": string[],
    "lexicon": [{"preferred": string, "instead_of": string}],
    "pointOfView": "we"|"brand-as-entity"|"founder-first"|"customer-first",
    "styleNotes": string,
    "examples": [{"label": string, "text": string}]
  },

  "strategy": {
    "currentPriorities": string[],
    "growthAudiences": string[],
    "focusChannels": string[],
    "upcomingLaunches": string[]
  },

  "constraints": {
    "bannedPhrases": string[],
    "requiredDisclosures": string[],
    "compliance": string[],
    "trademarkedTerms": string[],
    "languages": string[]
  },

  "personas": [
    {
      "name": string,
      "description": string,
      "jobsToBeDone": string[],
      "painPoints": string[],
      "demographics": {"ageRange": string, "role": string, "industry": string},
      "psychographics": {"motivations": string, "values": string},
      "channels": string[],
      "buyingTriggers": string[],
      "objections": string[]
    }
  ],

  "valuePropositions": [
    {
      "title": string,
      "description": string,
      "proof": string[],
      "forPersona": string
    }
  ],

  "products": [
    {
      "name": string,
      "productType": "product"|"service"|"platform"|"feature",
      "description": string,
      "useCases": string[],
      "featuresBenefits": [{"feature": string, "benefit": string}],
      "pricingModel": string,
      "url": string
    }
  ],

  "competitors": [
    {
      "name": string,
      "website": string,
      "competitorType": "direct"|"indirect"|"alternative",
      "howWeDiffer": string,
      "threatLevel": "low"|"medium"|"high"
    }
  ]
}

RULES:
- Infer strictly from the content provided. Do not invent details (founding year, pricing,
  customer names) that aren't in the material. Leave fields as empty strings or empty arrays
  when unknown — never fabricate.
- Keep each string concise and useful (one sentence unless it's a description).
- personas: 1-4 entries. valuePropositions: 3-7 entries. products: as many as mentioned.
  competitors: 0-8 only if explicitly named.
- voice.attributes: 5-10 sharp adjectives, not generic ones ("confident" > "good").
- voice.avoid: things the content never does — copywriter clichés, hype words, etc.
- voice.signaturePhrases: verbatim phrases the content uses repeatedly, if any.
- voice.examples: 1-3 short actual lines pulled from the content that exemplify the voice.
"""

MAX_CHUNKS = 80
MAX_CHARS_PER_CHUNK = 1400


async def _load_brand_chunks(organization_id: str) -> list[str]:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT content
                FROM brand_memory
                WHERE organization_id = %s
                ORDER BY created_at DESC, chunk_index ASC
                LIMIT %s
                """,
                (organization_id, MAX_CHUNKS),
            )
            rows = await cur.fetchall()
    return [r[0][:MAX_CHARS_PER_CHUNK] for r in rows]


async def _load_visual_summary(organization_id: str) -> str:
    """A compact textual summary of visual assets so Claude can mention visual identity."""
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT kind, hex, font_family, alt
                FROM brand_assets
                WHERE organization_id = %s
                ORDER BY prominence DESC
                LIMIT 40
                """,
                (organization_id,),
            )
            rows = await cur.fetchall()

    colors = sorted({r[1] for r in rows if r[0] == "color" and r[1]})
    fonts = sorted({r[2] for r in rows if r[0] == "font" and r[2]})
    image_alts = [r[3] for r in rows if r[0] in ("logo", "og_image") and r[3]]
    if not colors and not fonts and not image_alts:
        return ""
    parts: list[str] = []
    if colors:
        parts.append(f"Palette: {', '.join(colors[:10])}")
    if fonts:
        parts.append(f"Typography: {', '.join(fonts[:6])}")
    if image_alts:
        parts.append(f"Prominent imagery described as: {'; '.join(image_alts[:5])}")
    return "\n".join(parts)


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
        raise ValueError(f"model output is not JSON: {text[:200]!r}")
    return json.loads(t[start : end + 1])


async def run_brand_summarize(organization_id: str) -> dict:
    chunks = await _load_brand_chunks(organization_id)
    if not chunks:
        raise ValueError("no brand_memory chunks found — ingest sources first")

    visual_summary = await _load_visual_summary(organization_id)

    model = await make_anthropic(
        organization_id=organization_id, model="claude-opus-4-7", max_tokens=4096
    )

    corpus = "\n\n---\n\n".join(chunks)
    user_content_parts = [
        f"Here are {len(chunks)} content snippets from this organization's own materials:",
        "",
        corpus,
    ]
    if visual_summary:
        user_content_parts.extend(["", "Visual identity signals:", visual_summary])
    user_content_parts.extend(["", "Produce the full brand profile JSON now."])

    resp = await model.ainvoke(
        [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content="\n".join(user_content_parts)),
        ]
    )
    raw = resp.content if isinstance(resp.content, str) else str(resp.content)
    profile = _extract_json(raw)
    return profile
