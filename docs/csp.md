# Irrigation Scheduling — Constraint Satisfaction

Once the daily volumes are known (from the irrigation agent or entered by the user), WO can place the irrigation runs
in the day as a **constraint satisfaction problem** (AIMA ch. 6): every run must fit in the allowed window, avoid
blocked hours, and never push the pump beyond its capacity.

| Part | Code |
|---|---|
| CSP model and solver | `backend/app/optimization/scheduling/csp.py` (`IrrigationTask`, `ScheduleSpec`, `IrrigationCSP`) |
| Request handling | `backend/app/services/irrigation_service.py::schedule` |
| API | `POST /api/irrigation/schedule` (`schemas/ai.py::ScheduleRequest` / `ScheduleResponse`) |
| UI | Smart Irrigation → *Schedule* tab (`frontend/src/pages/IrrigationPage.tsx::ScheduleTab`, `components/schedule/GanttTimeline.tsx`; screenshots `docs/screenshots/schedule-solved-en.png`) |

---

## 1. Formulation

### 1.1 Input

| Field | Meaning | Constraint (schema) |
|---|---|---|
| `slot_minutes` | time discretisation | 15, 30 or 60 (default 30) |
| `window_start`, `window_end` | daily window `HH:MM` | default 05:00–21:00; end must be after start |
| `blocked[]` | blocked time ranges (e.g. midday heat) | list of `{start, end}` |
| `pump_capacity_lph` | pump capacity (L/h) | > 0 |
| `daily_limit_l` | optional daily source limit (L) | > 0 |
| `tasks[]` | `{name, farm_crop_id?, volume_l, flow_lph}` | 1–30 tasks |

Each `farm_crop_id` (and `farm_id`) is checked with `Perm.AI_RUN`, so a user cannot schedule plantings of another
company (404). The search budget is the knowledge-base policy fact `csp_max_backtracks` (20,000).

### 1.2 Variables, domains, constraints

| CSP element | Definition |
|---|---|
| **Variables** | one per irrigation task (`t0`, `t1`, …) |
| **Duration** | `dᵢ = max(1, ⌈volumeᵢ / flowᵢ × 60 / slot⌉)` slots |
| **Domains** | start slots s with `first_slot ≤ s ≤ last_slot − dᵢ` such that none of the slots s … s+dᵢ−1 overlaps a blocked range — the **unary constraints are applied as node consistency** (`node_consistent_domain`) |
| **Binary constraint (no-overlap)** | for every pair with `flowᵢ + flowⱼ > capacity`: the two runs must not overlap (`sᵢ + dᵢ ≤ sⱼ` or `sⱼ + dⱼ ≤ sᵢ`). Such pairs are *neighbours* in the constraint graph. |
| **Global constraint (capacity)** | in every slot, the sum of the flows of the active runs ≤ capacity (`fits`) — this also covers groups of three or more runs that are pairwise compatible but too much together |
| **Global constraint (daily limit)** | Σ volumes ≤ `daily_limit_l` — checked once before search |

Pre-checks in `solve()` return `infeasible` immediately with the violated constraint:

| `violated` | Condition | Message |
|---|---|---|
| `daily_limit` | Σ volume > daily limit | *"Total volume … L exceeds the daily source limit … L."* |
| `pump_capacity` | a single task's flow > capacity | *"…: line flow … L/h exceeds pump capacity … L/h."* |
| `window` | a task's domain is empty after node consistency | *"… needs … min, which does not fit in the allowed window outside blocked hours."* |
| `no_overlap` | AC-3 empties a domain | *"AC-3 proved that the pairwise no-overlap constraints cannot all be satisfied in the window."* |

---

## 2. Solver

### 2.1 AC-3 (preprocessing)

`IrrigationCSP.ac3` is AIMA's AC-3 on the binary no-overlap constraints: the queue starts with every arc (Xᵢ, Xⱼ) of
neighbours; `revise` deletes every start of Xᵢ that has no compatible start in Xⱼ; when Xᵢ's domain shrinks, all arcs
(Xₖ, Xᵢ) with k ≠ j are re-queued. An empty domain proves infeasibility. Statistics: `ac3_revisions`, `ac3_pruned`.

### 2.2 Backtracking search

`solve()` then runs recursive backtracking over the AC-3-reduced domains:

| Technique | Implementation |
|---|---|
| **MRV** (minimum remaining values) | `select_var` picks the unassigned task with the smallest current domain … |
| **Degree heuristic** (tie-break) | … then the most unassigned neighbours, then the task key |
| **LCV** (least constraining value) | `lcv` orders the starts by how many values of the other unassigned tasks would no longer fit the capacity profile, then by start time |
| **Consistency check** | a start is tried only if `fits` (capacity in every slot of the run) |
| **Forward checking** | after each assignment, every unassigned task's domain is filtered to the starts that still fit the load profile; an emptied domain causes an immediate backtrack (`fc_pruned` counts removed values) |
| **Budget** | stops with `status="limit_reached"` (`violated="search_limit"`) after `max_backtracks` |

If the search fails without hitting the budget, the result is `infeasible` with `violated="pump_capacity"`.

### 2.3 Output

`ScheduleResponse`: `status` (`solved | infeasible | limit_reached`), `message`, `violated`, `schedule[]` (name, volume,
flow, slots, duration, start, end — sorted by start), `load_profile[]` (load in L/h for every slot of the window and
whether it is blocked), `stats` (`assignments`, `backtracks`, `ac3_revisions`, `ac3_pruned`, `forward_checking_pruned`,
`runtime_ms`) and `formulation` (variables, domains, constraints, heuristics and the neighbour lists). Every call writes
an audit entry `irrigation.schedule`.

---

## 3. Real example runs

The runs below were produced by calling `IrrigationCSP(spec, tasks).solve()` directly. The volumes and flows are
illustrative inputs (the tomato volume is the gross requirement of the worked example in [ai.md](ai.md#10-fully-worked-example-computed-with-the-code)).

### 3.1 Feasible day

Spec: slot 30 min, window 05:00–21:00, blocked 11:00–15:00, pump capacity 1,600 L/h, daily limit 8,000 L.

| Task | Volume (L) | Flow (L/h) | Duration | Neighbours (flow sum > 1,600) |
|---|---|---|---|---|
| Tomato | 1,892.7 | 600 | 7 slots (210 min) | Potato |
| Onion | 1,500 | 800 | 4 slots (120 min) | Potato |
| Potato | 2,400 | 1,200 | 4 slots (120 min) | Tomato, Onion |
| Lettuce | 600 | 400 | 3 slots (90 min) | — |

Result: **solved** — *"All irrigation runs fit within pump capacity, the allowed window and blocked hours."*

| Task | Start–End |
|---|---|
| Tomato | 05:00–08:30 |
| Lettuce | 05:00–06:30 |
| Potato | 09:00–11:00 |
| Onion | 15:00–17:00 |

Domain sizes after node consistency and AC-3: Tomato 12, Onion 18, Potato 18, Lettuce 20. Statistics:
4 assignments, **0 backtracks**, 4 AC-3 revisions, 0 values pruned by AC-3, 11 values pruned by forward checking,
peak load 1,200 L/h, about 1.4 ms. Tomato and Lettuce run together (600 + 400 = 1,000 L/h ≤ 1,600), while Potato is
kept apart from its neighbours.

### 3.2 Daily limit exceeded

Same tasks with `daily_limit_l = 5,000`: **infeasible**, `violated = "daily_limit"` — *"Total volume 6,393 L exceeds the
daily source limit 5,000 L."* No search is performed.

### 3.3 Window too small

Blocked 07:00–19:00 in a 05:00–21:00 window: **infeasible**, `violated = "window"` — *"Tomato needs 210 min, which does
not fit in the allowed window outside blocked hours."* (node consistency leaves Tomato with an empty domain).

### 3.4 AC-3 at work

Tomato and Potato only (they are neighbours), no blocked hours:

| Window | Domains before → after AC-3 | Outcome |
|---|---|---|
| 05:00–11:00 (12 slots) | values removed by AC-3: 7; both domains end with 4 values | solved: Tomato 05:00–08:30, Potato 08:30–10:30; 2 assignments, 0 backtracks |
| 05:00–10:00 (10 slots) | AC-3 removes 4 values and empties Tomato's domain | infeasible, `violated = "no_overlap"` — proved by AC-3 alone, before any search |

In the second case 7 + 4 = 11 slots are needed but only 10 exist; AC-3 detects this without backtracking.
