from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from ..clients.anthropic_client import make_anthropic
from ..state import ContentState

SYSTEM_PROMPT = """You are a staff marketing writer. You draft concrete posts that fit a specific
platform's norms (length, tone, formatting) while staying strictly on-brand.

Rules:
- Match voice_tone.attributes; never use words in voice_tone.avoid.
- Platform conventions:
  - x: <=280 chars per item; use a strong hook in the first line.
  - linkedin: 1-3 short paragraphs, conversational, no hashtag spam.
  - instagram: caption forward, 3-6 short lines, emoji sparingly.
  - email: clear subject, scannable body, one CTA.
- Output plain text only (no markdown headings) unless the platform is email.
"""


async def draft_node(state: ContentState) -> dict:
    brand = state.get("brand", {})
    org_id = brand.get("organization_id")
    if not org_id:
        raise ValueError("content graph requires brand.organization_id for BYO key resolution")

    model = await make_anthropic(organization_id=org_id, model="claude-sonnet-4-6")
    plan_item = state.get("plan_item", {})
    platform = state.get("platform", "x")

    user_content = (
        f"Platform: {platform}\n"
        f"Plan item:\n{plan_item}\n\n"
        f"Brand context:\n{brand}\n\n"
        "Draft the post. Output the text only, no commentary."
    )
    resp = await model.ainvoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_content)]
    )
    return {"draft": resp.content, "iterations": state.get("iterations", 0) + 1}


def build_content():
    g: StateGraph = StateGraph(ContentState)
    g.add_node("draft", draft_node)
    g.add_edge(START, "draft")
    g.add_edge("draft", END)
    return g.compile()


content_graph = build_content()
