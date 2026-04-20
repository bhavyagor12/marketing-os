from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import verify_internal_token
from ..graphs.content import content_graph
from ..graphs.planner import planner_graph

router = APIRouter(dependencies=[Depends(verify_internal_token)])


class PlannerRunRequest(BaseModel):
    organization_id: str
    brief: dict
    brand: dict | None = None


class ContentRunRequest(BaseModel):
    organization_id: str
    plan_item: dict
    platform: str
    brand: dict | None = None


@router.post("/planner/run")
async def run_planner(req: PlannerRunRequest) -> dict:
    state = {
        "brief": req.brief,
        "brand": {**(req.brand or {}), "organization_id": req.organization_id},
        "research_notes": [],
        "messages": [],
    }
    result = await planner_graph.ainvoke(state)
    return {"plan": result.get("plan")}


@router.post("/content/run")
async def run_content(req: ContentRunRequest) -> dict:
    state = {
        "plan_item": req.plan_item,
        "brand": {**(req.brand or {}), "organization_id": req.organization_id},
        "platform": req.platform,
        "iterations": 0,
        "messages": [],
    }
    result = await content_graph.ainvoke(state)
    return {"draft": result.get("draft")}
