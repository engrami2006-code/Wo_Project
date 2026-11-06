from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Request

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.common import ERROR_RESPONSES, Page
from app.schemas.land import LandRequest, LandResponse
from app.services import land_service

router = APIRouter(prefix="/land-distribution", tags=["Land distribution (search)"], responses=ERROR_RESPONSES)


@router.post("/optimize", response_model=LandResponse,
             summary="A* search for the allocation (with BFS / UCS / Greedy comparison)")
def optimize(req: LandRequest, user: CurrentUser, db: DB, request: Request) -> LandResponse:
    return LandResponse(**land_service.optimize(db, user, req, client_ip(request)))


@router.get("/requests", response_model=Page[dict[str, Any]], summary="Previous optimisation requests")
def requests(user: CurrentUser, db: DB, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)) -> Page[dict[str, Any]]:
    items, total = land_service.list_requests(db, user, page, size)
    return Page[dict[str, Any]](items=items, total=total, page=page, size=size)


@router.get("/requests/{request_id}", response_model=dict[str, Any], summary="One request with its result")
def get_request(request_id: uuid.UUID, user: CurrentUser, db: DB) -> dict[str, Any]:
    return land_service.get_request(db, user, request_id)
