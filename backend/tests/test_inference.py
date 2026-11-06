"""Forward chaining, conflict resolution, backward chaining — on toy and on the real KB."""

import pytest

from app.ai.inference.backward import DISPROVEN, PROVEN, UNKNOWN, BackwardChainer
from app.ai.inference.conflict import resolve_conflicts
from app.ai.inference.forward import decide, forward_chain
from app.ai.knowledge_base import reference_data as ref
from app.ai.rules.rule import Literal, RuleSyntaxError, build_rule


def kb_rules():
    return [build_rule(r["code"], r["antecedent"], r["consequent"], priority=r["priority"],
                       action_group=r["action_group"], category=r["category"]) for r in ref.rule_rows()]


BASE = {"not_yet_planted": False, "stage_initial": False, "stage_development": False, "stage_mid": True,
        "stage_late": False, "season_ended": False, "et_demand_positive": True, "rain_covers_demand": False,
        "drought_sensitive_crop": True, "low_efficiency_method": False, "high_evaporative_demand": False,
        "weather_available": True, "weather_stale": False}


def test_rule_syntax_is_horn_only():
    with pytest.raises(RuleSyntaxError):
        build_rule("R-X", "a | b", "c")
    with pytest.raises(RuleSyntaxError):
        build_rule("R-X", "a", "~c")
    with pytest.raises(RuleSyntaxError):
        build_rule("R-X", "a & c", "c")


def test_forward_chaining_agenda_and_known_false_literals():
    rules = [build_rule("R1", "a & ~b", "c"), build_rule("R2", "c", "d")]
    res = forward_chain(rules, {"a": True, "b": False})
    assert res.derived == ["c", "d"]
    assert [f.code for f in res.fired] == ["R1", "R2"]
    # unknown is not false: ~b does not hold when b is absent
    assert forward_chain(rules, {"a": True}).derived == []


def test_conflict_resolution_priority_then_specificity_then_code():
    r1 = build_rule("R-A-001", "x", "act1", priority=50, action_group="g")
    r2 = build_rule("R-A-002", "x & y", "act2", priority=50, action_group="g")
    r3 = build_rule("R-A-003", "x", "act3", priority=70, action_group="g")
    assert resolve_conflicts([r1, r2, r3])[0] is r3
    assert resolve_conflicts([r1, r2])[0] is r2
    r4 = build_rule("R-A-000", "y", "act4", priority=50, action_group="g")
    assert resolve_conflicts([r1, r4])[0] is r4


def test_decide_blocks_consequences_of_overridden_actions():
    rules = [build_rule("R1", "x", "act_low", priority=10, action_group="g"),
             build_rule("R2", "x", "act_high", priority=90, action_group="g"),
             build_rule("R3", "act_low", "side_effect")]
    d = decide(rules, {"x": True})
    assert d.winners["g"].code == "R2"
    assert "side_effect" in d.first_pass.facts
    assert "side_effect" not in d.result.facts and "act_low" not in d.result.facts


def test_real_kb_deficit_irrigation_path():
    d = decide(kb_rules(), BASE | {"water_sufficient": False, "water_limited": True, "water_critical": False})
    assert d.winners["irrigation_action"].code == "R-IRR-003"
    assert d.result.facts["irrigate_today"] is True
    assert "advise_protect_sensitive_stage" in d.result.facts
    assert "alert_water_shortage" in d.result.facts


def test_real_kb_paths_full_critical_postpone_and_season():
    rules = kb_rules()
    full = decide(rules, BASE | {"water_sufficient": True, "water_limited": False, "water_critical": False})
    assert full.winners["irrigation_action"].code == "R-IRR-002"
    crit = decide(rules, BASE | {"water_sufficient": False, "water_limited": True, "water_critical": True})
    assert crit.winners["irrigation_action"].code == "R-IRR-004"
    post = decide(rules, BASE | {"rain_covers_demand": True})
    assert post.winners["irrigation_action"].code == "R-IRR-005"
    assert post.result.facts["skip_irrigation_today"] is True
    ended = decide(rules, BASE | {"stage_mid": False, "season_ended": True})
    assert ended.winners["irrigation_action"].code == "R-IRR-006"


def test_backward_chaining_proven_unknown_disproven():
    rules = kb_rules()
    bc = BackwardChainer(rules, ref.PERCEPT_SYMBOLS)
    known = BASE | {"water_sufficient": True, "water_limited": False, "water_critical": False}
    res = bc.ask(Literal("irrigate_today"), known)
    assert res.status == PROVEN and res.proof.via_rule == "R-IRR-008"
    missing = bc.ask(Literal("irrigate_today"), BASE)
    assert missing.status == UNKNOWN
    assert set(missing.missing_percepts) == {"water_sufficient", "water_limited", "water_critical"}
    no = bc.ask(Literal("irrigate_today"), BASE | {"rain_covers_demand": True, "water_sufficient": True,
                                                    "water_limited": False, "water_critical": False})
    assert no.status == DISPROVEN and no.missing_percepts == []


def test_forward_and_backward_agree_on_reference_scenarios():
    rules = kb_rules()
    bc = BackwardChainer(rules, ref.PERCEPT_SYMBOLS)
    for water in ({"water_sufficient": True, "water_limited": False, "water_critical": False},
                  {"water_sufficient": False, "water_limited": True, "water_critical": True}):
        facts = BASE | water
        fc = decide(rules, facts)
        assert (bc.ask(Literal("irrigate_today"), facts).status == PROVEN) == bool(fc.result.facts.get("irrigate_today"))
