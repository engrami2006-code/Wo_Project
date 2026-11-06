"""Knowledge-base validation by model checking (DPLL with Clark completion)."""

from app.ai.knowledge_base import reference_data as ref
from app.ai.knowledge_base.validation import validate_rules
from app.ai.logic.syntax import parse
from app.ai.rules.rule import build_rule
from tests.test_inference import kb_rules

AXIOMS = {a["key"]: parse(a["value"]) for a in ref.axioms()}


def codes(report):
    return {(i.severity, i.code) for i in report.issues}


def test_reference_kb_is_consistent_conflict_free_and_complete():
    report = validate_rules(kb_rules(), AXIOMS, ref.PERCEPT_SYMBOLS)
    assert report.consistent and report.ok
    assert ("info", "coverage_complete") in codes(report)
    assert not any(i.severity == "error" for i in report.issues)


def test_equal_priority_overlap_is_reported_as_conflict():
    bad = build_rule("R-IRR-099", "irrigation_needed & water_sufficient", "action_postpone_irrigation",
                     priority=50, action_group="irrigation_action", category="irrigation")
    report = validate_rules([*kb_rules(), bad], AXIOMS, ref.PERCEPT_SYMBOLS)
    assert not report.ok
    conflict = next(i for i in report.issues if i.code == "conflict")
    assert "R-IRR-099" in conflict.rules and "R-IRR-002" in conflict.rules
    assert conflict.model is not None  # the witness world


def test_dead_rule_negation_on_derived_unknown_symbol_and_subsumption():
    dead = build_rule("R-ADV-090", "water_sufficient & water_limited", "advise_x", category="advisory")
    neg = build_rule("R-ADV-091", "~irrigation_needed", "advise_y", category="advisory")
    unk = build_rule("R-ADV-092", "made_up_symbol", "advise_z", category="advisory")
    sub = build_rule("R-ADV-093", "water_limited & low_efficiency_method & stage_mid", "advise_improve_efficiency",
                     category="advisory")
    report = validate_rules([*kb_rules(), dead, neg, unk, sub], AXIOMS, ref.PERCEPT_SYMBOLS)
    c = codes(report)
    assert ("warning", "dead_rule") in c
    assert ("error", "negation_on_derived") in c
    assert ("error", "unknown_symbol") in c
    assert ("warning", "subsumed_rule") in c


def test_inconsistent_axioms_detected():
    axioms = AXIOMS | {"bad": parse("weather_available & ~weather_available")}
    report = validate_rules(kb_rules(), axioms, ref.PERCEPT_SYMBOLS)
    assert not report.consistent


def test_integrity_constraint_violation_is_reported_with_a_witness():
    """A rule that makes some world derive both irrigate_today and skip_irrigation_today."""
    bad = build_rule("R-IRR-098", "action_full_irrigation & rain_expected", "skip_irrigation_today",
                     category="decision")
    report = validate_rules([*kb_rules(), bad], AXIOMS, ref.PERCEPT_SYMBOLS)
    issue = next(i for i in report.issues if i.code == "integrity_violation")
    assert issue.severity == "error" and not report.ok
    assert issue.model and issue.model.get("irrigate_today") and issue.model.get("skip_irrigation_today")
