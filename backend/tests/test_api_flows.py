"""End-to-end API flows: farms, water, calculations, irrigation, hydroponics, analytics, impact."""

from datetime import UTC, date, datetime, timedelta

from app.services import weather_service
from tests.conftest import FakeProvider, create_farm, create_planting

NO_DATA_AR = "لا توجد بيانات كافية لإعطاء توصية موثوقة."


def test_empty_workspace_has_no_fake_numbers(owner):
    dash = owner.get("/api/dashboard/summary").json()
    assert dash["empty"] is True and dash["farms"] == 0
    an = owner.get("/api/water/analytics").json()
    assert an["has_data"] is False and an["total_l"] is None and an["series"] == []
    assert owner.get("/api/recommendations").json()["total"] == 0


def test_farm_and_planting_crud_with_validation(owner):
    farm = create_farm(owner, total_area_m2=2000)
    assert owner.post("/api/farms", json={"name": "bad", "latitude": 95, "longitude": 0}).status_code == 422
    p = create_planting(owner, farm["id"], area=1500)
    assert p["current_stage"]["stage"] == "mid"
    too_big = owner.post(f"/api/farms/{farm['id']}/crops", json={"crop_id": p["crop_id"], "area_m2": 900})
    assert too_big.status_code == 422
    zero = owner.post(f"/api/farms/{farm['id']}/crops", json={"crop_id": p["crop_id"], "area_m2": 0})
    assert zero.status_code == 422
    upd = owner.patch(f"/api/farm-crops/{p['id']}", json={"stage_override": "late"}).json()
    assert upd["current_stage"]["stage"] == "late"
    assert owner.delete(f"/api/farm-crops/{p['id']}").status_code == 204
    assert owner.delete(f"/api/farms/{farm['id']}").status_code == 204


def test_calculation_is_traceable_and_reports_missing_data(owner):
    farm = create_farm(owner)
    p = create_planting(owner, farm["id"])
    r = owner.post("/api/water/calculations", json={"farm_crop_id": p["id"], "et0_override_mm": 6.2,
                                                    "precipitation_override_mm": 1.5}).json()
    assert r["status"] == "calculated"
    calc = r["calculation"]
    assert calc["result"]["gross_l"] == 6588.89 and calc["method"].startswith("FAO-56")
    assert {s["name"] for s in calc["steps"]} >= {"Crop evapotranspiration", "Net irrigation requirement",
                                                  "Gross volume"}
    assert calc["parameters"]["effective_rainfall_fraction"] == 0.8
    offline = owner.post("/api/water/calculations", json={"farm_crop_id": p["id"]}).json()
    assert offline["status"] == "insufficient_data" and offline["calculation"] is None
    assert len(owner.get("/api/water/calculations").json()) == 1


def test_irrigation_recommendation_full_explanation_contract(owner):
    farm = create_farm(owner)
    p = create_planting(owner, farm["id"])
    r = owner.post("/api/irrigation/recommendation", json={"farm_crop_id": p["id"], "et0_override_mm": 6.2,
                                                           "precipitation_override_mm": 0,
                                                           "available_water_l": 5000}).json()
    assert r["status"] == "recommendation"
    e = r["explanation"]
    assert e["recommendation"]["action"] == "action_deficit_irrigation"
    assert e["recommendation"]["amount_l"] == 5000
    assert e["certainty"] == "entailed" and e["data_quality"] == "manual_et0"
    assert [t["code"] for t in e["triggered_rules"] if t["role"] == "decision"] == ["R-IRR-003"]
    alt = {a["rule"]: a for a in e["alternatives"]}
    assert alt["R-IRR-002"]["status"] == "not_fired"
    assert any("7,922" in c["condition_en"] for c in e["what_could_change"])
    assert any(f["symbol"] == "water_limited" and f["used"] for f in e["supporting_facts"])
    assert e["trace"]["agenda"] and e["trace"]["backward_chaining"][0]["status"] == "proven"
    # persisted with the payload; alert raised for the shortage
    rec = owner.get(f"/api/recommendations/{r['recommendation_id']}").json()
    assert rec["payload"]["recommendation"]["rule"] == "R-IRR-003"
    codes = {a["rule_code"] for a in owner.get("/api/alerts").json()["items"]}
    assert "R-ALR-005" in codes and "R-ALR-001" in codes


def test_irrigation_without_weather_gives_insufficient_data(owner):
    farm = create_farm(owner, daily_water_allowance_l=4000)
    p = create_planting(owner, farm["id"])
    r = owner.post("/api/irrigation/recommendation", json={"farm_crop_id": p["id"]}).json()
    assert r["status"] == "insufficient_data" and r["recommendation_id"] is None
    e = r["explanation"]
    assert e["reason_ar"] == NO_DATA_AR
    fields = {f for m in e["missing_data"] for f in m["fields"]}
    assert "et0" in fields and "available_water" not in fields  # allowance comes from the farm


def test_irrigation_with_online_weather_and_rain_postpones(owner):
    weather_service.set_provider(FakeProvider(et0=4.0, rain=30.0))
    farm = create_farm(owner, daily_water_allowance_l=10000)
    p = create_planting(owner, farm["id"])
    r = owner.post("/api/irrigation/recommendation", json={"farm_crop_id": p["id"]}).json()
    assert r["weather_status"] == "fresh"
    assert r["explanation"]["recommendation"]["action"] == "action_postpone_irrigation"
    assert r["explanation"]["data_quality"] == "fresh"
    w = owner.get(f"/api/weather/{farm['id']}").json()
    assert w["status"] == "fresh" and "AIR humidity" in w["note"]


def test_water_records_alerts_dedupe_and_analytics(owner):
    farm = create_farm(owner)
    p = create_planting(owner, farm["id"])
    now = datetime.now(UTC)
    for i in range(8, 0, -1):
        r = owner.post("/api/water/records", json={"farm_id": farm["id"], "farm_crop_id": p["id"],
                                                   "recorded_at": (now - timedelta(days=i)).isoformat(),
                                                   "volume_l": 1000, "source": "well"})
        assert r.status_code == 201
    spike = owner.post("/api/water/records", json={"farm_id": farm["id"], "farm_crop_id": p["id"],
                                                   "recorded_at": now.isoformat(), "volume_l": 2500, "source": "well"})
    assert spike.status_code == 201
    alerts = owner.get("/api/alerts?status=open").json()["items"]
    assert [a["rule_code"] for a in alerts].count("R-ALR-003") == 1
    owner.post(f"/api/alerts/evaluate?farm_id={farm['id']}")
    alerts = owner.get("/api/alerts?status=open").json()["items"]
    assert [a["rule_code"] for a in alerts].count("R-ALR-003") == 1  # deduplicated
    future = owner.post("/api/water/records", json={"farm_id": farm["id"], "recorded_at": (now + timedelta(days=2))
                                                    .isoformat(), "volume_l": 1, "source": "well"})
    assert future.status_code == 422
    an = owner.get(f"/api/water/analytics?farm_id={farm['id']}&period=day").json()
    assert an["has_data"] and an["sufficient_history"] and an["total_l"] == 10500
    assert an["anomalies"][-1]["total_l"] == 2500 and an["l_per_m2"] == 10.5
    month = owner.get("/api/water/analytics?period=month").json()
    assert sum(s["total_l"] for s in month["series"]) == 10500
    dash = owner.get("/api/dashboard/summary").json()
    assert dash["counts"]["farms"] == 1 and dash["water"]["last_30_days_l"] == 10500


def test_impact_requires_a_measured_baseline(owner):
    farm = create_farm(owner)
    p = create_planting(owner, farm["id"])
    rep = owner.get(f"/api/water/impact?farm_id={farm['id']}").json()
    assert rep["measured_savings_pct"] is None and "baseline" in rep["measured_savings_note"]
    owner.post("/api/water/baselines", json={"farm_id": farm["id"], "farm_crop_id": p["id"],
                                             "period_start": str(date.today() - timedelta(days=400)),
                                             "period_end": str(date.today() - timedelta(days=371)),
                                             "total_volume_l": 60000, "area_m2": 1000})
    now = datetime.now(UTC)
    for i in range(30):
        owner.post("/api/water/records", json={"farm_id": farm["id"], "farm_crop_id": p["id"],
                                               "recorded_at": (now - timedelta(days=i)).isoformat(),
                                               "volume_l": 1500, "source": "well"})
    rep = owner.get(f"/api/water/impact?farm_id={farm['id']}").json()
    assert rep["baseline_l_per_m2_day"] == 2.0 and rep["current_l_per_m2_day"] == 1.5
    assert rep["measured_savings_pct"] == 25.0
    assert "NOT proof" in rep["apparent_savings_note"]


def test_hydroponics_balance_ranges_alerts_and_auto_resolve(owner):
    farm = create_farm(owner)
    profiles = owner.get("/api/hydroponics/profiles").json()
    assert profiles[0]["ph_min"] == 5.6 and "Cornell" in profiles[0]["source"]
    s = owner.post("/api/hydroponics", json={"farm_id": farm["id"], "name": "NFT-A", "system_type": "NFT",
                                             "growing_area_m2": 50, "plant_count": 400, "reservoir_capacity_l": 1000,
                                             "profile_code": "lettuce_cornell"}).json()
    assert s["ph_max"] == 6.0 and s["threshold_source"].startswith("Cornell")
    now = datetime.now(UTC).isoformat()
    r = owner.post(f"/api/hydroponics/{s['id']}/records", json={
        "recorded_at": now, "water_input_l": 120, "water_consumed_l": 90, "water_recycled_l": 300,
        "water_discharged_l": 5, "reservoir_start_l": 800, "reservoir_end_l": 810, "ph": 7.2, "ec": 1.2}).json()
    assert r["balance"]["unaccounted_l"] == 15
    ev = r["evaluation"]
    assert ev["recommendation"]["action"] == "advise_lower_ph" and ev["data_quality"] == "measured"
    codes = {a["rule_code"] for a in owner.get("/api/alerts?status=open").json()["items"]}
    assert {"R-HYD-002", "R-HYD-005", "R-HYD-008"} <= codes
    # corrected reading → the pH alert is resolved automatically by re-evaluation
    owner.post(f"/api/hydroponics/{s['id']}/records", json={
        "recorded_at": now, "water_input_l": 100, "water_consumed_l": 95, "water_discharged_l": 0,
        "reservoir_start_l": 810, "reservoir_end_l": 815, "ph": 5.8, "ec": 1.2})
    open_codes = {a["rule_code"] for a in owner.get("/api/alerts?status=open").json()["items"]}
    assert "R-HYD-002" not in open_codes
    bal = owner.get(f"/api/hydroponics/{s['id']}/balance").json()
    assert bal["has_data"] and bal["totals"]["input_l"] == 220
    assert bal["evaluation"]["recommendation"]["action"] == "hydro_status_ok"
    hydro_water = owner.get(f"/api/water/records?farm_id={farm['id']}").json()
    assert hydro_water["total"] == 2  # hydroponic input is integrated into water management


def test_hydroponics_without_ranges_never_alerts_on_ph(owner):
    farm = create_farm(owner)
    s = owner.post("/api/hydroponics", json={"farm_id": farm["id"], "name": "DWC", "system_type": "DWC",
                                             "growing_area_m2": 10, "reservoir_capacity_l": 200,
                                             "is_closed_loop": False}).json()
    r = owner.post(f"/api/hydroponics/{s['id']}/records", json={"recorded_at": datetime.now(UTC).isoformat(),
                                                                 "water_input_l": 20, "ph": 8.5}).json()
    assert r["evaluation"]["recommendation"] is None
    hints = {h["en"] for m in r["evaluation"]["missing_data"] for h in m["hints"]}
    assert "Configured pH range for the system" in hints
    assert not any(a["rule_code"].startswith("R-HYD-00") and a["rule_code"] in ("R-HYD-001", "R-HYD-002")
                   for a in owner.get("/api/alerts").json()["items"])


def test_hydroponic_system_without_records(owner):
    farm = create_farm(owner)
    s = owner.post("/api/hydroponics", json={"farm_id": farm["id"], "name": "Empty", "system_type": "RAFT",
                                             "growing_area_m2": 5, "reservoir_capacity_l": 100,
                                             "profile_code": "lettuce_cornell"}).json()
    bal = owner.get(f"/api/hydroponics/{s['id']}/balance").json()
    assert bal["has_data"] is False and bal["totals"] is None and bal["message"] == "No hydroponic records yet."
    ev = owner.get(f"/api/hydroponics/{s['id']}/evaluation").json()
    assert ev["recommendation"] is None
    assert any(p["symbol"] == "hydro_records_missing" and p["value"] is True for p in ev["percepts"])
    assert owner.get(f"/api/hydroponics/{s['id']}/records").json()["total"] == 0
