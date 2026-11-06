"""Land distribution search: optimality of A*, admissibility of h, algorithm behaviour."""

import random

import pytest

from app.optimization.land_distribution.heuristics import INFEASIBLE, heuristic_for
from app.optimization.land_distribution.problem import CropOption, LandProblem
from app.optimization.land_distribution.search import astar, bfs, greedy, ucs


def random_problem(rng: random.Random, objective: str, max_units: int = 14, max_crops: int = 4) -> LandProblem:
    m, n = rng.randint(2, max_crops), rng.randint(4, max_units)
    crops = [CropOption(f"c{i}", f"c{i}", rng.uniform(500, 5000), rng.uniform(1, 50), rng.choice([0, 0, 1]),
                        rng.choice([None, 4, 8])) for i in range(m)]
    target = rng.uniform(10, 150) if objective == "min_water" else None
    return LandProblem(crops, n, 10, rng.uniform(0.2, 1.0) * n * 3000, objective, target)


@pytest.mark.parametrize("objective", ["max_production", "min_water"])
def test_astar_matches_ucs_and_expands_no_more_nodes(objective):
    rng = random.Random(42)
    for _ in range(60):
        p = random_problem(rng, objective)
        a, u = astar(p), ucs(p)
        assert a.found == u.found
        if a.found:
            assert a.cost == pytest.approx(u.cost)
            assert a.nodes_expanded <= u.nodes_expanded


@pytest.mark.parametrize("objective", ["max_production", "min_water"])
def test_heuristic_is_admissible_on_every_reachable_state(objective):
    """h(s) ≤ true optimal cost-to-go computed by exhaustive UCS from s."""
    rng = random.Random(7)
    for _ in range(15):
        p = random_problem(rng, objective, max_units=8, max_crops=3)
        h = heuristic_for(p)
        stack, seen = [p.initial_state()], set()
        while stack:
            s = stack.pop()
            if p.state_key(s) in seen:
                continue
            seen.add(p.state_key(s))
            sub = LandProblem(p.crops, p.total_units, p.unit_area_m2, p.water_available_l, p.objective,
                              p.production_target)
            # exact remaining cost via UCS from s
            best = _exact_cost_to_go(sub, s)
            hv = h(p, s)
            if best is None:
                continue
            assert hv != INFEASIBLE and hv <= best + 1e-6
            stack.extend(p.result(s, n) for n in p.actions(s))


def _exact_cost_to_go(p, s):
    best = None

    def dfs(state, g):
        nonlocal best
        if p.is_goal(state):
            best = g if best is None else min(best, g)
            return
        for n in p.actions(state):
            s2 = p.result(state, n)
            dfs(s2, g + p.step_cost(state, n, s2))

    dfs(s, 0.0)
    return best


def test_bfs_and_greedy_are_not_guaranteed_optimal():
    crops = [CropOption("t", "Tomato", 4500, 60, 1, 8), CropOption("w", "Wheat", 2800, 12, 0, None),
             CropOption("d", "Date", 9000, 40, 0, 4), CropOption("a", "Alfalfa", 8000, 25, 0, None)]
    p = LandProblem(crops, 20, 500, 90000)
    a, b, g = astar(p), bfs(p), greedy(p)
    assert a.found and b.found and g.found
    assert p.production(b.state.allocation) < p.production(a.state.allocation)
    assert p.production(g.state.allocation) <= p.production(a.state.allocation)
    assert a.optimal_guarantee and not b.optimal_guarantee and not g.optimal_guarantee


def test_infeasible_minimums_are_explained():
    p = LandProblem([CropOption("x", "X", 5000, 10, 5, None)], 4, 10, 1e9)
    assert "exceed the available land" in p.infeasibility_reason()
    q = LandProblem([CropOption("x", "X", 5000, 10, 2, None)], 4, 10, 6000)
    assert "only" in q.infeasibility_reason()
    assert not astar(q).found
