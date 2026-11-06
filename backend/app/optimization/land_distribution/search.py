"""Uninformed and informed search over the land-distribution state space.

* BFS          FIFO frontier; returns the first goal generated. Not optimal with
               non-uniform step costs.
* UCS          priority g(n). Optimal; equivalent to A* with h = 0.
* Greedy       priority h(n). Fast but not optimal.
* A*           priority f(n) = g(n) + h(n). Optimal because h is admissible. States are
               reopened when a cheaper path is found, so optimality does not depend on consistency.
"""

from __future__ import annotations

import heapq
import itertools
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.optimization.land_distribution.heuristics import INFEASIBLE, heuristic_for
from app.optimization.land_distribution.problem import LandProblem, State

DEFAULT_NODE_LIMIT = 200_000


@dataclass
class SearchResult:
    algorithm: str
    found: bool
    state: State | None
    cost: float | None
    nodes_expanded: int
    nodes_generated: int
    max_frontier: int
    runtime_ms: float
    limit_reached: bool = False
    optimal_guarantee: bool = False
    path: list[int] = field(default_factory=list)

    def summary(self, problem: LandProblem) -> dict[str, Any]:
        production = problem.production(self.state.allocation) if self.state else None
        return {
            "algorithm": self.algorithm, "found": self.found, "cost": _r(self.cost),
            "objective_value": _r(production if problem.objective == "max_production"
                                  else (self.state.water_used if self.state else None)),
            "production": _r(production), "water_used_l": _r(self.state.water_used if self.state else None),
            "allocation": list(self.state.allocation) if self.state else None,
            "nodes_expanded": self.nodes_expanded, "nodes_generated": self.nodes_generated,
            "max_frontier": self.max_frontier, "runtime_ms": round(self.runtime_ms, 2),
            "limit_reached": self.limit_reached, "optimal_guarantee": self.optimal_guarantee,
        }


def _r(x: float | None) -> float | None:
    return None if x is None else round(x, 3)


def best_first(problem: LandProblem, priority: Callable[[float, float], float], name: str,
               use_h: bool, optimal: bool, node_limit: int = DEFAULT_NODE_LIMIT) -> SearchResult:
    h = heuristic_for(problem) if use_h else (lambda p, s: 0.0)
    start = problem.initial_state()
    t0 = time.perf_counter()
    counter = itertools.count()
    h0 = h(problem, start)
    if h0 == INFEASIBLE:
        return SearchResult(name, False, None, None, 0, 1, 1, (time.perf_counter() - t0) * 1000,
                            optimal_guarantee=optimal)
    frontier: list[tuple[float, int, float, State]] = [(priority(0.0, h0), next(counter), 0.0, start)]
    best_g: dict[tuple[int, int, int], float] = {problem.state_key(start): 0.0}
    expanded = generated = 0
    max_frontier = 1
    while frontier:
        _, _, g, s = heapq.heappop(frontier)
        if g > best_g.get(problem.state_key(s), float("inf")) + 1e-9:
            continue  # stale entry
        if problem.is_goal(s):
            return SearchResult(name, True, s, g, expanded, generated, max_frontier,
                                (time.perf_counter() - t0) * 1000, optimal_guarantee=optimal,
                                path=list(s.allocation))
        if s.index >= len(problem.crops):
            continue  # complete but not a goal (target not reached)
        expanded += 1
        if expanded > node_limit:
            return SearchResult(name, False, None, None, expanded, generated, max_frontier,
                                (time.perf_counter() - t0) * 1000, limit_reached=True,
                                optimal_guarantee=optimal)
        for n in problem.actions(s):
            s2 = problem.result(s, n)
            g2 = g + problem.step_cost(s, n, s2)
            k = problem.state_key(s2)
            if g2 + 1e-9 >= best_g.get(k, float("inf")):
                continue
            h2 = h(problem, s2)
            if h2 == INFEASIBLE:
                continue
            best_g[k] = g2
            generated += 1
            heapq.heappush(frontier, (priority(g2, h2), next(counter), g2, s2))
        max_frontier = max(max_frontier, len(frontier))
    return SearchResult(name, False, None, None, expanded, generated, max_frontier,
                        (time.perf_counter() - t0) * 1000, optimal_guarantee=optimal)


def astar(problem: LandProblem, node_limit: int = DEFAULT_NODE_LIMIT) -> SearchResult:
    return best_first(problem, lambda g, h: g + h, "astar", True, True, node_limit)


def ucs(problem: LandProblem, node_limit: int = DEFAULT_NODE_LIMIT) -> SearchResult:
    return best_first(problem, lambda g, h: g, "ucs", False, True, node_limit)


def greedy(problem: LandProblem, node_limit: int = DEFAULT_NODE_LIMIT) -> SearchResult:
    return best_first(problem, lambda g, h: h, "greedy", True, False, node_limit)


def bfs(problem: LandProblem, node_limit: int = DEFAULT_NODE_LIMIT) -> SearchResult:
    t0 = time.perf_counter()
    start = problem.initial_state()
    if problem.is_goal(start):
        return SearchResult("bfs", True, start, 0.0, 0, 1, 1, 0.0)
    frontier: deque[tuple[State, float]] = deque([(start, 0.0)])
    reached = {problem.state_key(start)}
    expanded = generated = 0
    max_frontier = 1
    while frontier:
        s, g = frontier.popleft()
        expanded += 1
        if expanded > node_limit:
            return SearchResult("bfs", False, None, None, expanded, generated, max_frontier,
                                (time.perf_counter() - t0) * 1000, limit_reached=True)
        for n in problem.actions(s):
            s2 = problem.result(s, n)
            g2 = g + problem.step_cost(s, n, s2)
            generated += 1
            if problem.is_goal(s2):  # early goal test (R&N Fig. 3.9)
                return SearchResult("bfs", True, s2, g2, expanded, generated, max_frontier,
                                    (time.perf_counter() - t0) * 1000, path=list(s2.allocation))
            if problem.state_key(s2) not in reached:
                reached.add(problem.state_key(s2))
                frontier.append((s2, g2))
        max_frontier = max(max_frontier, len(frontier))
    return SearchResult("bfs", False, None, None, expanded, generated, max_frontier,
                        (time.perf_counter() - t0) * 1000)


ALGORITHMS: dict[str, Callable[..., SearchResult]] = {"astar": astar, "ucs": ucs, "greedy": greedy,
                                                      "bfs": bfs}
