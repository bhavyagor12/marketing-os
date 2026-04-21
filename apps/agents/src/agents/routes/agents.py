from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import verify_internal_token
from ..graphs.brand_summarize import run_brand_summarize
from ..graphs.content import content_graph
from ..graphs.image import generate_image
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
    past_winners: list[dict] | None = None


class BrandSummarizeRequest(BaseModel):
    organization_id: str


class ImageGenerateRequest(BaseModel):
    organization_id: str
    plan_item: dict | None = None
    prompt: str | None = None
    size: str = "1024x1024"


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
        "past_winners": req.past_winners or [],
        "messages": [],
    }
    result = await content_graph.ainvoke(state)
    return {"draft": result.get("draft")}


@router.post("/brand_summarize/run")
async def run_brand_summarize_route(req: BrandSummarizeRequest) -> dict:
    try:
        profile = await run_brand_summarize(req.organization_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"profile": profile}


@router.post("/image/generate")
async def run_image_generate(req: ImageGenerateRequest) -> dict:
    try:
        result = await generate_image(
            organization_id=req.organization_id,
            plan_item=req.plan_item,
            prompt_override=req.prompt,
            size=req.size,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return result
