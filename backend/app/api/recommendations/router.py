from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Request

from app.core.deps import DB, CurrentUser, client_ip
from app.core.errors import NotFoundError
from app.models import Recommendation
from app.schemas.ai import RecommendationOut, RecommendationStatusUpdate
from app.schemas.common import ERROR_RESPONSES, Page
from app.services import irrigation_service
from app.services.access import Perm, get_farm
from app.services.audit import audit

router = APIRouter(prefix="/recommendations", tags=["Recommendations"], responses=ERROR_RESPONSES)


@router.get("", response_model=Page[RecommendationOut], summary="Recommendation history (without payload)")
def list_recs(user: CurrentUser, db: DB, farm_id: uuid.UUID | None = None, kind: str | None = None,
              page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)) -> Page[RecommendationOut]:
    items, total = irrigation_service.list_recommendations(db, user, farm_id, kind, page, size)
    out = []
    for r in items:
        o = RecommendationOut.model_validate(r)
        o.payload = None
        out.append(o)
    return Page[RecommendationOut](items=out, total=total, page=page, size=size)


def _get(db, user, rec_id: uuid.UUID, perm: Perm = Perm.FARM_READ) -> Recommendation:  # type: ignore[no-untyped-def]
    rec = db.get(Recommendation, rec_id)
    if rec is None:
        raise NotFoundError("Recommendation not found.")
    get_farm(db, user, rec.farm_id, perm)
    return rec


@router.get("/{rec_id}", response_model=RecommendationOut, summary="Recommendation with full explanation")
def get_rec(rec_id: uuid.UUID, user: CurrentUser, db: DB) -> RecommendationOut:
    return RecommendationOut.model_validate(_get(db, user, rec_id))


@router.patch("/{rec_id}", response_model=RecommendationOut, summary="Accept or dismiss a recommendation")
def update_rec(rec_id: uuid.UUID, data: RecommendationStatusUpdate, user: CurrentUser, db: DB,
               request: Request) -> RecommendationOut:
    rec = _get(db, user, rec_id, Perm.RECORD_CREATE)
    rec.status = data.status
    audit(db, user, "recommendation.status", "recommendation", rec.id, {"status": data.status.value}, client_ip(request))
    db.commit()
    return RecommendationOut.model_validate(rec)
