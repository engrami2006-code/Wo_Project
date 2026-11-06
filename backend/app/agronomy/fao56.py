"""Crop water requirement following FAO Irrigation and Drainage Paper 56 (single crop coefficient).

Every function returns its result together with the steps used, so each calculation can be
stored, displayed and audited.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Any

STAGES = ("initial", "development", "mid", "late")


@dataclass
class CropParams:
    name: str
    kc_ini: float
    kc_mid: float
    kc_end: float
    l_ini: int | None
    l_dev: int | None
    l_mid: int | None
    l_late: int | None
    max_height_m: float | None = None
    is_perennial: bool = False
    ky: float | None = None

    @property
    def has_stages(self) -> bool:
        return None not in (self.l_ini, self.l_dev, self.l_mid, self.l_late)

    @property
    def season_length(self) -> int | None:
        if not self.has_stages:
            return None
        return int(self.l_ini + self.l_dev + self.l_mid + self.l_late)  # type: ignore[operator]


@dataclass
class Step:
    name: str
    formula: str
    values: dict[str, Any]
    result: Any
    unit: str = ""
    reference: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "formula": self.formula, "values": self.values,
                "result": self.result, "unit": self.unit, "reference": self.reference}


@dataclass
class StageInfo:
    status: str          # not_yet_planted | in_season | season_ended
    stage: str | None    # initial | development | mid | late | None
    day: int | None      # days since planting (or day within the perennial cycle)
    day_in_stage: int | None = None
    stage_length: int | None = None
    note: str = ""


def growth_stage(crop: CropParams, planting_date: date, on: date,
                 override: str | None = None) -> StageInfo:
    days = (on - planting_date).days
    if override:
        return StageInfo("in_season", override, days, note="manual stage override")
    if days < 0:
        return StageInfo("not_yet_planted", None, days)
    if not crop.has_stages:
        if crop.is_perennial:
            return StageInfo("in_season", "mid", days,
                             note="perennial without FAO-56 stage lengths: Kc_mid used year-round")
        return StageInfo("in_season", None, days, note="stage lengths are not defined for this crop")
    lengths = [crop.l_ini, crop.l_dev, crop.l_mid, crop.l_late]
    total = sum(int(x) for x in lengths if x is not None)
    day = days
    note = ""
    if crop.is_perennial:
        cycle = 365
        day = days % cycle
        note = f"perennial annual cycle: day {day} of {cycle}"
        if day >= total:
            return StageInfo("in_season", "late", day, day - total, None,
                             note=note + "; after the FAO-56 cycle, Kc_end is applied")
    elif days >= total:
        return StageInfo("season_ended", None, days, note=f"season length {total} days")
    start = 0
    for stage, length in zip(STAGES, lengths, strict=True):
        assert length is not None
        if day < start + length:
            return StageInfo("in_season", stage, day, day - start, int(length), note=note)
        start += int(length)
    return StageInfo("season_ended", None, days)


def u2_from_uz(uz: float, z: float = 10.0) -> float:
    """FAO-56 Eq. 47: wind speed at 2 m from a measurement at height z."""
    return uz * 4.87 / math.log(67.8 * z - 5.42)


def adjust_kc_for_climate(kc_tab: float, u2: float, rh_min: float, h: float,
                          ref_u2: float = 2.0, ref_rh: float = 45.0) -> tuple[float, dict[str, Any]]:
    """FAO-56 Eq. 62/65: adjust Kc_mid (or Kc_end ≥ 0.45) for local climate.

    FAO-56 restricts the inputs to 1 ≤ u2 ≤ 6 m/s, 20 ≤ RHmin ≤ 80 %, 0.1 ≤ h ≤ 10 m.
    """
    u2c = min(max(u2, 1.0), 6.0)
    rhc = min(max(rh_min, 20.0), 80.0)
    hc = min(max(h, 0.1), 10.0)
    delta = (0.04 * (u2c - ref_u2) - 0.004 * (rhc - ref_rh)) * (hc / 3.0) ** 0.3
    return kc_tab + delta, {"u2": round(u2c, 3), "rh_min": round(rhc, 1), "h": hc,
                            "delta": round(delta, 4)}


@dataclass
class KcResult:
    kc: float
    kc_mid_used: float
    kc_end_used: float
    climate_adjusted: bool
    steps: list[Step] = field(default_factory=list)


def crop_coefficient(crop: CropParams, stage: StageInfo, *, u2: float | None = None,
                     rh_min: float | None = None, ref_u2: float = 2.0,
                     ref_rh: float = 45.0) -> KcResult:
    steps: list[Step] = []
    kc_mid, kc_end = crop.kc_mid, crop.kc_end
    adjusted = False
    if u2 is not None and rh_min is not None and crop.max_height_m:
        kc_mid, info = adjust_kc_for_climate(crop.kc_mid, u2, rh_min, crop.max_height_m, ref_u2, ref_rh)
        steps.append(Step("Kc_mid climatic adjustment",
                          "Kc_mid + [0.04(u2−2) − 0.004(RHmin−45)](h/3)^0.3",
                          {"Kc_mid_tab": crop.kc_mid, **info}, round(kc_mid, 4), "", "FAO-56 Eq. 62"))
        if crop.kc_end >= 0.45:
            kc_end, info_e = adjust_kc_for_climate(crop.kc_end, u2, rh_min, crop.max_height_m,
                                                   ref_u2, ref_rh)
            steps.append(Step("Kc_end climatic adjustment", "same as Eq. 62, applied when Kc_end ≥ 0.45",
                              {"Kc_end_tab": crop.kc_end, **info_e}, round(kc_end, 4), "",
                              "FAO-56 Eq. 65"))
        adjusted = True
    else:
        steps.append(Step("Kc climatic adjustment", "skipped", {
            "reason": "RHmin, u2 or crop height not available; Table 12 values used"}, None))

    s = stage.stage
    if s == "initial":
        kc = crop.kc_ini
        formula = "Kc = Kc_ini"
    elif s == "mid":
        kc = kc_mid
        formula = "Kc = Kc_mid"
    elif s == "development":
        if stage.day_in_stage is not None and stage.stage_length:
            frac = stage.day_in_stage / stage.stage_length
            kc = crop.kc_ini + frac * (kc_mid - crop.kc_ini)
            formula = "Kc = Kc_ini + (i/L_dev)(Kc_mid − Kc_ini)"
        else:
            kc = (crop.kc_ini + kc_mid) / 2
            formula = "Kc = (Kc_ini + Kc_mid)/2  (stage override, position unknown)"
    elif s == "late":
        if stage.day_in_stage is not None and stage.stage_length:
            frac = stage.day_in_stage / stage.stage_length
            kc = kc_mid + frac * (kc_end - kc_mid)
            formula = "Kc = Kc_mid + (i/L_late)(Kc_end − Kc_mid)"
        elif stage.stage_length is None and stage.day_in_stage is not None:
            kc = kc_end
            formula = "Kc = Kc_end  (perennial, after cycle)"
        else:
            kc = (kc_mid + kc_end) / 2
            formula = "Kc = (Kc_mid + Kc_end)/2  (stage override, position unknown)"
    else:
        raise ValueError("Kc is undefined outside the growing season")
    steps.append(Step("Crop coefficient", formula,
                      {"stage": s, "day_in_stage": stage.day_in_stage, "stage_length": stage.stage_length,
                       "Kc_ini": crop.kc_ini, "Kc_mid": round(kc_mid, 4), "Kc_end": round(kc_end, 4)},
                      round(kc, 4), "", "FAO-56 Eq. 66 / Table 12"))
    return KcResult(kc=kc, kc_mid_used=kc_mid, kc_end_used=kc_end, climate_adjusted=adjusted, steps=steps)


@dataclass
class RequirementResult:
    et0_mm: float
    kc: float
    etc_mm: float
    precipitation_mm: float | None
    p_eff_mm: float | None
    nir_mm: float | None
    net_l: float | None
    gross_l: float | None
    efficiency: float
    area_m2: float
    steps: list[Step]


def water_requirement(*, et0_mm: float, kc: float, area_m2: float, efficiency: float,
                      precipitation_mm: float | None, effective_rain_fraction: float,
                      mm_to_l_per_m2: float = 1.0) -> RequirementResult:
    if area_m2 <= 0:
        raise ValueError("Area must be greater than zero")
    if not 0 < efficiency <= 1:
        raise ValueError("Efficiency must be in (0, 1]")
    if et0_mm < 0:
        raise ValueError("ET0 cannot be negative")
    steps: list[Step] = []
    etc = kc * et0_mm
    steps.append(Step("Crop evapotranspiration", "ETc = Kc × ET0",
                      {"Kc": round(kc, 4), "ET0": round(et0_mm, 3)}, round(etc, 3), "mm/day",
                      "FAO-56 Eq. 56"))
    p_eff = nir = net_l = gross_l = None
    if precipitation_mm is not None:
        p_eff = effective_rain_fraction * precipitation_mm
        steps.append(Step("Effective rainfall", "P_eff = f × P",
                          {"f": effective_rain_fraction, "P": round(precipitation_mm, 2)},
                          round(p_eff, 3), "mm", "FAO TM3 §3.2 (simplified daily fraction)"))
        nir = max(0.0, etc - p_eff)
        steps.append(Step("Net irrigation requirement", "NIR = max(0, ETc − P_eff)",
                          {"ETc": round(etc, 3), "P_eff": round(p_eff, 3)}, round(nir, 3), "mm"))
        net_l = nir * area_m2 * mm_to_l_per_m2
        steps.append(Step("Net volume", "V_net = NIR × Area   (1 mm × 1 m² = 1 L)",
                          {"NIR_mm": round(nir, 3), "Area_m2": area_m2}, round(net_l, 2), "L"))
        gross_l = net_l / efficiency
        steps.append(Step("Gross volume", "V_gross = V_net / efficiency",
                          {"V_net": round(net_l, 2), "efficiency": efficiency}, round(gross_l, 2), "L",
                          "FAO TM4 Annex I"))
    else:
        steps.append(Step("Effective rainfall", "not computed",
                          {"reason": "precipitation forecast not available"}, None))
    return RequirementResult(et0_mm=et0_mm, kc=kc, etc_mm=etc, precipitation_mm=precipitation_mm,
                             p_eff_mm=p_eff, nir_mm=nir, net_l=net_l, gross_l=gross_l,
                             efficiency=efficiency, area_m2=area_m2, steps=steps)


def seasonal_gross_requirement_l_per_m2(crop: CropParams, et0_mm_day: float, efficiency: float) -> dict[str, Any]:
    """Seasonal gross requirement per m² assuming a constant mean ET0 (used for planning).

    ETc_season = ET0 × [Kc_ini·L_ini + ½(Kc_ini+Kc_mid)·L_dev + Kc_mid·L_mid + ½(Kc_mid+Kc_end)·L_late]
    Perennials without stage lengths use Kc_mid × 365 days.
    """
    if crop.has_stages:
        kc_days = (crop.kc_ini * crop.l_ini + 0.5 * (crop.kc_ini + crop.kc_mid) * crop.l_dev  # type: ignore[operator]
                   + crop.kc_mid * crop.l_mid + 0.5 * (crop.kc_mid + crop.kc_end) * crop.l_late)  # type: ignore[operator]
        days = crop.season_length
        if crop.is_perennial and days is not None and days < 365:
            kc_days += crop.kc_end * (365 - days)
            days = 365
        formula = "ET0 × Σ(Kc·L) / efficiency"
    else:
        kc_days = crop.kc_mid * 365
        days = 365
        formula = "ET0 × Kc_mid × 365 / efficiency"
    etc_season = et0_mm_day * kc_days
    return {"etc_season_mm": round(etc_season, 2), "gross_l_per_m2": round(etc_season / efficiency, 2),
            "season_days": days, "kc_days": round(kc_days, 2), "formula": formula}
