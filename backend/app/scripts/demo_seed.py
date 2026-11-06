"""OPTIONAL demo data for presentations. Never runs automatically (not part of any migration).

Everything it creates lives under one farm flagged ``is_demo=True`` and named "DEMO — …", which the UI
labels with a DEMO badge. The values are illustrative inputs, not measurements from a real farm.

Usage (from backend/):
    python -m app.scripts.demo_seed            # creates demo@wo-demo.com / DemoPass12345
    python -m app.scripts.demo_seed --remove   # deletes the demo account and everything under it
"""

from __future__ import annotations

import argparse
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    Company,
    Crop,
    Farm,
    FarmCrop,
    HydroponicProfile,
    HydroponicRecord,
    HydroponicSystem,
    IrrigationMethod,
    User,
    WaterBaseline,
    WaterRecord,
)
from app.models.base import HydroSystemType, Role, WaterRecordType, WaterSource
from app.schemas.ai import IrrigationRequest
from app.services import irrigation_service

EMAIL = "demo@wo-demo.com"
PASSWORD = "DemoPass12345"
COMPANY = "DEMO — WO Sample Agro Co."


def remove(db) -> None:  # type: ignore[no-untyped-def]
    user = db.scalar(select(User).where(User.email == EMAIL))
    if user and user.company_id:
        company = db.get(Company, user.company_id)
        for farm in db.scalars(select(Farm).where(Farm.company_id == user.company_id)):
            db.delete(farm)
        db.flush()
        db.delete(user)
        if company:
            db.delete(company)
    db.commit()


def seed(db) -> None:  # type: ignore[no-untyped-def]
    remove(db)
    company = Company(name=COMPANY)
    db.add(company)
    db.flush()
    user = User(email=EMAIL, full_name="DEMO Owner", password_hash=hash_password(PASSWORD),
                role=Role.COMPANY_OWNER, company_id=company.id, preferred_language="ar")
    db.add(user)
    farm = Farm(name="DEMO — Sample Farm (illustrative data)", company_id=company.id, latitude=21.54,
                longitude=39.17, location_name="Sample location", total_area_m2=20000,
                water_source=WaterSource.WELL.value, daily_water_allowance_l=6000, is_demo=True,
                notes="Demo farm created by scripts/demo_seed. Values are illustrative, not measured.")
    db.add(farm)
    db.flush()
    crops = {c.code: c for c in db.scalars(select(Crop).where(Crop.is_reference.is_(True)))}
    methods = {m.code: m for m in db.scalars(select(IrrigationMethod))}
    today = date.today()
    tomato = FarmCrop(farm_id=farm.id, crop_id=crops["tomato"].id, area_m2=1000, variety="Demo variety",
                      planting_date=today - timedelta(days=80), irrigation_method_id=methods["drip"].id)
    onion = FarmCrop(farm_id=farm.id, crop_id=crops["onion_dry"].id, area_m2=1500,
                     planting_date=today - timedelta(days=30), irrigation_method_id=methods["sprinkler"].id)
    palm = FarmCrop(farm_id=farm.id, crop_id=crops["date_palm"].id, area_m2=4000,
                    planting_date=today - timedelta(days=900), irrigation_method_id=methods["drip"].id)
    db.add_all([tomato, onion, palm])
    db.flush()
    now = datetime.now(UTC)
    daily = [5200, 5350, 5100, 5600, 5250, 5400, 5300, 5150, 5500, 5450, 5200, 5350, 5600, 8400]
    for i, vol in enumerate(daily):
        ts = now - timedelta(days=len(daily) - 1 - i, hours=2)
        db.add(WaterRecord(farm_id=farm.id, farm_crop_id=tomato.id, recorded_at=ts, volume_l=vol * 0.4,
                           source=WaterSource.WELL, record_type=WaterRecordType.IRRIGATION, created_by_id=user.id,
                           is_demo=True, notes="DEMO"))
        db.add(WaterRecord(farm_id=farm.id, farm_crop_id=onion.id, recorded_at=ts, volume_l=vol * 0.6,
                           source=WaterSource.WELL, record_type=WaterRecordType.IRRIGATION, created_by_id=user.id,
                           is_demo=True, notes="DEMO"))
    db.add(WaterBaseline(farm_id=farm.id, farm_crop_id=tomato.id, period_start=today - timedelta(days=395),
                         period_end=today - timedelta(days=366), total_volume_l=75000, area_m2=1000,
                         notes="DEMO baseline (illustrative)", created_by_id=user.id))
    profile = db.scalar(select(HydroponicProfile).where(HydroponicProfile.code == "lettuce_cornell"))
    system = HydroponicSystem(farm_id=farm.id, name="DEMO NFT-1", system_type=HydroSystemType.NFT,
                              crop_id=crops["lettuce"].id, growing_area_m2=60, plant_count=480,
                              reservoir_capacity_l=1200, is_closed_loop=True,
                              ph_min=profile.ph_min if profile else None, ph_max=profile.ph_max if profile else None,
                              ec_min=profile.ec_min if profile else None, ec_max=profile.ec_max if profile else None,
                              threshold_source=profile.source if profile else None)
    db.add(system)
    db.flush()
    readings = [(5.8, 1.20), (5.9, 1.19), (5.8, 1.22), (5.7, 1.21), (5.9, 1.18), (6.0, 1.23), (5.8, 1.20),
                (5.9, 1.21), (6.3, 1.31)]
    level = 900.0
    for i, (ph, ec) in enumerate(readings):
        ts = now - timedelta(days=len(readings) - 1 - i, hours=1)
        inp = 95 + i * 2
        consumed = inp - 8
        end = level + 3
        db.add(HydroponicRecord(system_id=system.id, recorded_at=ts, period_days=1, water_input_l=inp,
                                water_consumed_l=consumed, water_recycled_l=850, water_discharged_l=0,
                                water_losses_l=2, reservoir_start_l=level, reservoir_end_l=end, ph=ph, ec=ec,
                                water_temp_c=22.5, notes="DEMO", created_by_id=user.id, created_at=ts))
        level = end
    db.commit()
    # Run the real knowledge-based agent once per planting with manual (offline) weather inputs.
    for p in (tomato, onion, palm):
        irrigation_service.recommend(db, user, IrrigationRequest(farm_crop_id=p.id, et0_override_mm=6.4,
                                                                 precipitation_override_mm=0), None)
    print(f"Demo data created. Sign in with {EMAIL} / {PASSWORD}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remove", action="store_true", help="delete the demo account and its data")
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.remove:
            remove(db)
            print("Demo data removed.")
        else:
            seed(db)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
