from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Request, Response, status

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.common import ERROR_RESPONSES, Message, Page
from app.schemas.farm import (
    FarmCreate,
    FarmOut,
    FarmSummary,
    FarmUpdate,
    MemberCreate,
    MemberOut,
    PlantingCreate,
    PlantingOut,
    PlantingUpdate,
)
from app.services import farm_service
from app.services.access import get_farm

router = APIRouter(tags=["Farms & plantings"], responses=ERROR_RESPONSES)


@router.get("/farms", response_model=Page[FarmSummary], summary="Farms visible to you")
def list_farms(user: CurrentUser, db: DB, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=200),
               search: str | None = Query(None, max_length=100)) -> Page[FarmSummary]:
    items, total = farm_service.list_farms(db, user, page, size, search)
    return Page[FarmSummary](items=[FarmSummary.model_validate(i) for i in items], total=total, page=page, size=size)


@router.post("/farms", response_model=FarmOut, status_code=status.HTTP_201_CREATED, summary="Create a farm")
def create_farm(data: FarmCreate, user: CurrentUser, db: DB, request: Request) -> FarmOut:
    return FarmOut.model_validate(farm_service.create_farm(db, user, data, client_ip(request)))


@router.get("/farms/{farm_id}", response_model=FarmOut, summary="Get a farm")
def get_one(farm_id: uuid.UUID, user: CurrentUser, db: DB) -> FarmOut:
    return FarmOut.model_validate(get_farm(db, user, farm_id))


@router.patch("/farms/{farm_id}", response_model=FarmOut, summary="Update a farm")
def update_farm(farm_id: uuid.UUID, data: FarmUpdate, user: CurrentUser, db: DB, request: Request) -> FarmOut:
    return FarmOut.model_validate(farm_service.update_farm(db, user, farm_id, data, client_ip(request)))


@router.delete("/farms/{farm_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a farm and its data")
def delete_farm(farm_id: uuid.UUID, user: CurrentUser, db: DB, request: Request) -> Response:
    farm_service.delete_farm(db, user, farm_id, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/farms/{farm_id}/members", response_model=list[MemberOut], summary="Users assigned to a farm")
def members(farm_id: uuid.UUID, user: CurrentUser, db: DB) -> list[MemberOut]:
    return [MemberOut(**m) for m in farm_service.list_members(db, user, farm_id)]


@router.post("/farms/{farm_id}/members", response_model=Message, status_code=status.HTTP_201_CREATED,
             summary="Assign a farm manager / employee to a farm")
def add_member(farm_id: uuid.UUID, data: MemberCreate, user: CurrentUser, db: DB, request: Request) -> Message:
    farm_service.add_member(db, user, farm_id, data.user_id, client_ip(request))
    return Message(message="Member assigned.")


@router.delete("/farms/{farm_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remove a farm assignment")
def remove_member(farm_id: uuid.UUID, member_id: uuid.UUID, user: CurrentUser, db: DB, request: Request) -> Response:
    farm_service.remove_member(db, user, farm_id, member_id, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/farms/{farm_id}/crops", response_model=list[PlantingOut], summary="Plantings of a farm")
def plantings(farm_id: uuid.UUID, user: CurrentUser, db: DB) -> list[PlantingOut]:
    return [PlantingOut.model_validate(farm_service.planting_out(p))
            for p in farm_service.list_plantings(db, user, farm_id)]


@router.post("/farms/{farm_id}/crops", response_model=PlantingOut, status_code=status.HTTP_201_CREATED,
             summary="Add a planting (crop on an area)")
def create_planting(farm_id: uuid.UUID, data: PlantingCreate, user: CurrentUser, db: DB, request: Request) -> PlantingOut:
    p = farm_service.create_planting(db, user, farm_id, data, client_ip(request))
    return PlantingOut.model_validate(farm_service.planting_out(p))


@router.get("/farm-crops/{planting_id}", response_model=PlantingOut, summary="Get a planting")
def get_planting(planting_id: uuid.UUID, user: CurrentUser, db: DB) -> PlantingOut:
    return PlantingOut.model_validate(farm_service.planting_out(farm_service.get_planting(db, user, planting_id)))


@router.patch("/farm-crops/{planting_id}", response_model=PlantingOut, summary="Update a planting")
def update_planting(planting_id: uuid.UUID, data: PlantingUpdate, user: CurrentUser, db: DB,
                    request: Request) -> PlantingOut:
    p = farm_service.update_planting(db, user, planting_id, data, client_ip(request))
    return PlantingOut.model_validate(farm_service.planting_out(p))


@router.delete("/farm-crops/{planting_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a planting")
def delete_planting(planting_id: uuid.UUID, user: CurrentUser, db: DB, request: Request) -> Response:
    farm_service.delete_planting(db, user, planting_id, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
