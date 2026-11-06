# Hydroponics

Hydroponics is a core module of WO. It is integrated with water management (every record is also a water record),
the knowledge-based agent (rules `R-HYD-*`), alerts, recommendations, the dashboard, analytics and the chatbot.

**Soil equations are never applied to hydroponic systems.** There is no ET-based estimate: water management is a
**measured water balance** over each record period, and nutrient-solution checks use **ranges configured per system**.

| Part | Code |
|---|---|
| Model | `backend/app/models/hydroponics.py` (`HydroponicSystem`, `HydroponicRecord`), `models/crop.py::HydroponicProfile` |
| Water balance | `backend/app/agronomy/hydro_balance.py::compute_balance` |
| Perception | `backend/app/ai/perception/hydroponics.py::perceive_hydroponics` |
| Service | `backend/app/services/hydro_service.py` |
| API | `/api/hydroponics…` (see [api.md](api.md#hydroponics)) |
| UI | `frontend/src/pages/HydroponicsPage.tsx`, `HydroSystemPage.tsx`, `components/hydro/HydroVisuals.tsx` (reservoir gauge, water-flow diagram), `components/forms/HydroSystemModal.tsx` |

## 1. Systems

| Field | Notes |
|---|---|
| `system_type` | `NFT`, `DWC`, `EBB_FLOW`, `DRIP`, `WICK`, `AEROPONICS`, `RAFT`, `SUBSTRATE` |
| `farm_id`, `name`, optional `crop_id` | |
| `growing_area_m2` (> 0), `plant_count` (≥ 0), `reservoir_capacity_l` (> 0) | database check constraints |
| `is_closed_loop` (default true), `status` (`active`, `inactive`, `maintenance`) | |
| `ph_min`, `ph_max` (0–14), `ec_min`, `ec_max` (0–20 mS/cm) | optional; min < max is enforced by the schema, the service and database checks (`ph_order`, `ec_order`) |
| `threshold_source` | where the configured range comes from |

Creating or editing a system requires `farm.update` permission; deleting requires `farm.delete`; adding a record
requires `record.create` (see [security.md](security.md)).

### 1.1 Reference profile

Ranges can be typed in or applied from a reference profile (`profile_code` in the create/update request copies the
four bounds and sets `threshold_source` to the profile's source). The knowledge base ships one profile:

| Code | pH | EC (mS/cm) | Source | Note |
|---|---|---|---|---|
| `lettuce_cornell` | 5.6 – 6.0 | 1.15 – 1.25 | Cornell CEA Hydroponic Lettuce Handbook (Brechner & Both, 2013) | pH 5.8 optimum (5.6–6.0 acceptable); EC 1150–1250 µS/cm *above source water*. Set-points are for the handbook's NFT/raft system; verify for your system. |

**Missing-range rule.** If a bound is not configured, the corresponding percept (`ph_below_range`, `ph_above_range`,
`ec_below_range`, `ec_above_range`) is **unknown** — reason *"pH minimum not configured"* etc. — so no range alert can
fire and the evaluation reports the configured range as missing data (`ph_range` / `ec_range`).

## 2. Records and the water balance

A record (`HydroRecordCreate`) covers a period of `period_days` (0–31, default 1) and holds:
`water_input_l` (required), and optionally `water_consumed_l`, `water_recycled_l`, `water_discharged_l`,
`water_losses_l` (measured), `reservoir_start_l`, `reservoir_end_l`, `ph`, `ec`, `water_temp_c`, `notes`.

### 2.1 Balance equation

```text
Input = Consumed + Discharged + ΔStorage + Losses_measured + Unaccounted
ΔStorage = reservoir_end − reservoir_start
```

`compute_balance` returns:

| Output | Formula | Computed when |
|---|---|---|
| `delta_storage_l` | end − start | both reservoir levels recorded |
| `unaccounted_l` | Input − Consumed − Discharged − ΔStorage − (Losses or 0) | consumed, discharged **and** both reservoir levels recorded |
| `unaccounted_fraction` | Unaccounted / Input | as above and Input > 0 |
| `recirculation_ratio` | Recycled / (Recycled + Discharged) | recycled and discharged recorded, sum > 0 |
| `input_per_day_l` | Input / period_days | always |
| `input_per_plant_day_l` | per day / plant_count | plant_count > 0 |
| `input_per_m2_day_l` | per day / growing area | area > 0 |
| `missing_terms` | list of missing balance terms | always |

**Missing terms are reported, never assumed.** Measured losses are optional and count as 0 when absent; the other
terms are required for the unaccounted water.

### 2.2 Example (computed with `compute_balance`)

Illustrative record: 1 day, input 120 L, consumed 80 L, recycled 300 L, discharged 10 L, losses 5 L, reservoir 400 →
420 L; system with 200 plants on 20 m².

| Output | Value |
|---|---|
| ΔStorage | 20 L |
| Unaccounted | 120 − 80 − 10 − 20 − 5 = **5 L** |
| Unaccounted fraction | 0.0417 (4.17 % — below the 10 % policy limit, so `hydro_unaccounted_high` is false) |
| Recirculation ratio | 300 / 310 = 0.9677 |
| Input per day / per plant / per m² | 120 L · 0.6 L · 6.0 L |

The same record without recycled, discharged and end-level values gives `unaccounted_l = null`,
`recirculation_ratio = null` and `missing_terms = ["reservoir_start_l/reservoir_end_l", "water_discharged_l"]`.

### 2.3 What adding a record does (`hydro_service.add_record`)

1. rejects a record more than 5 minutes in the future, and a `reservoir_end_l` above 1.05 × capacity (`422`);
2. stores the `hydroponic_records` row;
3. **integrates with water management**: inserts a `water_records` row (`record_type = "hydroponic"`, volume =
   input, source = the farm's water source or `other`, note *"Input from hydroponic record"*), so dashboards and
   analytics include hydroponic water;
4. writes an audit entry `hydro_record.create`;
5. runs the KB agent (`evaluate_system`, below);
6. creates/auto-resolves alerts for the hydroponic `alert_*` rules with scope `system:<id>`;
7. if the primary action is a corrective advice (not `hydro_status_ok`), stores a `recommendations` row with
   `kind = "hydroponic"` and the explanation's `data_quality` (`"measured"`).

The response contains the record, the balance (`to_dict`), the full explanation (`evaluation`) and `alerts_created`.

`GET /api/hydroponics/{id}/balance` returns every record's balance, totals over all records (input, consumed,
recycled, discharged, losses, days, input/day, input/plant/day and the overall recirculation ratio), the configured
ranges (with `configured = true` only when all four bounds exist) and a fresh evaluation.

## 3. KB evaluation

`hydro_service.evaluate_system` builds the percepts with `perceive_hydroponics` from the latest record, its balance
and the history (input per day of all records), then runs `KBAgent(kb, ("hydroponics",))` with
`primary_symbols = HYDRO_PRIMARY`, goal `hydro_status_ok` and `data_quality = "measured"`. Hydroponic explanations
are based only on recorded measurements, never on weather, so every one of them reports `data_quality = "measured"`.

| Percept | Rule(s) when true | Output |
|---|---|---|
| `ph_below_range` | `R-HYD-001` (alert, warning), `R-HYD-011` | `alert_ph_low`, `advise_raise_ph` |
| `ph_above_range` | `R-HYD-002` (alert, warning), `R-HYD-010` | `alert_ph_high`, `advise_lower_ph` |
| `ec_below_range` | `R-HYD-003` (alert, warning), `R-HYD-013` | `alert_ec_low`, `advise_increase_nutrients` |
| `ec_above_range` | `R-HYD-004` (alert, warning), `R-HYD-012` | `alert_ec_high`, `advise_dilute_solution` |
| `closed_loop_discharge` | `R-HYD-005` (alert, warning), `R-HYD-014` | `alert_closed_loop_discharge`, `advise_check_loop_integrity` |
| `hydro_records_missing` | `R-HYD-006` (alert, info) | `alert_hydro_records_missing` |
| `hydro_usage_spike` | `R-HYD-007` (alert, warning) | `alert_hydro_high_consumption` |
| `hydro_unaccounted_high` | `R-HYD-008` (alert, warning), `R-HYD-015` | `alert_hydro_unaccounted_water`, `advise_check_leaks` |
| all four range percepts **known false** | `R-HYD-020` → `R-HYD-021` (with `~closed_loop_discharge`) | `hydro_solution_in_range`, `hydro_status_ok` |

Policy parameters involved: `hydro_missing_record_days` (2), `usage_spike_factor` (1.5) with `min_history_days` (7)
earlier records, `hydro_unaccounted_fraction` (0.10). Rule texts cite `{threshold_source}`, so an alert names where the
range came from.

### 3.1 Real evaluations (computed with the code)

System `NFT-1`, closed loop, active; latest record pH as listed, EC 1.6 mS/cm, discharge 0 L, balance of §2.2:

| Configured ranges | pH | Fired rules | Recommendation | Alert | Certainty |
|---|---|---|---|---|---|
| pH 5.5–6.5, EC 1.2–2.0 | 7.2 | `R-HYD-002`, `R-HYD-010` | `R-HYD-010`: *"Lower the pH of NFT-1 toward 5.50–6.50 (pH-down per supplier guidance) and re-measure."* | `R-HYD-002` warning: *"pH 7.20 is above the configured maximum 6.50 for NFT-1."* | entailed |
| none configured | 7.2 | — | none (*Insufficient data*) | **none** | insufficient_data; missing `ph_range`, `ec_range` |
| pH 5.5–6.5, EC 1.2–2.0 | 6.0 | `R-HYD-020`, `R-HYD-021` | `R-HYD-021`: *"NFT-1: pH and EC are within the configured ranges; no corrective action needed."* | none | entailed |

In all three runs `hydro_usage_spike` is unknown (*"needs at least 7 earlier records"*), which does not block the other
conclusions. The first two rows are the acceptance criterion of the specification (MASTER_PROMPT_v2 §9): pH 7.2 above a
configured maximum of 6.5 produces an explainable alert citing the rule and evidence; with no range configured, no
alert is produced.

## 4. Where hydroponics appears elsewhere

| Place | What is shown |
|---|---|
| Dashboard (`/api/dashboard/summary`) | number of systems and active systems; per system the last pH/EC, last record time and whether the last reading is in range (only when all four bounds and both readings exist); hydroponic water in the last 30 days |
| Analytics (`/api/analytics/overview`) | per-system balance totals next to the monthly water analytics |
| Water analytics | hydroponic water records appear under "Hydroponics" in the per-crop breakdown |
| Chatbot | intent `hydroponic_status` → `evaluate_system`, asks which system when there are several |
| Alerts / Recommendations | rows with `hydroponic_system_id` |
