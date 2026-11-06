# Smart Land Distribution — Search

WO allocates the land of a farm among candidate crops by **searching a state space** (AIMA ch. 3). The main optimiser
is **A\*** with an admissible heuristic derived from a relaxed problem (AIMA §3.6.2); BFS, uniform-cost search and
greedy best-first search are run on the same problem for comparison.

| Part | Code |
|---|---|
| Problem formulation | `backend/app/optimization/land_distribution/problem.py` (`CropOption`, `State`, `LandProblem`) |
| Heuristics (relaxed problems) | `backend/app/optimization/land_distribution/heuristics.py` |
| BFS, UCS, Greedy, A\* | `backend/app/optimization/land_distribution/search.py` |
| Request → problem → result | `backend/app/services/land_service.py` |
| API | `POST /api/land-distribution/optimize`, `GET /api/land-distribution/requests[/{id}]` |
| UI | `frontend/src/pages/LandPage.tsx`, `frontend/src/components/land/LandGrid.tsx` (screenshot `docs/screenshots/land-en.png`) |

---

## 1. From a request to a search problem

`land_service.build_problem` converts a `LandRequest` (`backend/app/schemas/land.py`):

| Request field | Use |
|---|---|
| `total_area_m2`, `num_units` (1–60, default 20) | the land is divided into N equal units of `u = total_area_m2 / num_units` m² |
| `available_water_l` | seasonal water budget W (L) |
| `objective` | `max_production` (default) or `min_water` |
| `production_target_kg` | required for `min_water` |
| `use_value` | maximise value (yield × price) instead of kg; then every candidate needs `price_per_kg` |
| `season_et0_mm_day`, `efficiency` | needed when water is derived from FAO-56 coefficients |
| `candidates` (1–6) | `crop_id` (FAO-56 coefficients) or a custom `name` + `water_l_per_m2`; `yield_kg_per_m2` (user/agronomist input); optional `price_per_kg`, `min_area_m2`, `max_area_m2`, `min_production_kg` |
| `algorithms` | which of `astar`, `ucs`, `greedy`, `bfs` to compare (A\* is always run) |

For each candidate i:

- **water per unit** wᵢ = `water_l_per_m2 × u`. If only `crop_id` is given, `water_l_per_m2` is the FAO-56 seasonal
  gross requirement from `agronomy/fao56.py::seasonal_gross_requirement_l_per_m2`:
  `ET0 × [Kc_ini·L_ini + ½(Kc_ini+Kc_mid)·L_dev + Kc_mid·L_mid + ½(Kc_mid+Kc_end)·L_late] / efficiency`
  (perennials: + Kc_end for the rest of the 365-day year; perennials without stage lengths: Kc_mid × 365);
- **value per unit** pᵢ = `yield_kg_per_m2 × u` (× `price_per_kg` when `use_value`);
- **min_units** = ⌈`min_area_m2` / u⌉, raised to ⌈`min_production_kg` / (yield × u)⌉ if a production target is set;
- **max_units** = ⌊`max_area_m2` / u⌋ (or N when absent); a maximum below the minimum is a `422` error.

---

## 2. Problem formulation (AIMA §3.1)

Crops are decided **one at a time in a fixed order**, which removes permutation symmetry (allocating 3 units of tomato
then 2 of onion is the same as the reverse, so only one order is explored).

| Element | Definition (`problem.py`) |
|---|---|
| **State** | `(i, units_used, water_used, allocation[0..i-1])` — `State(index, units_used, water_used, allocation)` |
| **Initial state** | `(0, 0, 0, ())` |
| **Actions(s)** | every `nᵢ ∈ [minᵢ, maxᵢ]` for crop i such that `units_used + nᵢ + Σ_{j>i} minⱼ ≤ N` and `water_used + nᵢ·wᵢ + Σ_{j>i} minⱼ·wⱼ ≤ W` (the minimums of later crops are reserved, so dead ends are cut early) |
| **Transition** | `Result(s, nᵢ) = (i+1, units_used+nᵢ, water_used+nᵢ·wᵢ, allocation+(nᵢ))` |
| **Goal test** | `i = m` (all crops decided); for `min_water` also `production ≥ target`. Remaining units are fallow. |
| **Step cost — max_production** | `nᵢ·(p_max − pᵢ)`, plus `(N − units_used)·p_max` for the fallow units on the transition into the goal |
| **Step cost — min_water** | `nᵢ·wᵢ` (litres) |

All step costs are ≥ 0 (p_max is the largest pᵢ). For `max_production` the cost of a complete path is

```text
Σᵢ nᵢ(p_max − pᵢ) + (N − Σᵢ nᵢ)·p_max  =  N·p_max − Σᵢ nᵢ·pᵢ  =  N·p_max − Production
```

so **minimising path cost is exactly maximising production** (or value).

Duplicate detection (`state_key`): `max_production` uses `(i, units_used, water_used)` — two such states have identical
futures; `min_water` uses `(i, units_used, production)` — among them the one with less water used (lower g) dominates.
Floats are rounded before hashing.

`problem.infeasibility_reason()` is checked before searching: minimum units exceeding the land, minimum allocations
exceeding the water, or (for `min_water`) a target above the upper bound of achievable production. The service then
returns `status = "infeasible"` with that message and runs no search.

---

## 3. Heuristics and admissibility

### 3.1 max_production: h(s) = U·p_max − UB(s)

Let U = N − units_used be the remaining land units and W' = W − water_used the remaining water at state s, and let
V\*(s) be the largest value any feasible completion from s can still add.

**True remaining cost.** By the identity above, the cheapest completion from s costs
`h*(s) = U·p_max − V*(s)` (or ∞ if no completion exists).

**Upper bound UB(s)** (`heuristics.py::fractional_upper_bound`). Allow *fractional* units (the relaxation). After fixing
the remaining crops' minimum units (base value, base water), the free capacity is filled in two single-resource
relaxations, each respecting the per-crop caps `maxᵢ − minᵢ`:

- **A — drop the water constraint**: fill the free land greedily by value per unit pᵢ;
- **B — drop the land constraint**: fill the free water greedily by value per litre pᵢ/wᵢ.

A greedy fill in density order is the exact optimum of a fractional bounded knapsack with one resource. Every feasible
integer completion is also feasible for relaxation A and for relaxation B, so its value is ≤ the optimum of each, hence
≤ `min(A, B)`. Therefore `UB(s) = base + min(A, B) ≥ V*(s)`.

**Admissibility.** `h(s) = max(0, U·p_max − UB(s)) ≤ U·p_max − V*(s) = h*(s)`, because UB(s) ≥ V*(s) and
h\*(s) ≥ 0 (no unit can produce more than p_max, so V\*(s) ≤ U·p_max). At a goal h = 0 (the fallow cost was already
charged on the last transition). If the remaining minimums do not fit, UB is undefined, h = ∞ and the node is pruned —
safe, because then h\*(s) = ∞ as well. So h never overestimates: **h is admissible**.

### 3.2 min_water: h(s) = mandatory water + cheapest fractional water for the remaining target

`heuristics.py::h_min_water`:

- **mandatory water** = Σ minⱼ·wⱼ over the remaining crops — every completion must allocate these units;
- **need** = target − (production so far + production of the remaining minimums);
- if need > 0: fill `need` with extra units (caps `maxⱼ − minⱼ`, fractional, **land constraint dropped**) in increasing
  order of water per unit of value wⱼ/pⱼ — the exact optimum of this fractional covering problem.

Any feasible integer completion allocates at least the minimums and its extra units provide at least `need` value, so
it uses at least the relaxed optimum of extra water. Hence `h(s) ≤ h*(s)`: **admissible**. A separate land-only
relaxation (most value the free land can still add) returns ∞ when even that cannot reach `need`, which is a sound
dead-end test.

### 3.3 Why A\* is optimal here

`search.py::best_first` is a graph search that keeps the best known g for every state key and **re-opens** a state when
a cheaper path to it is found; stale heap entries are skipped, and the goal test is applied when a node is **popped**.
With an admissible h this returns an optimal solution without requiring consistency (as the module docstring states).
WO therefore reports *"Optimal under the selected objective and constraints."* (`land_service.STATEMENT`) — optimality
is relative to the user's inputs, never a universal claim.

---

## 4. The four algorithms

| Algorithm | Frontier priority | Goal test | Optimal? | Implementation |
|---|---|---|---|---|
| BFS | FIFO queue | on **generation** (early goal test, AIMA Fig. 3.9) | no — all goals are at depth m, so it returns the first complete allocation generated, regardless of cost | `bfs` with a `reached` set |
| UCS | g(n) | on pop | yes (= A\* with h = 0) | `best_first(priority=g)` |
| Greedy best-first | h(n) | on pop | no | `best_first(priority=h)` |
| A\* | f(n) = g(n) + h(n) | on pop | yes (admissible h, re-opening) | `best_first(priority=g+h)` |

Each run reports `found`, `cost`, `objective_value`, `production`, `water_used_l`, `allocation`, `nodes_expanded`,
`nodes_generated`, `max_frontier`, `runtime_ms`, `limit_reached` and `optimal_guarantee`. A node limit of
`DEFAULT_NODE_LIMIT = 200,000` expansions stops a run with `limit_reached = true`.

---

## 5. A real comparison run

The table below was produced by running the real modules (`seasonal_gross_requirement_l_per_m2`, `LandProblem`,
`ALGORITHMS`) on an **example instance**. The crop coefficients are the FAO-56 reference values of the knowledge base;
the yields and area bounds are **illustrative inputs** chosen for this document (in WO they are always entered by the
user). The construction mirrors `land_service.build_problem`.

### 5.1 Instance

- Land: 10,000 m² in N = 20 units of 500 m²; seasonal water W = 4,500,000 L.
- FAO-56 seasonal water with mean ET0 = 5.5 mm/day and efficiency 0.90 (drip).

| Crop | Season (d) | Σ Kc·L | ETc season (mm) | Gross water (L/m²) | Water per unit (L) | Yield (kg/m², illustrative) | Value per unit (kg) | Units min–max |
|---|---|---|---|---|---|---|---|---|
| Tomato | 135 | 123.38 | 678.56 | 753.96 | 376,980 | 6.0 | 3,000 | 2–8 (1,000–4,000 m²) |
| Onion (dry) | 150 | 141.88 | 780.31 | 867.01 | 433,505 | 4.0 | 2,000 | 0–20 |
| Potato | 130 | 117.50 | 646.25 | 718.06 | 359,030 | 3.5 | 1,750 | 0–20 |
| Watermelon | 110 | 85.25 | 468.88 | 520.97 | 260,485 | 3.0 | 1,500 | 0–6 (≤ 3,000 m²) |

### 5.2 Objective `max_production` (p_max = 3,000 kg per unit; h(start) = 27,453.48)

| Algorithm | Allocation (Tom, Oni, Pot, Wat) | Production (kg) | Water used (L) | Path cost | Nodes expanded | Generated | Max frontier | Runtime (ms) | Guarantee |
|---|---|---|---|---|---|---|---|---|---|
| **A\*** | 8, 1, 0, 4 | **32,000** | 4,491,285 | 28,000 | **7** | 35 | 29 | 0.28 | optimal |
| UCS | 8, 1, 0, 4 | **32,000** | 4,491,285 | 28,000 | 271 | 1,181 | 911 | 3.95 | optimal |
| Greedy | 8, 3, 0, 0 | 30,000 | 4,316,355 | 30,000 | 4 | 13 | 10 | 0.22 | none |
| BFS | 2, 0, 0, 0 | 6,000 | 753,960 | 54,000 | 55 | 271 | 217 | 1.13 | none |

Observations:

- A\* and UCS return the same optimal cost (28,000 = 20 × 3,000 − 32,000); A\* expands **7** nodes instead of **271**
  (2.6 %) because h(start) = 27,453.48 is already close to the optimal cost.
- Greedy is fastest but stops at a worse allocation (30,000 kg): it follows h only and ignores the cost already paid.
- BFS returns the first complete allocation it generates — the minimum allocation (tomato's 2 required units) — which
  is feasible but far from optimal; it is a baseline, not an optimiser.
- The optimal allocation uses 13 of 20 units (7 fallow) and leaves 8,715 L of water. Applying the service's
  binding-constraint logic gives `["water", "max_area:Tomato"]`: water is binding (8,715 L is less than one more unit of
  any crop that is not at its maximum) and tomato is at its maximum area.
- Runtimes are single wall-clock measurements in this environment and vary between runs; node counts are
  deterministic.

### 5.3 Objective `min_water` with a production target of 25,000 kg (h(start) = 3,189,496.67)

| Algorithm | Allocation (Tom, Oni, Pot, Wat) | Production (kg) | Water used (L) | Nodes expanded | Generated | Max frontier | Runtime (ms) | Guarantee |
|---|---|---|---|---|---|---|---|---|
| **A\*** | 8, 0, 0, 1 | 25,500 | **3,276,325** | **4** | 21 | 18 | 0.28 | optimal |
| UCS | 8, 0, 0, 1 | 25,500 | **3,276,325** | 115 | 483 | 237 | 3.02 | optimal |
| Greedy | 8, 1, 0, 0 | 26,000 | 3,449,345 | 11 | 32 | 22 | 0.26 | none |
| BFS | 2, 0, 6, 6 | 25,500 | 4,471,050 | 61 | 319 | 224 | 1.28 | none |

With a target of 40,000 kg the same instance is rejected before any search:
*"Even the best allocation reaches at most 32,546.5 (target 40,000.0)."* (`infeasibility_reason`, using the
fractional upper bound).

### 5.4 A\* vs UCS on random instances

As an additional check for this document, 50 random instances were generated (random seed 7; 2–4 crops, 5–20 units,
random water, values, minimums and maximums) and solved with A\* and UCS. 46 were feasible; on **all 46** A\* returned
the same cost as UCS and expanded no more nodes (median ratio of A\* to UCS expansions: 0.283). This is a quick
verification run. The test suite checks the same property on 60 random instances per objective (seed 42), for
both objectives. It also checks admissibility on every reachable state (`backend/tests/test_search.py`, see
[testing.md](testing.md)).

---

## 6. Output of the service

`POST /api/land-distribution/optimize` stores a `land_distribution_requests` row (inputs) and a
`land_distribution_results` row, writes an audit entry `land_distribution.optimize`, and returns:

| Key | Content |
|---|---|
| `status` | `optimal`, `infeasible` or `limit_reached` |
| `statement` | *"Optimal under the selected objective and constraints."* (only when optimal) |
| `message` | the statement, the infeasibility reason, or the limit message |
| `allocation[]` | per crop: `units`, `area_m2`, `water_l`, `production_kg`, `value`, `min_units`, `max_units` |
| `totals` | `units_used`, `fallow_units`, `area_used_m2`, `water_used_l`, `water_available_l`, `water_left_l`, `production_kg`, `objective_value`, `path_cost` |
| `binding_constraints` | any of `land`, `water`, `max_area:<crop>`, `min_target:<crop>` |
| `formulation` | the textual formulation (state, initial state, actions, transition, goal test, step cost, heuristic), units, unit area, p_max and the per-candidate details (water source, FAO-56 seasonal calculation) |
| `comparison[]` | the summary of every algorithm that was run |

Tractability limits are enforced by the schema: at most **60 units** and **6 candidate crops**, plus the 200,000-node
search budget (see [limitations.md](limitations.md)).
