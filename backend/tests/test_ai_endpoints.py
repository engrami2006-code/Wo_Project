"""Chatbot dialogues, land distribution, CSP scheduling, KB logic lab and validation endpoints."""

from tests.conftest import create_farm, create_planting, crop_id

NO_DATA_AR = "لا توجد بيانات كافية لإعطاء توصية موثوقة."


def test_chatbot_slot_filling_offline_weather_then_water(owner):
    farm = create_farm(owner)
    create_planting(owner, farm["id"])
    r1 = owner.post("/api/chatbot/query", json={"message": "هل أسقي الطماطم اليوم؟"}).json()
    assert r1["intent"] == "irrigation_advice" and r1["status"] == "missing_data"
    assert NO_DATA_AR in r1["text"] and "التبخر" in r1["text"]
    sid = r1["session_id"]
    r2 = owner.post("/api/chatbot/query", json={"message": "التبخر 6.2 المطر 0", "session_id": sid}).json()
    assert r2["status"] == "missing_data" and "كم لترًا" in r2["text"]
    r3 = owner.post("/api/chatbot/query", json={"message": "5000 لتر", "session_id": sid}).json()
    assert r3["status"] == "answer"
    assert r3["explanation"]["recommendation"]["action"] == "action_deficit_irrigation"
    assert "R-IRR-003" in r3["text"]
    why = owner.post("/api/chatbot/query", json={"message": "ليش؟", "session_id": sid}).json()
    assert why["intent"] == "explain_last" and "R-IRR-003" in why["text"]
    hist = owner.get(f"/api/chatbot/sessions/{sid}").json()
    assert len(hist) == 8


def test_chatbot_disambiguation_english_and_no_hallucination(owner, other_owner):
    farm = create_farm(owner)
    create_planting(owner, farm["id"], area=500)
    create_planting(owner, farm["id"], area=700, variety="Cherry")
    r = owner.post("/api/chatbot/query", json={"message": "Should I irrigate the tomatoes today?",
                                               "et0_override_mm": 5, "precipitation_override_mm": 0,
                                               "available_water_l": 100000}).json()
    assert r["status"] == "clarification" and len(r["options"]) == 2 and r["language"] == "en"
    pick = owner.post("/api/chatbot/query", json={"message": r["options"][1]["value"],
                                                  "session_id": r["session_id"]}).json()
    assert pick["status"] == "answer"
    assert pick["explanation"]["recommendation"]["action"] == "action_full_irrigation"
    # another tenant has no plantings: the bot says so instead of inventing an answer
    other = other_owner.post("/api/chatbot/query", json={"message": "هل أسقي اليوم؟"}).json()
    assert other["status"] == "missing_data" and "لا توجد لديك زراعات" in other["text"]
    unknown = owner.post("/api/chatbot/query", json={"message": "tell me a joke"}).json()
    assert unknown["status"] == "fallback" and unknown["options"]


def test_land_distribution_endpoint(owner):
    tomato, wheat = crop_id(owner, "tomato"), crop_id(owner, "wheat_spring")
    body = {"total_area_m2": 10000, "num_units": 20, "available_water_l": 4_000_000, "season_et0_mm_day": 6,
            "efficiency": 0.9, "candidates": [{"crop_id": tomato, "yield_kg_per_m2": 6, "min_area_m2": 1000},
                                              {"crop_id": wheat, "yield_kg_per_m2": 0.6}]}
    r = owner.post("/api/land-distribution/optimize", json=body).json()
    assert r["status"] == "optimal" and r["statement"] == "Optimal under the selected objective and constraints."
    comp = {c["algorithm"]: c for c in r["comparison"]}
    assert comp["astar"]["objective_value"] == comp["ucs"]["objective_value"]
    assert comp["astar"]["nodes_expanded"] <= comp["ucs"]["nodes_expanded"]
    assert r["totals"]["water_used_l"] <= 4_000_000
    assert "admissible" in r["formulation"]["heuristic"].lower()
    infeasible = owner.post("/api/land-distribution/optimize", json=body | {"available_water_l": 1000}).json()
    assert infeasible["status"] == "infeasible" and infeasible["allocation"] == []
    missing_et0 = owner.post("/api/land-distribution/optimize", json=body | {"season_et0_mm_day": None})
    assert missing_et0.status_code == 422
    hist = owner.get("/api/land-distribution/requests").json()
    assert hist["total"] == 2
    assert owner.get(f"/api/land-distribution/requests/{r['request_id']}").json()["result"]["status"] == "optimal"


def test_schedule_endpoint(owner):
    body = {"pump_capacity_lph": 5000, "blocked": [{"start": "11:00", "end": "15:00"}],
            "tasks": [{"name": "Tomato", "volume_l": 6000, "flow_lph": 3000},
                      {"name": "Onion", "volume_l": 4000, "flow_lph": 2500}]}
    r = owner.post("/api/irrigation/schedule", json=body).json()
    assert r["status"] == "solved" and all(t["start"] for t in r["schedule"])
    assert "AC-3 preprocessing" in r["formulation"]["heuristics"]
    bad = owner.post("/api/irrigation/schedule", json=body | {"pump_capacity_lph": 2000}).json()
    assert bad["status"] == "infeasible" and bad["violated"] == "pump_capacity"


def test_logic_lab_and_validation(owner):
    facts = {"et_demand_positive": True, "rain_covers_demand": False, "season_ended": False,
             "not_yet_planted": False, "water_sufficient": True, "water_limited": False, "water_critical": False}
    r = owner.post("/api/knowledge-base/ask", json={"facts": facts, "query": "irrigate_today"}).json()
    assert r["forward_chaining"]["entailed"] and r["backward_chaining"]["status"] == "proven"
    assert r["model_checking"]["entailed"] and r["dpll"]["entailed"] and r["agreement"]
    neg = owner.post("/api/knowledge-base/ask", json={"facts": facts, "query": "action_deficit_irrigation"}).json()
    assert neg["forward_chaining"]["entailed"] is False and neg["model_checking"]["entailed"] is False
    bad = owner.post("/api/knowledge-base/ask", json={"facts": {"invented": True}, "query": "x"})
    assert bad.status_code == 422
    v = owner.post("/api/knowledge-base/validate", json={}).json()
    assert v["ok"] and any(i["code"] == "coverage_complete" for i in v["issues"])
    cand = {"code": "R-IRR-099", "name_en": "Bad", "name_ar": "سيئة", "category": "irrigation",
            "antecedent": "irrigation_needed & water_sufficient", "consequent": "action_postpone_irrigation",
            "action_group": "irrigation_action", "priority": 50, "explanation_en": "x x", "explanation_ar": "س س"}
    v2 = owner.post("/api/knowledge-base/validate", json={"candidate": cand}).json()
    assert not v2["ok"] and any(i["code"] == "conflict" for i in v2["issues"])
    overview = owner.get("/api/knowledge-base").json()
    assert overview["rules_total"] == 39 and overview["percepts"] == 27
