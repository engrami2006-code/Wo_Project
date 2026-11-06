import pytest

from app.agronomy.hydro_balance import compute_balance


def test_complete_balance():
    b = compute_balance(input_l=120, consumed_l=90, recycled_l=300, discharged_l=5, losses_l=None,
                        reservoir_start_l=800, reservoir_end_l=810, period_days=1, plant_count=400, area_m2=50)
    assert b.delta_storage_l == 10
    assert b.unaccounted_l == pytest.approx(15)
    assert b.unaccounted_fraction == pytest.approx(0.125)
    assert b.recirculation_ratio == pytest.approx(300 / 305)
    assert b.input_per_plant_day_l == pytest.approx(0.3)
    assert b.missing_terms == []


def test_missing_terms_are_reported_not_assumed():
    b = compute_balance(input_l=100, consumed_l=None, recycled_l=None, discharged_l=None, losses_l=None,
                        reservoir_start_l=None, reservoir_end_l=None, period_days=2, plant_count=0, area_m2=10)
    assert b.unaccounted_l is None and b.recirculation_ratio is None
    assert b.input_per_day_l == 50 and b.input_per_plant_day_l is None
    assert set(b.missing_terms) == {"reservoir_start_l/reservoir_end_l", "water_consumed_l", "water_discharged_l"}
