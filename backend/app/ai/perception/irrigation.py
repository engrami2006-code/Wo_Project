"""Perception for soil-based irrigation decisions (FAO-56 calculation + grounding)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.agronomy.fao56 import (
    CropParams,
    StageInfo,
    crop_coefficient,
    growth_stage,
    u2_from_uz,
    water_requirement,
)
from app.ai.knowledge_base.reference_data import STAGE_SYMBOLS
from app.ai.perception.base import PerceptSet, fmt_num


@dataclass
class WeatherDay:
    """Weather inputs for the target date, already extracted from a validated snapshot."""

    status: str                     # fresh | cached | unavailable
    snapshot_id: str | None = None
    age_hours: float | None = None
    et0_mm: float | None = None
    precipitation_mm: float | None = None
    rh_min: float | None = None
    wind_mean_10m: float | None = None


@dataclass
class IrrigationContext:
    crop: CropParams
    crop_name_en: str
    crop_name_ar: str
    area_m2: float
    efficiency: float
    efficiency_source: str
    target_date: date
    planting_date: date | None
    stage_override: str | None
    available_water_l: float | None
    available_source: str | None
    weather: WeatherDay
    et0_override_mm: float | None = None
    precipitation_override_mm: float | None = None
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class IrrigationPerception:
    percepts: PerceptSet
    variables: dict[str, Any]
    calculation: dict[str, Any]
    stage: StageInfo | None
    data_quality: str


def perceive_irrigation(ctx: IrrigationContext) -> IrrigationPerception:
    p = ctx.params
    ps = PerceptSet()
    steps: list[dict[str, Any]] = []
    v: dict[str, Any] = {
        "crop_name": ctx.crop_name_en, "crop_name_ar": ctx.crop_name_ar,
        "area_m2": fmt_num(ctx.area_m2), "efficiency_pct": fmt_num(ctx.efficiency * 100, 0),
        "critical_ratio_pct": fmt_num(float(p["critical_supply_ratio"]) * 100, 0),
        "high_et0_mm": fmt_num(float(p["high_et0_mm"])),
        "low_eff_pct": fmt_num(float(p["low_efficiency_threshold"]) * 100, 0),
        "stale_hours": p["stale_weather_hours"], "ky": ctx.crop.ky if ctx.crop.ky is not None else "—",
        "season_length": ctx.crop.season_length or "—",
        "planting_date": ctx.planting_date.isoformat() if ctx.planting_date else "—",
    }

    # --- weather percepts ---------------------------------------------------------------
    w = ctx.weather
    weather_ok = w.status in ("fresh", "cached")
    ps.add("weather_available", weather_ok, {"status": w.status, "snapshot_id": w.snapshot_id})
    if weather_ok and w.age_hours is not None:
        stale = w.age_hours > float(p["stale_weather_hours"])
        ps.add("weather_stale", stale,
               {"age_hours": round(w.age_hours, 2), "limit_hours": p["stale_weather_hours"]},
               f"snapshot younger than {p['stale_weather_hours']} h",
               f"لقطة أحدث من {p['stale_weather_hours']} ساعة")
        v["weather_age_h"] = fmt_num(w.age_hours)
    else:
        ps.add("weather_stale", False, {"reason": "no snapshot"})

    # --- stage percepts -----------------------------------------------------------------
    stage: StageInfo | None = None
    if ctx.planting_date is None and not ctx.stage_override:
        for sym in STAGE_SYMBOLS:
            ps.unknown(sym, "planting date not recorded", ["planting_date"])
    else:
        planting = ctx.planting_date or ctx.target_date
        stage = growth_stage(ctx.crop, planting, ctx.target_date, ctx.stage_override)
        active = ("not_yet_planted" if stage.status == "not_yet_planted"
                  else "season_ended" if stage.status == "season_ended"
                  else f"stage_{stage.stage}" if stage.stage else None)
        if active is None:
            for sym in STAGE_SYMBOLS:
                ps.unknown(sym, stage.note or "stage cannot be determined", ["crop_stage_lengths"])
        else:
            for sym in STAGE_SYMBOLS:
                ps.add(sym, sym == active, {"days_since_planting": stage.day, "stage": stage.stage,
                                            "status": stage.status, "note": stage.note})
        v["days_since_planting"] = stage.day
        v["stage"] = stage.stage or stage.status
        steps.append({"name": "Growth stage", "formula": "days since planting vs FAO-56 stage lengths",
                      "values": {"days": stage.day, "L": [ctx.crop.l_ini, ctx.crop.l_dev,
                                                           ctx.crop.l_mid, ctx.crop.l_late],
                                 "override": ctx.stage_override, "note": stage.note},
                      "result": stage.stage or stage.status, "unit": "",
                      "reference": "FAO-56 Table 11"})

    # --- ET0 / precipitation ------------------------------------------------------------
    manual_et0 = ctx.et0_override_mm is not None
    et0 = ctx.et0_override_mm if manual_et0 else w.et0_mm
    precip = (ctx.precipitation_override_mm if ctx.precipitation_override_mm is not None
              else w.precipitation_mm)
    v["et0_mm"] = fmt_num(et0, 2)
    v["precipitation_mm"] = fmt_num(precip, 1)

    calc: dict[str, Any] = {"inputs": {
        "et0_mm": et0, "et0_source": "manual" if manual_et0 else ("open-meteo" if et0 is not None else None),
        "precipitation_mm": precip,
        "precipitation_source": ("manual" if ctx.precipitation_override_mm is not None
                                 else ("open-meteo" if precip is not None else None)),
        "area_m2": ctx.area_m2, "efficiency": ctx.efficiency, "efficiency_source": ctx.efficiency_source,
        "planting_date": v["planting_date"], "target_date": ctx.target_date.isoformat(),
        "available_water_l": ctx.available_water_l, "available_water_source": ctx.available_source,
        "rh_min": w.rh_min, "wind_mean_10m": w.wind_mean_10m,
    }, "parameters": {
        "kc_ini": ctx.crop.kc_ini, "kc_mid": ctx.crop.kc_mid, "kc_end": ctx.crop.kc_end,
        "stage_lengths": [ctx.crop.l_ini, ctx.crop.l_dev, ctx.crop.l_mid, ctx.crop.l_late],
        "max_height_m": ctx.crop.max_height_m, "ky": ctx.crop.ky,
        "effective_rainfall_fraction": p["effective_rainfall_fraction"],
        "critical_supply_ratio": p["critical_supply_ratio"],
    }, "method": "FAO-56 single crop coefficient", "steps": steps, "result": {}}

    kc = None
    in_season = stage is not None and stage.status == "in_season" and stage.stage is not None
    if in_season and stage is not None:
        u2 = u2_from_uz(w.wind_mean_10m) if w.wind_mean_10m is not None else None
        kcr = crop_coefficient(ctx.crop, stage, u2=u2, rh_min=w.rh_min,
                               ref_u2=float(p.get("kc_ref_u2", 2.0)), ref_rh=float(p.get("kc_ref_rhmin", 45.0)))
        kc = kcr.kc
        steps.extend(s.to_dict() for s in kcr.steps)
        v["kc"] = fmt_num(kc, 3)
        calc["result"]["kc"] = round(kc, 4)
        calc["result"]["kc_climate_adjusted"] = kcr.climate_adjusted

    req = None
    if kc is not None and et0 is not None:
        req = water_requirement(et0_mm=et0, kc=kc, area_m2=ctx.area_m2, efficiency=ctx.efficiency,
                                precipitation_mm=precip,
                                effective_rain_fraction=float(p["effective_rainfall_fraction"]),
                                mm_to_l_per_m2=float(p.get("mm_to_l_per_m2", 1.0)))
        steps.extend(s.to_dict() for s in req.steps)
        calc["result"].update({"et0_mm": round(et0, 3), "etc_mm": round(req.etc_mm, 3),
                               "p_eff_mm": None if req.p_eff_mm is None else round(req.p_eff_mm, 3),
                               "nir_mm": None if req.nir_mm is None else round(req.nir_mm, 3),
                               "net_l": None if req.net_l is None else round(req.net_l, 2),
                               "gross_l": None if req.gross_l is None else round(req.gross_l, 2)})
        v.update({"etc_mm": fmt_num(req.etc_mm, 2), "p_eff_mm": fmt_num(req.p_eff_mm, 2),
                  "nir_mm": fmt_num(req.nir_mm, 2), "net_l": fmt_num(req.net_l),
                  "gross_l": fmt_num(req.gross_l)})

    # --- demand / rain percepts ---------------------------------------------------------
    if req is not None:
        ps.add("et_demand_positive", req.etc_mm > 0, {"etc_mm": round(req.etc_mm, 3)})
        if req.p_eff_mm is not None:
            covers = req.p_eff_mm >= req.etc_mm
            ps.add("rain_covers_demand", covers,
                   {"p_eff_mm": round(req.p_eff_mm, 3), "etc_mm": round(req.etc_mm, 3),
                    "comparison": "P_eff ≥ ETc"},
                   f"effective rain {'<' if covers else '≥'} {fmt_num(req.etc_mm, 2)} mm",
                   f"المطر الفعّال {'<' if covers else '≥'} {fmt_num(req.etc_mm, 2)} مم")
        else:
            ps.unknown("rain_covers_demand", "precipitation forecast not available", ["precipitation"])
    else:
        fields: list[str] = []
        if et0 is None:
            fields.append("et0")
        if stage is None:
            fields.append("planting_date")
        reason = ("ET0 not available (weather unavailable and no manual ET0)" if et0 is None
                  else "crop coefficient undefined outside the season" if stage is not None
                  else "planting date not recorded")
        ps.unknown("et_demand_positive", reason, fields)
        ps.unknown("rain_covers_demand", reason, fields + (["precipitation"] if precip is None else []))
    if precip is not None:
        ps.add("rain_expected", precip >= float(p["rain_event_min_mm"]),
               {"precipitation_mm": precip, "threshold_mm": p["rain_event_min_mm"]})
    else:
        ps.unknown("rain_expected", "precipitation forecast not available", ["precipitation"])
    if et0 is not None:
        ps.add("high_evaporative_demand", et0 >= float(p["high_et0_mm"]),
               {"et0_mm": et0, "threshold_mm": p["high_et0_mm"]})
    else:
        ps.unknown("high_evaporative_demand", "ET0 not available", ["et0"])

    # --- water supply percepts ----------------------------------------------------------
    avail = ctx.available_water_l
    v["available_l"] = fmt_num(avail)
    gross = req.gross_l if req is not None else None
    if avail is None or gross is None:
        fields = [] if avail is not None else ["available_water"]
        if gross is None:
            if et0 is None:
                fields.append("et0")
            if precip is None:
                fields.append("precipitation")
            if stage is None:
                fields.append("planting_date")
        reason = ("available water for the day is not recorded" if avail is None
                  else "gross requirement could not be calculated")
        for sym in ("water_sufficient", "water_limited", "water_critical"):
            ps.unknown(sym, reason, fields)
    else:
        ratio = float(p["critical_supply_ratio"])
        sufficient = avail >= gross
        coverage = (avail / gross * 100) if gross > 0 else 100.0
        v["coverage_pct"] = fmt_num(min(coverage, 100.0), 0)
        ev = {"available_l": round(avail, 2), "gross_l": round(gross, 2),
              "coverage_pct": round(coverage, 1)}
        ps.add("water_sufficient", sufficient, ev,
               f"available water {'<' if sufficient else '≥'} {fmt_num(gross)} L",
               f"الماء المتاح {'<' if sufficient else '≥'} {fmt_num(gross)} لتر")
        ps.add("water_limited", not sufficient, ev,
               f"available water {'≥' if not sufficient else '<'} {fmt_num(gross)} L",
               f"الماء المتاح {'≥' if not sufficient else '<'} {fmt_num(gross)} لتر")
        critical = avail < ratio * gross
        ps.add("water_critical", critical, {**ev, "critical_ratio": ratio},
               f"available water {'≥' if critical else '<'} {fmt_num(ratio * gross)} L",
               f"الماء المتاح {'≥' if critical else '<'} {fmt_num(ratio * gross)} لتر")
        calc["result"]["coverage_pct"] = round(coverage, 1)

    # --- crop / method percepts ---------------------------------------------------------
    if ctx.crop.ky is not None:
        ps.add("drought_sensitive_crop", ctx.crop.ky > 1.0, {"ky": ctx.crop.ky, "threshold": 1.0})
    else:
        ps.unknown("drought_sensitive_crop", "Ky not documented for this crop", ["crop_ky"])
    ps.add("low_efficiency_method", ctx.efficiency < float(p["low_efficiency_threshold"]),
           {"efficiency": ctx.efficiency, "threshold": p["low_efficiency_threshold"]})

    quality = "manual_et0" if manual_et0 else (
        "stale_weather" if ps.get("weather_stale") and ps.get("weather_stale").value  # type: ignore[union-attr]
        else "fresh" if weather_ok else "no_weather")
    return IrrigationPerception(percepts=ps, variables=v, calculation=calc, stage=stage,
                                data_quality=quality)


# Map percepts to the user-facing data field that would make them known.
MISSING_FIELD_HINTS: dict[str, dict[str, str]] = {
    "planting_date": {"en": "Planting date of the crop", "ar": "تاريخ زراعة المحصول"},
    "crop_stage_lengths": {"en": "FAO-56 stage lengths for this crop", "ar": "أطوال مراحل النمو (FAO-56) لهذا المحصول"},
    "et0": {"en": "Reference evapotranspiration (weather data or a manual ET0 value)",
            "ar": "التبخر-النتح المرجعي (بيانات الطقس أو قيمة ET0 يدوية)"},
    "precipitation": {"en": "Precipitation forecast (weather data or a manual value)",
                      "ar": "توقع الهطول (بيانات الطقس أو قيمة يدوية)"},
    "available_water": {"en": "Water available today (litres)", "ar": "كمية الماء المتاحة اليوم (لتر)"},
    "crop_ky": {"en": "Crop yield-response factor Ky", "ar": "معامل استجابة المحصول للماء Ky"},
    "irrigation_efficiency": {"en": "Irrigation method or efficiency", "ar": "طريقة الري أو كفاءتها"},
    "weather": {"en": "Weather data for the farm location", "ar": "بيانات الطقس لموقع المزرعة"},
    "ph": {"en": "A pH reading", "ar": "قراءة pH"},
    "ec": {"en": "An EC reading", "ar": "قراءة EC"},
    "ph_range": {"en": "Configured pH range for the system", "ar": "نطاق pH المحدد للنظام"},
    "ec_range": {"en": "Configured EC range for the system", "ar": "نطاق EC المحدد للنظام"},
    "hydro_record": {"en": "A complete hydroponic record", "ar": "سجل كامل للنظام المائي"},
    "hydro_records": {"en": "Hydroponic records history", "ar": "سجل تاريخي للنظام المائي"},
    "water_records": {"en": "Water records history", "ar": "سجل تاريخي لاستهلاك المياه"},
}
