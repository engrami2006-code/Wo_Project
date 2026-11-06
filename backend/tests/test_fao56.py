"""FAO-56 calculations against hand-computed values."""

import math
from datetime import date, timedelta

import pytest

from app.agronomy.fao56 import (
    CropParams,
    adjust_kc_for_climate,
    crop_coefficient,
    growth_stage,
    seasonal_gross_requirement_l_per_m2,
    u2_from_uz,
    water_requirement,
)

TOMATO = CropParams("Tomato", 0.6, 1.15, 0.80, 30, 40, 40, 25, 0.6, False, 1.05)
D0 = date(2026, 1, 1)


@pytest.mark.parametrize("days,expected", [(-1, ("not_yet_planted", None)), (0, ("in_season", "initial")),
                                           (29, ("in_season", "initial")), (30, ("in_season", "development")),
                                           (70, ("in_season", "mid")), (110, ("in_season", "late")),
                                           (134, ("in_season", "late")), (135, ("season_ended", None))])
def test_stage_boundaries(days, expected):
    s = growth_stage(TOMATO, D0, D0 + timedelta(days=days))
    assert (s.status, s.stage) == expected


def test_kc_linear_interpolation_eq66():
    mid_dev = growth_stage(TOMATO, D0, D0 + timedelta(days=50))  # day 20 of 40 in development
    assert crop_coefficient(TOMATO, mid_dev).kc == pytest.approx(0.6 + 0.5 * (1.15 - 0.6))
    late = growth_stage(TOMATO, D0, D0 + timedelta(days=120))  # day 10 of 25 in late season
    assert crop_coefficient(TOMATO, late).kc == pytest.approx(1.15 + 10 / 25 * (0.80 - 1.15))


def test_wind_conversion_eq47_and_climate_adjustment_eq62():
    assert u2_from_uz(3.0) == pytest.approx(3.0 * 4.87 / math.log(67.8 * 10 - 5.42))
    kc, info = adjust_kc_for_climate(1.15, u2=3.0, rh_min=30.0, h=0.6)
    expected = 1.15 + (0.04 * (3.0 - 2) - 0.004 * (30 - 45)) * (0.6 / 3) ** 0.3
    assert kc == pytest.approx(expected)
    kc_clip, info = adjust_kc_for_climate(1.15, u2=9.0, rh_min=5.0, h=0.6)
    assert info["u2"] == 6.0 and info["rh_min"] == 20.0


def test_water_requirement_hand_computed():
    # ETc = 1.15 × 6.2 = 7.13 mm; P_eff = 0.8 × 1.5 = 1.2; NIR = 5.93 mm; net = 5,930 L; gross = 6,588.89 L
    r = water_requirement(et0_mm=6.2, kc=1.15, area_m2=1000, efficiency=0.9, precipitation_mm=1.5,
                          effective_rain_fraction=0.8)
    assert r.etc_mm == pytest.approx(7.13, abs=0.01)
    assert r.nir_mm == pytest.approx(5.93, abs=0.01)
    assert r.net_l == pytest.approx(5930.0, abs=0.5)
    assert r.gross_l == pytest.approx(6588.89, abs=0.01)


def test_rain_covering_demand_gives_zero_and_validation_errors():
    r = water_requirement(et0_mm=3, kc=1.0, area_m2=100, efficiency=0.75, precipitation_mm=20,
                          effective_rain_fraction=0.8)
    assert r.nir_mm == 0 and r.gross_l == 0
    with pytest.raises(ValueError):
        water_requirement(et0_mm=3, kc=1, area_m2=0, efficiency=0.9, precipitation_mm=0, effective_rain_fraction=0.8)
    with pytest.raises(ValueError):
        water_requirement(et0_mm=3, kc=1, area_m2=10, efficiency=1.5, precipitation_mm=0, effective_rain_fraction=0.8)


def test_seasonal_requirement_and_perennial():
    s = seasonal_gross_requirement_l_per_m2(TOMATO, 5.0, 0.9)
    kc_days = 0.6 * 30 + 0.5 * (0.6 + 1.15) * 40 + 1.15 * 40 + 0.5 * (1.15 + 0.8) * 25
    assert s["gross_l_per_m2"] == pytest.approx(round(5.0 * kc_days / 0.9, 2))
    palm = CropParams("Date palm", 0.9, 0.95, 0.95, None, None, None, None, 8.0, True)
    assert growth_stage(palm, D0, D0 + timedelta(days=400)).stage == "mid"
    assert seasonal_gross_requirement_l_per_m2(palm, 6.0, 0.9)["season_days"] == 365
