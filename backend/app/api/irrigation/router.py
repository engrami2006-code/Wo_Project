from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.ai import IrrigationRequest, IrrigationResponse, ScheduleRequest, ScheduleResponse
from app.schemas.common import ERROR_RESPONSES
from app.schemas.farm import IrrigationMethodOut
from app.services import farm_service, irrigation_service

router = APIRouter(prefix="/irrigation", tags=["Smart irrigation"], responses=ERROR_RESPONSES)


@router.get("/methods", response_model=list[IrrigationMethodOut], summary="Irrigation methods with sourced efficiency")
def methods(user: CurrentUser, db: DB) -> list[IrrigationMethodOut]:
    return [IrrigationMethodOut.model_validate(m) for m in farm_service.list_methods(db)]


@router.post("/recommendation", response_model=IrrigationResponse,
             summary="Run the knowledge-based agent for one planting (explainable recommendation)")
def recommendation(req: IrrigationRequest, user: CurrentUser, db: DB, request: Request) -> IrrigationResponse:
    return IrrigationResponse(**irrigation_service.recommend(db, user, req, client_ip(request)))


@router.post("/schedule", response_model=ScheduleResponse,
             summary="Schedule irrigation runs as a CSP (AC-3 + backtracking with MRV/LCV/forward checking)")
def schedule(req: ScheduleRequest, user: CurrentUser, db: DB, request: Request) -> ScheduleResponse:
    return ScheduleResponse(**irrigation_service.schedule(db, user, req, client_ip(request)))
