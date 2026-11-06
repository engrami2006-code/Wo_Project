from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Query, Request, Response, status

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.common import ERROR_RESPONSES, Page
from app.schemas.hydro import (
    HydroProfileOut,
    HydroRecordCreate,
    HydroRecordOut,
    HydroRecordResult,
    HydroSystemCreate,
    HydroSystemOut,
    HydroSystemUpdate,
)
from app.services import hydro_service
from app.services.access import get_system

router = APIRouter(prefix="/hydroponics", tags=["Hydroponics"], responses=ERROR_RESPONSES)


@router.get("/profiles", response_model=list[HydroProfileOut], summary="Reference pH/EC profiles with sources")
def profiles(user: CurrentUser, db: DB) -> list[HydroProfileOut]:
    return [HydroProfileOut.model_validate(p) for p in hydro_service.list_profiles(db)]


@router.get("", response_model=list[HydroSystemOut], summary="Hydroponic systems")
def list_systems(user: CurrentUser, db: DB, farm_id: uuid.UUID | None = None) -> list[HydroSystemOut]:
    return [HydroSystemOut.model_validate(s) for s in hydro_service.list_systems(db, user, farm_id)]


@router.post("", response_model=HydroSystemOut, status_code=status.HTTP_201_CREATED, summary="Create a system")
def create_system(data: HydroSystemCreate, user: CurrentUser, db: DB, request: Request) -> HydroSystemOut:
    s = hydro_service.create_system(db, user, data, client_ip(request))
    return HydroSystemOut.model_validate(hydro_service.system_out(db, s))


@router.get("/{system_id}", response_model=HydroSystemOut, summary="Get a system")
def get_one(system_id: uuid.UUID, user: CurrentUser, db: DB) -> HydroSystemOut:
    return HydroSystemOut.model_validate(hydro_service.system_out(db, get_system(db, user, system_id)))


@router.patch("/{system_id}", response_model=HydroSystemOut, summary="Update a system / apply a profile")
def update_system(system_id: uuid.UUID, data: HydroSystemUpdate, user: CurrentUser, db: DB,
                  request: Request) -> HydroSystemOut:
    s = hydro_service.update_system(db, user, system_id, data, client_ip(request))
    return HydroSystemOut.model_validate(hydro_service.system_out(db, s))


@router.delete("/{system_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a system")
def delete_system(system_id: uuid.UUID, user: CurrentUser, db: DB, request: Request) -> Response:
    hydro_service.delete_system(db, user, system_id, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{system_id}/records", response_model=Page[HydroRecordOut], summary="Records of a system")
def list_records(system_id: uuid.UUID, user: CurrentUser, db: DB, page: int = Query(1, ge=1),
                 size: int = Query(50, ge=1, le=200)) -> Page[HydroRecordOut]:
    items, total = hydro_service.list_records(db, user, system_id, page, size)
    return Page[HydroRecordOut](items=[HydroRecordOut.model_validate(i) for i in items], total=total, page=page, size=size)


@router.post("/{system_id}/records", response_model=HydroRecordResult, status_code=status.HTTP_201_CREATED,
             summary="Add a record: water balance + KB evaluation + alerts")
def add_record(system_id: uuid.UUID, data: HydroRecordCreate, user: CurrentUser, db: DB,
               request: Request) -> HydroRecordResult:
    r = hydro_service.add_record(db, user, system_id, data, client_ip(request))
    return HydroRecordResult(record=HydroRecordOut.model_validate(r["record"]), balance=r["balance"],
                             evaluation=r["evaluation"], alerts_created=r["alerts_created"])


@router.get("/{system_id}/balance", response_model=dict[str, Any], summary="Water balance report and trends")
def balance(system_id: uuid.UUID, user: CurrentUser, db: DB) -> dict[str, Any]:
    return hydro_service.balance_report(db, user, system_id)


@router.get("/{system_id}/evaluation", response_model=dict[str, Any], summary="Run the KB agent on the system now")
def evaluation(system_id: uuid.UUID, user: CurrentUser, db: DB) -> dict[str, Any]:
    return hydro_service.evaluate_system(db, get_system(db, user, system_id))
