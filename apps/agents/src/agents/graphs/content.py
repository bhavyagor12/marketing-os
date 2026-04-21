from __future__ import annotations

import json

import psycopg
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from ..clients.anthropic_client import make_anthropic
from ..config import settings
from ..retrieval import retrieve_brand_chunks
from ..state import ContentState

SYSTEM_PROMPT = """You are a staff marketing writer. You draft concrete posts that fit a
specific platform's conventions (length, tone, formatting) while staying strictly on-brand.

Platform conventions:
- x: <=280 chars per tweet; strong hook in the first line; plain text, no markdown.
- linkedin: 1-3 short paragraphs, conversational, no hashtag spam; plain text with line breaks.
- instagram: caption-first, 3-6 short lines, emoji sparingly; plain text.
- facebook: 2-4 short paragraphs; plain text.
- email: structured — start the output with a single line "Subject: <subject>" then a blank line,
  then the body in markdown. A clear CTA near the end.

Content-type nuances:
- thread (x): output multiple tweets separated by a blank line. Each <=280 chars.
- text_post (x/linkedin/facebook/instagram): one piece.
- email: follow the email convention above.
- article (long-form blog post): start with a single "# Title" on the first line, then a
  blank line, then the body in markdown with ## subheadings, 800-1500 words, conversational
  but substantive, no fluff or listicle padding. End with a clear next step.

Always:
- Match voice.attributes; never use words in voice.avoid.
- Use signature phrases naturally if they fit.
- Honor constraints.bannedPhrases strictly.
- Output ONLY the drafted content — no explanation, no title, no preamble.
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


async def draft_node(state: ContentState) -> dict:
    brand = state.get("brand", {})
    org_id = brand.get("organization_id")
    if not org_id:
        raise ValueError("content graph requires brand.organization_id")

    brand_context = await _load_brand_context(org_id)
    plan_item = state.get("plan_item", {})
    platform = state.get("platform", plan_item.get("platform", "x"))
    content_type = plan_item.get("contentType", "text_post")

    retrieval_query = " | ".join(
        filter(
            None,
            [plan_item.get("angle"), plan_item.get("hook"), plan_item.get("cta")],
        )
    ) or "brand voice examples"
    relevant_chunks = await retrieve_brand_chunks(
        organization_id=org_id, query=retrieval_query, k=6
    )

    max_tokens = 4096 if content_type == "article" else 2048
    model = await make_anthropic(
        organization_id=org_id, model="claude-sonnet-4-6", max_tokens=max_tokens
    )

    past_winners = state.get("past_winners") or []

    parts = [
        f"Platform: {platform}",
        f"Content type: {content_type}",
        f"Plan item:\n{json.dumps(plan_item, indent=2)}",
        f"Brand context:\n{json.dumps(brand_context, indent=2, default=str)}",
    ]
    if relevant_chunks:
        corpus = "\n\n---\n\n".join(c[:1000] for c in relevant_chunks)
        parts.append(f"Relevant brand corpus snippets:\n{corpus}")
    if past_winners:
        winners_text = "\n\n".join(
            f"[{w.get('metrics_summary', 'prior version')}]\n{w.get('content', '')[:1500]}"
            for w in past_winners
        )
        parts.append(
            "Past drafts that performed well — study them as positive examples, but write something NEW and stronger (different hook, fresher angle). Do not copy:\n\n"
            + winners_text
        )
    parts.append("Draft the content now.")
    user_content = "\n\n".join(parts)
    resp = await model.ainvoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_content)]
    )
    draft = resp.content if isinstance(resp.content, str) else str(resp.content)
    return {"draft": draft, "iterations": state.get("iterations", 0) + 1}


def build_content():
    g: StateGraph = StateGraph(ContentState)
    g.add_node("draft", draft_node)
    g.add_edge(START, "draft")
    g.add_edge("draft", END)
    return g.compile()


content_graph = build_content()
