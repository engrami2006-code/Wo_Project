from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Request, status

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.common import ERROR_RESPONSES
from app.schemas.farm import CropCreate, CropOut
from app.services import farm_service

router = APIRouter(prefix="/crops", tags=["Crops (FAO-56 reference)"], responses=ERROR_RESPONSES)


def _out(c) -> CropOut:  # type: ignore[no-untyped-def]
    out = CropOut.model_validate(c)
    out.season_length_days = c.season_length_days
    return out


@router.get("", response_model=list[CropOut], summary="Reference crops plus your custom crops")
def list_crops(user: CurrentUser, db: DB, search: str | None = Query(None, max_length=100)) -> list[CropOut]:
    return [_out(c) for c in farm_service.list_crops(db, user, search)]


@router.post("", response_model=CropOut, status_code=status.HTTP_201_CREATED,
             summary="Add a custom crop (coefficients must cite a source)")
def create_crop(data: CropCreate, user: CurrentUser, db: DB, request: Request) -> CropOut:
    return _out(farm_service.create_crop(db, user, data, client_ip(request)))


@router.get("/{crop_id}", response_model=CropOut, summary="Get a crop")
def get_crop(crop_id: uuid.UUID, user: CurrentUser, db: DB) -> CropOut:
    return _out(farm_service.get_crop(db, user, crop_id))
