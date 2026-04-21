from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import verify_internal_token
from ..graphs.brand_summarize import run_brand_summarize
from ..graphs.content import content_graph
from ..graphs.image import generate_image
from ..graphs.outreach_personalize import personalize_outreach
from ..graphs.planner import planner_graph
from ..graphs.video import check_video_status, submit_video

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


class OutreachPersonalizeRequest(BaseModel):
    organization_id: str
    lead: dict
    subject_template: str
    body_template: str
    step_order: int = 0
    sender_name: str | None = None


class VideoSubmitRequest(BaseModel):
    organization_id: str
    plan_item: dict | None = None
    script: str | None = None
    avatar_id: str | None = None
    voice_id: str | None = None


class VideoStatusRequest(BaseModel):
    organization_id: str
    video_id: str


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


@router.post("/outreach/personalize")
async def run_outreach_personalize(req: OutreachPersonalizeRequest) -> dict:
    try:
        return await personalize_outreach(
            organization_id=req.organization_id,
            lead=req.lead,
            subject_template=req.subject_template,
            body_template=req.body_template,
            step_order=req.step_order,
            sender_name=req.sender_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/video/submit")
async def run_video_submit(req: VideoSubmitRequest) -> dict:
    try:
        return await submit_video(
            organization_id=req.organization_id,
            plan_item=req.plan_item,
            override_script=req.script,
            avatar_id=req.avatar_id,
            voice_id=req.voice_id,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/video/status")
async def run_video_status(req: VideoStatusRequest) -> dict:
    try:
        return await check_video_status(
            organization_id=req.organization_id, video_id=req.video_id
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
