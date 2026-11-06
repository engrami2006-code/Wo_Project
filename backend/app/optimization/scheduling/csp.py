"""Irrigation scheduling as a Constraint Satisfaction Problem (Russell & Norvig ch. 6).

Variables    one irrigation task per planting
Domains      start slots inside the daily window such that the whole run avoids blocked hours
             (unary constraints, enforced as node consistency)
Constraints  * binary no-overlap: if flow_i + flow_j > pump capacity, the two runs cannot overlap
             * global capacity: in every slot, the sum of active flows ≤ pump capacity
             * global daily limit: Σ volumes ≤ the source's daily limit (checked up front)
Solver       AC-3 preprocessing on the binary constraints, then backtracking search with
             MRV (+ degree tie-break), LCV value ordering and forward checking.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class IrrigationTask:
    key: str
    name: str
    volume_l: float
    flow_lph: float


@dataclass
class ScheduleSpec:
    slot_minutes: int
    window_start_min: int
    window_end_min: int
    blocked: list[tuple[int, int]]
    pump_capacity_lph: float
    daily_limit_l: float | None = None
    max_backtracks: int = 20000


@dataclass
class CSPStats:
    assignments: int = 0
    backtracks: int = 0
    ac3_revisions: int = 0
    ac3_pruned: int = 0
    fc_pruned: int = 0
    runtime_ms: float = 0.0


@dataclass
class ScheduleResult:
    status: str                       # solved | infeasible | limit_reached
    assignments: dict[str, int]       # task key -> start slot
    durations: dict[str, int]
    message: str
    stats: CSPStats
    load_profile: list[dict[str, Any]] = field(default_factory=list)
    violated: str | None = None


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def parse_hhmm(text: str) -> int:
    h, m = text.strip().split(":")
    value = int(h) * 60 + int(m)
    if not 0 <= value <= 24 * 60:
        raise ValueError(f"Invalid time {text!r}")
    return value


class IrrigationCSP:
    def __init__(self, spec: ScheduleSpec, tasks: list[IrrigationTask]) -> None:
        self.spec = spec
        self.tasks = {t.key: t for t in tasks}
        self.stats = CSPStats()
        slot = spec.slot_minutes
        self.first_slot = math.ceil(spec.window_start_min / slot)
        self.last_slot = spec.window_end_min // slot  # exclusive
        self.blocked_slots = {k for k in range(0, 24 * 60 // slot)
                              for (b0, b1) in spec.blocked if k * slot < b1 and (k + 1) * slot > b0}
        self.duration = {t.key: max(1, math.ceil(t.volume_l / t.flow_lph * 60 / slot)) for t in tasks}
        self.domains: dict[str, list[int]] = {}
        self.neighbors: dict[str, set[str]] = {t.key: set() for t in tasks}
        for a in tasks:
            for b in tasks:
                if a.key < b.key and a.flow_lph + b.flow_lph > spec.pump_capacity_lph + 1e-9:
                    self.neighbors[a.key].add(b.key)
                    self.neighbors[b.key].add(a.key)

    # ------------------------------------------------------------------ helpers
    def interval(self, key: str, start: int) -> range:
        return range(start, start + self.duration[key])

    def node_consistent_domain(self, key: str) -> list[int]:
        d = self.duration[key]
        values = []
        for s in range(self.first_slot, self.last_slot - d + 1):
            if all(k not in self.blocked_slots for k in range(s, s + d)):
                values.append(s)
        return values

    def compatible(self, a: str, sa: int, b: str, sb: int) -> bool:
        """Binary no-overlap constraint (only between neighbours)."""
        return sa + self.duration[a] <= sb or sb + self.duration[b] <= sa

    # ------------------------------------------------------------------ AC-3
    def ac3(self) -> bool:
        queue = deque((a, b) for a in self.neighbors for b in self.neighbors[a])
        while queue:
            xi, xj = queue.popleft()
            if self.revise(xi, xj):
                if not self.domains[xi]:
                    return False
                for xk in self.neighbors[xi] - {xj}:
                    queue.append((xk, xi))
        return True

    def revise(self, xi: str, xj: str) -> bool:
        self.stats.ac3_revisions += 1
        kept = [x for x in self.domains[xi] if any(self.compatible(xi, x, xj, y) for y in self.domains[xj])]
        removed = len(self.domains[xi]) - len(kept)
        if removed:
            self.stats.ac3_pruned += removed
            self.domains[xi] = kept
        return removed > 0

    # ------------------------------------------------------------------ search
    def fits(self, key: str, start: int, load: dict[int, float]) -> bool:
        flow = self.tasks[key].flow_lph
        cap = self.spec.pump_capacity_lph + 1e-9
        return all(load.get(k, 0.0) + flow <= cap for k in self.interval(key, start))

    def solve(self) -> ScheduleResult:
        t0 = time.perf_counter()
        spec = self.spec
        total = sum(t.volume_l for t in self.tasks.values())
        if spec.daily_limit_l is not None and total > spec.daily_limit_l + 1e-9:
            return self._fail("daily_limit",
                              f"Total volume {total:,.0f} L exceeds the daily source limit "
                              f"{spec.daily_limit_l:,.0f} L.", t0)
        for key, task in self.tasks.items():
            if task.flow_lph > spec.pump_capacity_lph + 1e-9:
                return self._fail("pump_capacity",
                                  f"{task.name}: line flow {task.flow_lph:,.0f} L/h exceeds pump capacity "
                                  f"{spec.pump_capacity_lph:,.0f} L/h.", t0)
            self.domains[key] = self.node_consistent_domain(key)
            if not self.domains[key]:
                return self._fail("window",
                                  f"{task.name} needs {self.duration[key] * spec.slot_minutes} min, which "
                                  f"does not fit in the allowed window outside blocked hours.", t0)
        if not self.ac3():
            return self._fail("no_overlap", "AC-3 proved that the pairwise no-overlap constraints cannot "
                                            "all be satisfied in the window.", t0)

        assignment: dict[str, int] = {}
        load: dict[int, float] = {}
        domains = {k: list(v) for k, v in self.domains.items()}
        limit_hit = {"flag": False}

        def select_var() -> str:
            unassigned = [k for k in self.tasks if k not in assignment]
            return min(unassigned, key=lambda k: (len(domains[k]),
                                                  -len([n for n in self.neighbors[k] if n not in assignment]),
                                                  k))

        def lcv(key: str) -> list[int]:
            def ruled_out(start: int) -> int:
                trial = dict(load)
                for k in self.interval(key, start):
                    trial[k] = trial.get(k, 0.0) + self.tasks[key].flow_lph
                count = 0
                for other in self.tasks:
                    if other in assignment or other == key:
                        continue
                    count += sum(1 for v in domains[other] if not self.fits(other, v, trial))
                return count
            return sorted(domains[key], key=lambda s: (ruled_out(s), s))

        def backtrack() -> bool:
            if len(assignment) == len(self.tasks):
                return True
            if self.stats.backtracks >= spec.max_backtracks:
                limit_hit["flag"] = True
                return False
            var = select_var()
            for start in lcv(var):
                if not self.fits(var, start, load):
                    continue
                self.stats.assignments += 1
                assignment[var] = start
                for k in self.interval(var, start):
                    load[k] = load.get(k, 0.0) + self.tasks[var].flow_lph
                saved = {k: domains[k] for k in self.tasks if k not in assignment}
                ok = True
                for other in saved:  # forward checking
                    kept = [v for v in domains[other] if self.fits(other, v, load)]
                    self.stats.fc_pruned += len(domains[other]) - len(kept)
                    domains[other] = kept
                    if not kept:
                        ok = False
                        break
                if ok and backtrack():
                    return True
                for name, values in saved.items():
                    domains[name] = values
                for slot_k in self.interval(var, start):
                    load[slot_k] -= self.tasks[var].flow_lph
                del assignment[var]
                self.stats.backtracks += 1
                if limit_hit["flag"]:
                    return False
            return False

        solved = backtrack()
        self.stats.runtime_ms = (time.perf_counter() - t0) * 1000
        if solved:
            profile = []
            slot = spec.slot_minutes
            for k in range(self.first_slot, self.last_slot):
                profile.append({"slot": k, "time": hhmm(k * slot), "load_lph": round(load.get(k, 0.0), 2),
                                "blocked": k in self.blocked_slots})
            return ScheduleResult("solved", dict(assignment), dict(self.duration),
                                  "All irrigation runs fit within pump capacity, the allowed window and "
                                  "blocked hours.", self.stats, profile)
        if limit_hit["flag"]:
            return ScheduleResult("limit_reached", {}, dict(self.duration),
                                  "Search budget exhausted before a schedule was found.", self.stats,
                                  violated="search_limit")
        return ScheduleResult("infeasible", {}, dict(self.duration),
                              "No assignment satisfies the pump-capacity constraint in the window.",
                              self.stats, violated="pump_capacity")

    def _fail(self, violated: str, message: str, t0: float) -> ScheduleResult:
        self.stats.runtime_ms = (time.perf_counter() - t0) * 1000
        return ScheduleResult("infeasible", {}, dict(self.duration), message, self.stats, violated=violated)
