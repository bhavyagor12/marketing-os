from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from ..clients.anthropic_client import make_anthropic
from ..state import PlannerState

SYSTEM_PROMPT = """You are a senior marketing strategist building a campaign plan.
You have access to the brand's voice, audience personas, and research notes.

Output a JSON object with this exact shape:
{
  "title": string,
  "objective": string,
  "channels": string[],       // platforms to post on
  "posts": [                  // every concrete piece of content to create
    {
      "platform": "x" | "linkedin" | "instagram" | "facebook" | "email",
      "contentType": "text_post" | "thread" | "image" | "video" | "email" | "carousel",
      "angle": string,
      "hook": string,
      "cta": string?,
      "scheduledDayOffset": number?
    }
  ],
  "kpis": string[]
}

Rules:
- Stay on-brand — honor voice_tone.attributes and avoid voice_tone.avoid.
- Diversify angles across posts; do not repeat hooks.
- Output ONLY the JSON, no prose.
"""


async def research_node(state: PlannerState) -> dict:
    """Skeleton — will pull from brand_memory pgvector retrieval in a later pass."""
    return {"research_notes": state.get("research_notes", [])}


async def plan_node(state: PlannerState) -> dict:
    brand = state.get("brand", {})
    brief = state.get("brief", {})
    org_id = brand.get("organization_id")
    if not org_id:
        raise ValueError("planner requires brand.organization_id for BYO key resolution")

    model = await make_anthropic(organization_id=org_id, model="claude-opus-4-7")
    user_content = (
        f"Brief:\n{brief}\n\n"
        f"Brand context:\n{brand}\n\n"
        f"Research notes:\n{state.get('research_notes', [])}\n\n"
        "Produce the campaign plan JSON now."
    )
    resp = await model.ainvoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_content)]
    )
    return {"plan": {"raw": resp.content}}


def build_planner():
    g: StateGraph = StateGraph(PlannerState)
    g.add_node("research", research_node)
    g.add_node("plan", plan_node)
    g.add_edge(START, "research")
    g.add_edge("research", "plan")
    g.add_edge("plan", END)
    return g.compile()


planner_graph = build_planner()
