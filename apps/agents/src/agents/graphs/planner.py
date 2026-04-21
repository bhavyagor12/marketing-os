from __future__ import annotations

import json

import psycopg
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from ..clients.anthropic_client import make_anthropic
from ..config import settings
from ..retrieval import retrieve_brand_chunks
from ..state import PlannerState

SYSTEM_PROMPT = """You are a senior marketing strategist. Given a campaign brief and the
organization's brand profile, produce a structured campaign plan.

Output ONLY valid JSON with this exact shape — no prose, no markdown fences:
{
  "title": string,
  "objective": string,
  "channels": ("x" | "linkedin" | "instagram" | "facebook" | "email")[],
  "posts": [
    {
      "platform": "x" | "linkedin" | "instagram" | "facebook" | "email",
      "contentType": "text_post" | "thread" | "image" | "video" | "email" | "carousel",
      "angle": string,
      "hook": string,
      "cta": string,
      "scheduledDayOffset": number
    }
  ],
  "kpis": string[]
}

Rules:
- 5-12 posts spanning the requested channels. Diversify angles; don't repeat hooks.
- Stay on-brand: honor voice.attributes, avoid voice.avoid, reuse signature phrases where natural.
- scheduledDayOffset is an integer 0..14 — a suggested day offset from launch.
- Output the JSON only.
"""


async def _load_brand_context(organization_id: str) -> dict:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT identity, positioning, voice, strategy, constraints
                FROM brand_profiles
                WHERE organization_id = %s
                LIMIT 1
                """,
                (organization_id,),
            )
            row = await cur.fetchone()
    if row is None:
        return {}
    identity, positioning, voice, strategy, constraints = row
    return {
        "identity": identity,
        "positioning": positioning,
        "voice": voice,
        "strategy": strategy,
        "constraints": constraints,
    }


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


async def plan_node(state: PlannerState) -> dict:
    brand = state.get("brand", {})
    brief = state.get("brief", {})
    org_id = brand.get("organization_id")
    if not org_id:
        raise ValueError("planner requires brand.organization_id")

    brand_context = await _load_brand_context(org_id)

    retrieval_query = " | ".join(
        filter(None, [brief.get("goal"), brief.get("product"), brief.get("audience")])
    ) or "brand strategy"
    relevant_chunks = await retrieve_brand_chunks(
        organization_id=org_id, query=retrieval_query, k=8
    )

    model = await make_anthropic(
        organization_id=org_id, model="claude-opus-4-7", max_tokens=3072
    )

    parts = [
        f"Brief:\n{json.dumps(brief, indent=2)}",
        f"Brand context:\n{json.dumps(brand_context, indent=2, default=str)}",
    ]
    if relevant_chunks:
        corpus = "\n\n---\n\n".join(c[:1200] for c in relevant_chunks)
        parts.append(f"Retrieved brand corpus snippets:\n{corpus}")
    parts.append("Produce the campaign plan JSON now.")
    user_content = "\n\n".join(parts)
    resp = await model.ainvoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_content)]
    )
    raw = resp.content if isinstance(resp.content, str) else str(resp.content)
    plan = _extract_json(raw)
    return {"plan": plan}


def build_planner():
    g: StateGraph = StateGraph(PlannerState)
    g.add_node("plan", plan_node)
    g.add_edge(START, "plan")
    g.add_edge("plan", END)
    return g.compile()


planner_graph = build_planner()
