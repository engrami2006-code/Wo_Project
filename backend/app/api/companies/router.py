from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status

from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.auth import CompanyCreate, CompanyOut, CompanyUpdate
from app.schemas.common import ERROR_RESPONSES
from app.schemas.farm import FarmOut
from app.services import farm_service, user_service

router = APIRouter(prefix="/companies", tags=["Companies"], responses=ERROR_RESPONSES)


@router.get("", response_model=list[CompanyOut], summary="Companies visible to you")
def list_companies(user: CurrentUser, db: DB) -> list[CompanyOut]:
    return [CompanyOut.model_validate(c) for c in user_service.list_companies(db, user)]


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED, summary="Create a company (admin)")
def create_company(data: CompanyCreate, user: CurrentUser, db: DB, request: Request) -> CompanyOut:
    return CompanyOut.model_validate(user_service.create_company(db, user, data, client_ip(request)))


@router.get("/{company_id}", response_model=CompanyOut, summary="Get a company")
def get_company(company_id: uuid.UUID, user: CurrentUser, db: DB) -> CompanyOut:
    return CompanyOut.model_validate(user_service.get_company(db, user, company_id))


@router.patch("/{company_id}", response_model=CompanyOut, summary="Rename a company")
def update_company(company_id: uuid.UUID, data: CompanyUpdate, user: CurrentUser, db: DB, request: Request) -> CompanyOut:
    return CompanyOut.model_validate(user_service.update_company(db, user, company_id, data, client_ip(request)))


@router.get("/{company_id}/farms", response_model=list[FarmOut], summary="Farms of a company (isolation enforced)")
def company_farms(company_id: uuid.UUID, user: CurrentUser, db: DB) -> list[FarmOut]:
    return [FarmOut.model_validate(f) for f in farm_service.company_farms(db, user, company_id)]
