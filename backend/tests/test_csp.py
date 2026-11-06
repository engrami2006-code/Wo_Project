"""Irrigation scheduling CSP."""

from app.optimization.scheduling.csp import IrrigationCSP, IrrigationTask, ScheduleSpec, parse_hhmm


def spec(**kw):
    base = {"slot_minutes": 30, "window_start_min": parse_hhmm("05:00"), "window_end_min": parse_hhmm("21:00"),
            "blocked": [(parse_hhmm("11:00"), parse_hhmm("15:00"))], "pump_capacity_lph": 6000, "daily_limit_l": None}
    return ScheduleSpec(**(base | kw))


TASKS = [IrrigationTask("a", "Tomato", 9000, 3000), IrrigationTask("b", "Cucumber", 6000, 4000),
         IrrigationTask("c", "Lettuce", 4000, 2000), IrrigationTask("d", "Pepper", 7000, 3500)]


def test_solution_respects_capacity_window_and_blocked_hours():
    csp = IrrigationCSP(spec(), TASKS)
    res = csp.solve()
    assert res.status == "solved"
    load: dict[int, float] = {}
    for t in TASKS:
        start = res.assignments[t.key]
        for k in range(start, start + res.durations[t.key]):
            assert k not in csp.blocked_slots
            assert csp.first_slot <= k < csp.last_slot
            load[k] = load.get(k, 0) + t.flow_lph
    assert max(load.values()) <= 6000


def test_ac3_builds_binary_no_overlap_constraints():
    csp = IrrigationCSP(spec(), TASKS)
    # 4000 + 3500 > 6000 → cucumber and pepper must not overlap
    assert "d" in csp.neighbors["b"]
    assert "c" not in csp.neighbors["a"]  # 3000 + 2000 ≤ 6000


def test_infeasible_cases_name_the_violated_constraint():
    assert IrrigationCSP(spec(pump_capacity_lph=2500), TASKS).solve().violated == "pump_capacity"
    assert IrrigationCSP(spec(daily_limit_l=10000), TASKS).solve().violated == "daily_limit"
    tight = spec(window_start_min=parse_hhmm("05:00"), window_end_min=parse_hhmm("07:00"), blocked=[])
    assert IrrigationCSP(tight, TASKS).solve().violated == "window"
    crowded = spec(window_start_min=parse_hhmm("05:00"), window_end_min=parse_hhmm("08:30"), blocked=[],
                   pump_capacity_lph=4000)
    res = IrrigationCSP(crowded, [IrrigationTask("x", "X", 8000, 4000), IrrigationTask("y", "Y", 8000, 4000)]).solve()
    assert res.status == "infeasible"
