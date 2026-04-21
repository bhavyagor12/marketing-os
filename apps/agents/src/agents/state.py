from typing import Annotated, Literal, TypedDict

from langgraph.graph.message import add_messages


class BrandContext(TypedDict, total=False):
    organization_id: str
    mission: str | None
    voice_tone: dict | None
    audience_personas: list[dict]
    value_props: list[str]
    relevant_memories: list[str]  # retrieved from pgvector brand_memory


class CampaignBrief(TypedDict, total=False):
    goal: str
    product: str
    audience: str
    platforms: list[str]
    timeline: str | None
    tone_overrides: str | None
    constraints: list[str]


class PlannerState(TypedDict, total=False):
    brief: CampaignBrief
    brand: BrandContext
    research_notes: list[str]
    plan: dict | None
    messages: Annotated[list, add_messages]


class ContentState(TypedDict, total=False):
    plan_item: dict
    brand: BrandContext
    platform: Literal["x", "linkedin", "instagram", "facebook", "email"]
    draft: str | None
    iterations: int
    past_winners: list[dict]  # [{content, metrics_summary}] for auto-iterate
    messages: Annotated[list, add_messages]
