# Knowledge Base

This document lists the complete reference knowledge that migration `0002_reference_knowledge` loads into the
database. The tables below are **generated from** `backend/app/ai/knowledge_base/reference_data.py`, so they match the
code exactly. Loading is idempotent (`backend/app/ai/knowledge_base/seed.py::seed_reference_knowledge`): a row is
inserted only if its key/code/symbol does not exist yet.

| Content | Count | Table | Source in code |
|---|---|---|---|
| Rules (Horn clauses) | 39 | `knowledge_rules` | `_RULES`, `rule_rows()` |
| Facts — scientific parameters | 4 | `knowledge_facts` (`kind='scientific'`) | `FACTS` |
| Facts — policy thresholds | 12 | `knowledge_facts` (`kind='policy'`) | `FACTS` |
| Facts — axioms | 8 | `knowledge_facts` (`kind='axiom'`) | `axioms()` |
| Percept catalog | 27 | `knowledge_percepts` | `PERCEPTS`, `percept_rows()` |
| FAO-56 reference crops | 32 | `crops` (`is_reference=true`) | `_CROPS`, `crop_rows()` |
| Irrigation methods | 3 | `irrigation_methods` | `IRRIGATION_METHODS` |
| Hydroponic reference profiles | 1 | `hydroponic_profiles` | `HYDRO_PROFILES` |

The knowledge base row itself is named **"WO Core Knowledge Base"** (`knowledge_bases.name`, version 1).

## 1. Sources

The module docstring and constants of `reference_data.py` define the citations used in every `source` column:

| Constant | Citation string stored in the database |
|---|---|
| `FAO56` | FAO-56 (Allen et al., 1998), Tables 11 & 12 |
| `FAO33` | FAO-33 (Doorenbos & Kassam, 1979) via FAO-66 (Steduto et al., 2012) Table 1 |
| `FAOTM4` | FAO Irrigation Water Management Training Manual No. 4, Annex I, Table 8 |
| `FAOTM3` | FAO Training Manual No. 3 (Brouwer & Heibloem, 1986), §3.2 |
| `CORNELL` | Cornell CEA Hydroponic Lettuce Handbook (Brechner & Both, 2013) |

Full references (from the module docstring):

- **FAO56** — Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). *Crop evapotranspiration.* FAO Irrigation and Drainage Paper 56. Tables 11 (stage lengths) and 12 (Kc, h).
- **FAO33** — Doorenbos, J. & Kassam, A.H. (1979). *Yield response to water.* FAO I&D Paper 33, seasonal Ky as summarised in Steduto et al. (2012) FAO I&D Paper 66, Table 1.
- **FAOTM4** — FAO Irrigation Water Management Training Manual No. 4 – *Irrigation Scheduling* (Brouwer et al., 1989), Annex I, Table 8: indicative field application efficiency.
- **FAOTM3** — Brouwer, C. & Heibloem, M. (1986). *Irrigation Water Needs.* FAO Training Manual No. 3, §3.2 effective rainfall.
- **CORNELL** — Brechner, M. & Both, A.J. (2013). *Hydroponic Lettuce Handbook.* Cornell University Controlled Environment Agriculture program.

## 2. Rule language

```
rule       := antecedent "=>" literal
antecedent := literal ("&" literal)*
literal    := symbol | "~" symbol
symbol     := [a-z][a-z0-9_]*
```

`~x` holds only when the percept `x` is **known false**; it does not hold when `x` is unknown. Negative literals are
therefore allowed only on percept symbols (enforced by validation), and the consequent must be a single positive
symbol (enforced by `backend/app/ai/rules/rule.py::parse_head`). See [ai.md](ai.md#3-rule-language-and-known-false-semantics)
for why this keeps the knowledge base in Horn form.

Columns used below: **Group** = `action_group` (rules in the same group are mutually exclusive actions and go through
conflict resolution); **Prio** = `priority` (higher wins); **Sev** = `severity` for alert rules. In the formulas, `∧` is
the `&` of the stored antecedent and `¬` is the stored `~`. Text in `{braces}` is a template variable filled by the
perception layer (`backend/app/ai/perception/base.py::render`; a missing variable renders as `—`).

## 3. Rules

All 39 rules, grouped by `category`.

### 3.1 Irrigation decision rules (`irrigation`) — 8 rules

| Code | Name | Antecedent ⇒ Consequent | Group | Prio | Sev |
|---|---|---|---|---|---|
| `R-IRR-001` | Irrigation demand exists | `et_demand_positive ∧ ¬rain_covers_demand ∧ ¬season_ended ∧ ¬not_yet_planted` ⇒ `irrigation_needed` | — | 50 | — |
| `R-IRR-002` | Full irrigation | `irrigation_needed ∧ water_sufficient` ⇒ `action_full_irrigation` | `irrigation_action` | 50 | — |
| `R-IRR-003` | Deficit irrigation | `irrigation_needed ∧ water_limited ∧ ¬water_critical` ⇒ `action_deficit_irrigation` | `irrigation_action` | 60 | — |
| `R-IRR-004` | Critical water shortage | `irrigation_needed ∧ water_critical` ⇒ `action_critical_supply` | `irrigation_action` | 70 | — |
| `R-IRR-005` | Postpone: rain covers demand | `et_demand_positive ∧ rain_covers_demand ∧ ¬season_ended ∧ ¬not_yet_planted` ⇒ `action_postpone_irrigation` | `irrigation_action` | 80 | — |
| `R-IRR-006` | No irrigation: season ended | `season_ended` ⇒ `action_no_irrigation` | `irrigation_action` | 90 | — |
| `R-IRR-007` | No irrigation: not yet planted | `not_yet_planted` ⇒ `action_no_irrigation` | `irrigation_action` | 90 | — |
| `R-IRR-013` | No irrigation: no evaporative demand | `¬et_demand_positive ∧ ¬season_ended ∧ ¬not_yet_planted` ⇒ `action_no_irrigation` | `irrigation_action` | 85 | — |

<details><summary>Recommendation / explanation templates and sources</summary>

| Code | Recommendation template (EN) | Explanation template (EN) | Source |
|---|---|---|---|
| `R-IRR-001` | — | The crop is in season, ETc ({etc_mm} mm) is positive and effective rain ({p_eff_mm} mm) does not cover it. | FAO-56 water balance: NIR = ETc − P_eff |
| `R-IRR-002` | Irrigate {crop_name} with {gross_l} L today (net {net_l} L at {efficiency_pct}% efficiency). | Available water ({available_l} L) covers the gross requirement ({gross_l} L). | FAO-56; FAO TM4 |
| `R-IRR-003` | Apply the available {available_l} L ({coverage_pct}% of the {gross_l} L requirement) to {crop_name}. | Supply is limited: {available_l} L available vs {gross_l} L required, but above the critical ratio. | Deficit irrigation concept: FAO-66 (Steduto et al., 2012) |
| `R-IRR-004` | Critical shortage: apply the available {available_l} L ({coverage_pct}% of need) and prioritise this planting only if it is the most sensitive. | Available water is below {critical_ratio_pct}% of the gross requirement ({gross_l} L). | WO policy |
| `R-IRR-005` | Postpone irrigating {crop_name}: forecast effective rain ({p_eff_mm} mm) covers today's ETc ({etc_mm} mm). | Effective rain ≥ crop evapotranspiration. | FAO-56 water balance |
| `R-IRR-006` | No irrigation needed: the growing season of {crop_name} has ended ({days_since_planting} days since planting). | Days since planting exceed the FAO-56 season length ({season_length} days). | FAO-56 (Allen et al., 1998), Tables 11 & 12 |
| `R-IRR-007` | No irrigation needed yet: {crop_name} is scheduled to be planted on {planting_date}. | The planting date is in the future. | WO domain model |
| `R-IRR-013` | No irrigation needed today: crop evapotranspiration is zero. | ETc = 0 mm. | FAO-56 |

Every rule also stores `name_ar`, `recommendation_ar` and `explanation_ar` (Arabic versions of the same templates).

</details>

### 3.2 Decision-goal rules (`decision`) — 5 rules

| Code | Name | Antecedent ⇒ Consequent | Group | Prio | Sev |
|---|---|---|---|---|---|
| `R-IRR-008` | Decision: irrigate (full) | `action_full_irrigation` ⇒ `irrigate_today` | — | 50 | — |
| `R-IRR-009` | Decision: irrigate (deficit) | `action_deficit_irrigation` ⇒ `irrigate_today` | — | 50 | — |
| `R-IRR-010` | Decision: irrigate (critical) | `action_critical_supply` ⇒ `irrigate_today` | — | 50 | — |
| `R-IRR-011` | Decision: skip (postpone) | `action_postpone_irrigation` ⇒ `skip_irrigation_today` | — | 50 | — |
| `R-IRR-012` | Decision: skip (no need) | `action_no_irrigation` ⇒ `skip_irrigation_today` | — | 50 | — |

<details><summary>Recommendation / explanation templates and sources</summary>

| Code | Recommendation template (EN) | Explanation template (EN) | Source |
|---|---|---|---|
| `R-IRR-008` | — | Full irrigation implies irrigating today. | WO domain model |
| `R-IRR-009` | — | Deficit irrigation implies irrigating today. | WO domain model |
| `R-IRR-010` | — | Critical-supply irrigation implies irrigating today. | WO domain model |
| `R-IRR-011` | — | Postponing implies no irrigation today. | WO domain model |
| `R-IRR-012` | — | No need implies no irrigation today. | WO domain model |

Every rule also stores `name_ar`, `recommendation_ar` and `explanation_ar` (Arabic versions of the same templates).

</details>

### 3.3 Advisory rules (`advisory`) — 4 rules

| Code | Name | Antecedent ⇒ Consequent | Group | Prio | Sev |
|---|---|---|---|---|---|
| `R-ADV-001` | Avoid peak heat | `irrigate_today ∧ high_evaporative_demand` ⇒ `advise_avoid_midday` | — | 40 | — |
| `R-ADV-002` | Improve irrigation efficiency | `water_limited ∧ low_efficiency_method` ⇒ `advise_improve_efficiency` | — | 40 | — |
| `R-ADV-003` | Protect the sensitive stage | `water_limited ∧ stage_mid ∧ drought_sensitive_crop` ⇒ `advise_protect_sensitive_stage` | — | 45 | — |
| `R-ADV-004` | Refresh weather | `irrigate_today ∧ weather_stale` ⇒ `advise_refresh_weather` | — | 30 | — |

<details><summary>Recommendation / explanation templates and sources</summary>

| Code | Recommendation template (EN) | Explanation template (EN) | Source |
|---|---|---|---|
| `R-ADV-001` | Evaporative demand is high (ET0 {et0_mm} mm/day): irrigate early morning or evening. | ET0 ≥ {high_et0_mm} mm/day. | WO policy (reduce evaporation losses during peak heat) |
| `R-ADV-002` | Water is limited and efficiency is {efficiency_pct}%: a higher-efficiency method (e.g. drip, 90%) would stretch supply. | Efficiency below {low_eff_pct}% while supply is limited. | FAO Irrigation Water Management Training Manual No. 4, Annex I, Table 8 |
| `R-ADV-003` | {crop_name} is mid-season and drought-sensitive (Ky = {ky}): give it priority when sharing limited water. | Ky > 1 means yield falls proportionally more than water use; mid-season is the most sensitive period. | FAO-33 (Doorenbos & Kassam, 1979) via FAO-66 (Steduto et al., 2012) Table 1 |
| `R-ADV-004` | The weather snapshot is {weather_age_h} h old: refresh it before irrigating. | Snapshot older than {stale_hours} h. | WO policy |

Every rule also stores `name_ar`, `recommendation_ar` and `explanation_ar` (Arabic versions of the same templates).

</details>

### 3.4 Farm alert rules (`alert`) — 6 rules

| Code | Name | Antecedent ⇒ Consequent | Group | Prio | Sev |
|---|---|---|---|---|---|
| `R-ALR-001` | Weather unavailable | `¬weather_available` ⇒ `alert_weather_unavailable` | — | 50 | warning |
| `R-ALR-002` | Weather snapshot is stale | `weather_stale` ⇒ `alert_weather_stale` | — | 40 | info |
| `R-ALR-003` | Unusually high water use | `usage_spike` ⇒ `alert_high_usage` | — | 60 | warning |
| `R-ALR-004` | Missing water records | `records_missing` ⇒ `alert_missing_records` | — | 30 | info |
| `R-ALR-005` | Water shortage | `irrigation_needed ∧ water_limited` ⇒ `alert_water_shortage` | — | 60 | warning |
| `R-ALR-006` | Irrigation needs attention | `action_critical_supply` ⇒ `alert_irrigation_attention` | — | 80 | critical |

<details><summary>Recommendation / explanation templates and sources</summary>

| Code | Recommendation template (EN) | Explanation template (EN) | Source |
|---|---|---|---|
| `R-ALR-001` | — | No valid weather snapshot exists for this farm, and the provider could not be reached. | WO policy |
| `R-ALR-002` | — | The latest weather snapshot is {weather_age_h} h old (limit {stale_hours} h). | WO policy |
| `R-ALR-003` | — | Use on {usage_date} was {usage_day_l} L, above {spike_factor} × the trailing median ({median_l} L). | WO policy |
| `R-ALR-004` | — | No water record for {planting_label} in the last {missing_days} days. | WO policy |
| `R-ALR-005` | — | Available water ({available_l} L) is below today's requirement ({gross_l} L) for {crop_name}. | WO policy |
| `R-ALR-006` | — | Critical supply for {crop_name}: only {coverage_pct}% of the requirement is available. | WO policy |

Every rule also stores `name_ar`, `recommendation_ar` and `explanation_ar` (Arabic versions of the same templates).

</details>

### 3.5 Hydroponic rules (`hydroponics`) — 16 rules

| Code | Name | Antecedent ⇒ Consequent | Group | Prio | Sev |
|---|---|---|---|---|---|
| `R-HYD-001` | pH below range | `ph_below_range` ⇒ `alert_ph_low` | — | 60 | warning |
| `R-HYD-002` | pH above range | `ph_above_range` ⇒ `alert_ph_high` | — | 60 | warning |
| `R-HYD-003` | EC below range | `ec_below_range` ⇒ `alert_ec_low` | — | 60 | warning |
| `R-HYD-004` | EC above range | `ec_above_range` ⇒ `alert_ec_high` | — | 60 | warning |
| `R-HYD-005` | Discharge from a closed loop | `closed_loop_discharge` ⇒ `alert_closed_loop_discharge` | — | 55 | warning |
| `R-HYD-006` | Missing hydroponic records | `hydro_records_missing` ⇒ `alert_hydro_records_missing` | — | 30 | info |
| `R-HYD-007` | High hydroponic consumption | `hydro_usage_spike` ⇒ `alert_hydro_high_consumption` | — | 55 | warning |
| `R-HYD-008` | Unaccounted hydroponic water | `hydro_unaccounted_high` ⇒ `alert_hydro_unaccounted_water` | — | 55 | warning |
| `R-HYD-010` | Lower pH | `ph_above_range` ⇒ `advise_lower_ph` | — | 50 | — |
| `R-HYD-011` | Raise pH | `ph_below_range` ⇒ `advise_raise_ph` | — | 50 | — |
| `R-HYD-012` | Dilute the solution | `ec_above_range` ⇒ `advise_dilute_solution` | — | 50 | — |
| `R-HYD-013` | Increase nutrients | `ec_below_range` ⇒ `advise_increase_nutrients` | — | 50 | — |
| `R-HYD-014` | Check loop integrity | `closed_loop_discharge` ⇒ `advise_check_loop_integrity` | — | 45 | — |
| `R-HYD-015` | Check for leaks | `hydro_unaccounted_high` ⇒ `advise_check_leaks` | — | 45 | — |
| `R-HYD-020` | Solution within range | `¬ph_below_range ∧ ¬ph_above_range ∧ ¬ec_below_range ∧ ¬ec_above_range` ⇒ `hydro_solution_in_range` | — | 50 | — |
| `R-HYD-021` | System status OK | `hydro_solution_in_range ∧ ¬closed_loop_discharge` ⇒ `hydro_status_ok` | — | 50 | — |

<details><summary>Recommendation / explanation templates and sources</summary>

| Code | Recommendation template (EN) | Explanation template (EN) | Source |
|---|---|---|---|
| `R-HYD-001` | — | pH {ph} is below the configured minimum {ph_min} for {system_name}. | {threshold_source} |
| `R-HYD-002` | — | pH {ph} is above the configured maximum {ph_max} for {system_name}. | {threshold_source} |
| `R-HYD-003` | — | EC {ec} mS/cm is below the configured minimum {ec_min} for {system_name}. | {threshold_source} |
| `R-HYD-004` | — | EC {ec} mS/cm is above the configured maximum {ec_max} for {system_name}. | {threshold_source} |
| `R-HYD-005` | — | {system_name} is configured as closed-loop but reports {discharged_l} L discharged. | WO domain model |
| `R-HYD-006` | — | No record for {system_name} in the last {missing_days} days. | WO policy |
| `R-HYD-007` | — | Input of {input_per_day_l} L/day is above {spike_factor} × the trailing median ({median_l} L/day). | WO policy |
| `R-HYD-008` | — | {unaccounted_l} L ({unaccounted_pct}% of input) is not accounted for in the water balance. | WO policy |
| `R-HYD-010` | Lower the pH of {system_name} toward {ph_min}–{ph_max} (pH-down per supplier guidance) and re-measure. | pH above the configured range. | {threshold_source} |
| `R-HYD-011` | Raise the pH of {system_name} toward {ph_min}–{ph_max} (pH-up per supplier guidance) and re-measure. | pH below the configured range. | {threshold_source} |
| `R-HYD-012` | EC is high: top up {system_name} with source water to bring EC toward {ec_min}–{ec_max} mS/cm. | EC above the configured range. | {threshold_source} |
| `R-HYD-013` | EC is low: add nutrient concentrate to {system_name} to reach {ec_min}–{ec_max} mS/cm. | EC below the configured range. | {threshold_source} |
| `R-HYD-014` | Inspect {system_name} for overflow, drain valves or a configuration error (closed loop reporting discharge). | Closed-loop system with discharge > 0. | WO domain model |
| `R-HYD-015` | Check {system_name} for leaks or unrecorded water use ({unaccounted_l} L unaccounted). | Unaccounted share above policy limit. | WO policy |
| `R-HYD-020` | — | pH and EC are inside the configured ranges. | {threshold_source} |
| `R-HYD-021` | {system_name}: pH and EC are within the configured ranges; no corrective action needed. | Solution in range and loop consistent. | WO domain model |

Every rule also stores `name_ar`, `recommendation_ar` and `explanation_ar` (Arabic versions of the same templates).

</details>

### 3.6 How the rules chain

```
percepts ──R-IRR-001──▶ irrigation_needed ──R-IRR-002/003/004──▶ action_* ──R-IRR-008/009/010──▶ irrigate_today
percepts ──R-IRR-005/006/007/013──────────────────────────────────▶ action_* ──R-IRR-011/012──────▶ skip_irrigation_today
irrigate_today ∧ percept ──R-ADV-001/004──▶ advise_*        irrigation_needed ∧ water_limited ──R-ALR-005──▶ alert_water_shortage
action_critical_supply ──R-ALR-006──▶ alert_irrigation_attention
hydro percepts ──R-HYD-001…008──▶ alert_*   ──R-HYD-010…015──▶ advise_*   ──R-HYD-020──▶ hydro_solution_in_range ──R-HYD-021──▶ hydro_status_ok
```

Only one action group exists: `irrigation_action` (7 rules). Its members are `R-IRR-002`, `R-IRR-003`, `R-IRR-004`,
`R-IRR-005`, `R-IRR-006`, `R-IRR-007` and `R-IRR-013`. `R-IRR-006`, `R-IRR-007` and `R-IRR-013` share the same consequent
(`action_no_irrigation`), so validation does not compare them with each other.

Which rules each service loads (`backend/app/ai/agent.py`):

| Constant | Categories | Used by |
|---|---|---|
| `IRRIGATION_CATEGORIES` | irrigation, decision, advisory, alert | `irrigation_service.recommend` |
| `ALERT_CATEGORIES` | alert | `alert_service` (weather, usage spike, missing records) |
| `HYDRO_CATEGORIES` | hydroponics | `hydro_service.evaluate_system` |

For hydroponics there is no action group; the primary recommendation is the first derived symbol of
`HYDRO_PRIMARY` = `advise_lower_ph`, `advise_raise_ph`, `advise_dilute_solution`, `advise_increase_nutrients`, `advise_check_loop_integrity`, `advise_check_leaks`, `hydro_status_ok`.

## 4. Facts (parameters)

`knowledge_facts.kind` is one of `scientific` (must cite a source), `policy` (an operator decision, labelled "WO policy"
and configurable) or `axiom` (a propositional background constraint).

### 4.1 Scientific parameters

| Key | Value | Unit | Category | Meaning | Source |
|---|---|---|---|---|---|
| `effective_rainfall_fraction` | 0.8 | fraction | irrigation | Share of forecast precipitation treated as effective (P_eff = f × P). | FAO Training Manual No. 3 (Brouwer & Heibloem, 1986), §3.2 — the 0.8 coefficient of the dependable-rainfall formula, applied here as a simplified daily fraction (configurable). |
| `mm_to_l_per_m2` | 1.0 | L/(mm·m²) | irrigation | 1 mm of water depth over 1 m² equals 1 litre. | Definition: 1 mm × 1 m² = 0.001 m³ = 1 L |
| `kc_ref_rhmin` | 45.0 | % | irrigation | Reference RHmin of FAO-56 Table 12 Kc values (climatic adjustment, Eq. 62). | FAO-56 Eq. 62 |
| `kc_ref_u2` | 2.0 | m/s | irrigation | Reference wind speed at 2 m for Table 12 Kc values (Eq. 62). | FAO-56 Eq. 62 |

### 4.2 Policy thresholds

| Key | Value | Unit | Category | Meaning | Source |
|---|---|---|---|---|---|
| `stale_weather_hours` | 12 | h | weather | A weather snapshot older than this is treated as stale. | WO policy |
| `weather_cache_minutes` | 60 | min | weather | Reuse a snapshot younger than this instead of calling the provider again. | WO policy |
| `critical_supply_ratio` | 0.5 | fraction | irrigation | Available water below this share of the gross requirement is critical. | WO policy |
| `rain_event_min_mm` | 1.0 | mm | weather | Forecast precipitation at or above this amount counts as a rain event. | WO policy |
| `usage_spike_factor` | 1.5 | ×median | water | Daily use above factor × trailing median is unusually high. | WO policy |
| `min_history_days` | 7 | days | water | Minimum days of records before statistics or spike detection are shown. | WO policy |
| `missing_record_days` | 3 | days | water | An active planting with no water record for this many days raises an alert. | WO policy |
| `low_efficiency_threshold` | 0.7 | fraction | irrigation | Irrigation efficiency below this is considered low. | WO policy |
| `high_et0_mm` | 7.0 | mm/day | irrigation | Reference evapotranspiration at or above this is high evaporative demand. | WO policy |
| `hydro_unaccounted_fraction` | 0.1 | fraction | hydroponics | Unaccounted water above this share of input suggests a leak or a recording gap. | WO policy |
| `hydro_missing_record_days` | 2 | days | hydroponics | An active hydroponic system with no record for this many days raises an alert. | WO policy |
| `csp_max_backtracks` | 20000 | count | scheduling | Search budget for the irrigation scheduling CSP. | WO policy |

### 4.3 Axioms

Axioms are stored as formula strings in `knowledge_facts.value` and parsed by `backend/app/ai/logic/syntax.py::parse`
when the knowledge base is loaded (`loader.py::load_knowledge`). They are used by validation and, optionally, by the
Logic Lab (`include_axioms`). Source of all axioms: "WO domain model".

Validation treats two kinds differently (`validation.py::validate_rules`):

- **Domain axioms** mention only percept symbols (7 below). They are part of the background theory.
- **Integrity constraints** mention a derived symbol. The one shipped constraint is `axiom_irrigation_decision`. It
  is never assumed; validation checks that no percept world can violate it, and reports `integrity_violation`
  with a witness when one can.

See [logic.md §6.1.1](logic.md#611-domain-axioms-vs-integrity-constraints).

| Key | Meaning |
|---|---|
| `axiom_stage_at_least_one` | A planting is always in exactly one stage (at least one). |
| `axiom_stage_exclusive` | A planting is always in exactly one stage (at most one). |
| `axiom_water_partition` | Supply is either sufficient or limited relative to the requirement. |
| `axiom_water_critical` | A critical supply is also a limited supply. |
| `axiom_ph_exclusive` | pH cannot be both below and above the range. |
| `axiom_ec_exclusive` | EC cannot be both below and above the range. |
| `axiom_weather_stale` | Only an existing snapshot can be stale. |
| `axiom_irrigation_decision` | **Integrity constraint** (mentions the derived symbols `irrigate_today`, `skip_irrigation_today`): never irrigate and skip on the same day. |

```text
axiom_stage_at_least_one:
    not_yet_planted | stage_initial | stage_development | stage_mid | stage_late | season_ended
axiom_stage_exclusive:
    ~(not_yet_planted & stage_initial) & ~(not_yet_planted & stage_development) & ~(not_yet_planted & stage_mid) & ~(not_yet_planted & stage_late) & ~(not_yet_planted & season_ended) & ~(stage_initial & stage_development) & ~(stage_initial & stage_mid) & ~(stage_initial & stage_late) & ~(stage_initial & season_ended) & ~(stage_development & stage_mid) & ~(stage_development & stage_late) & ~(stage_development & season_ended) & ~(stage_mid & stage_late) & ~(stage_mid & season_ended) & ~(stage_late & season_ended)
axiom_water_partition:
    water_sufficient <=> ~water_limited
axiom_water_critical:
    water_critical => water_limited
axiom_ph_exclusive:
    ~(ph_below_range & ph_above_range)
axiom_ec_exclusive:
    ~(ec_below_range & ec_above_range)
axiom_weather_stale:
    weather_stale => weather_available
axiom_irrigation_decision:
    ~(irrigate_today & skip_irrigation_today)
```

`axiom_stage_exclusive` is generated with `itertools.combinations` over the six stage symbols
(`not_yet_planted`, `stage_initial`, `stage_development`, `stage_mid`, `stage_late`, `season_ended`), giving 15 pairwise exclusions.

## 5. Percept catalog

Each percept is a symbol the perception layer can observe as true/false, or report as unknown. `depends_on` lists the
data items that must be present; `threshold_key` names the fact that holds its threshold (if any).

| Symbol | Category | True when | Depends on | Threshold fact |
|---|---|---|---|---|
| `weather_available` | weather | A valid weather snapshot exists for the farm. | weather | — |
| `weather_stale` | weather | The latest snapshot is older than the staleness limit. | weather | `stale_weather_hours` |
| `not_yet_planted` | stage | The planting date is in the future. | planting_date | — |
| `stage_initial` | stage | Crop is in the initial stage (FAO-56). | planting_date | — |
| `stage_development` | stage | Crop is in the development stage. | planting_date | — |
| `stage_mid` | stage | Crop is in the mid-season stage (flowering / yield formation). | planting_date | — |
| `stage_late` | stage | Crop is in the late-season stage. | planting_date | — |
| `season_ended` | stage | The growing season has ended. | planting_date | — |
| `et_demand_positive` | irrigation | Crop evapotranspiration ETc is above zero. | et0, planting_date | — |
| `rain_covers_demand` | irrigation | Effective rain covers the crop demand (P_eff ≥ ETc). | precipitation, et0, planting_date | `effective_rainfall_fraction` |
| `rain_expected` | weather | Forecast precipitation reaches the rain-event threshold. | precipitation | `rain_event_min_mm` |
| `water_sufficient` | water_supply | Available water ≥ gross irrigation requirement. | available_water, et0, planting_date | — |
| `water_limited` | water_supply | Available water < gross irrigation requirement. | available_water, et0, planting_date | — |
| `water_critical` | water_supply | Available water < critical ratio × gross requirement. | available_water, et0, planting_date | `critical_supply_ratio` |
| `drought_sensitive_crop` | crop | Seasonal yield response factor Ky > 1 (FAO-33). | crop_ky | — |
| `low_efficiency_method` | irrigation | Irrigation efficiency is below the low-efficiency limit. | irrigation_efficiency | `low_efficiency_threshold` |
| `high_evaporative_demand` | weather | ET0 is at or above the high-demand limit. | et0 | `high_et0_mm` |
| `usage_spike` | water | Today's use exceeds factor × trailing median. | water_records | `usage_spike_factor` |
| `records_missing` | water | An active planting has no recent water record. | water_records | `missing_record_days` |
| `ph_below_range` | hydroponics | Latest pH is below the configured minimum. | ph, ph_range | — |
| `ph_above_range` | hydroponics | Latest pH is above the configured maximum. | ph, ph_range | — |
| `ec_below_range` | hydroponics | Latest EC is below the configured minimum. | ec, ec_range | — |
| `ec_above_range` | hydroponics | Latest EC is above the configured maximum. | ec, ec_range | — |
| `closed_loop_discharge` | hydroponics | A closed-loop system reports discharged water. | hydro_record | — |
| `hydro_records_missing` | hydroponics | No hydroponic record within the allowed days. | hydro_records | `hydro_missing_record_days` |
| `hydro_usage_spike` | hydroponics | Latest daily input exceeds factor × trailing median. | hydro_records | `usage_spike_factor` |
| `hydro_unaccounted_high` | hydroponics | Unaccounted water exceeds the allowed share of input. | hydro_record | `hydro_unaccounted_fraction` |

## 6. Agronomic reference tables

### 6.1 FAO-56 crops

All rows have `source` = "FAO-56 (Allen et al., 1998), Tables 11 & 12" (plus "; Ky: FAO-33 (Doorenbos & Kassam, 1979) via FAO-66 (Steduto et al., 2012) Table 1" when Ky is given) and a
`source_note` that ends with *"Values are reference starting points; adjust stage lengths to local planting dates and climate."*

| Code | Crop (EN) | Crop (AR) | Kc_ini | Kc_mid | Kc_end | L_ini | L_dev | L_mid | L_late | h (m) | Ky | Perennial | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `tomato` | Tomato | طماطم | 0.6 | 1.15 | 0.8 | 30 | 40 | 40 | 25 | 0.6 | 1.05 | no | Kc_end range 0.70–0.90 (midpoint used). Stages: January planting, arid region. |
| `sweet_pepper` | Sweet pepper (bell) | فلفل حلو | 0.6 | 1.05 | 0.9 | 25 | 35 | 40 | 20 | 0.7 | 1.1 | no | Stages: April/June planting, Europe & Mediterranean. |
| `eggplant` | Eggplant | باذنجان | 0.6 | 1.05 | 0.9 | 30 | 40 | 40 | 20 | 0.8 | — | no | Stages: October planting, arid region. |
| `lettuce` | Lettuce | خس | 0.7 | 1.0 | 0.95 | 20 | 30 | 15 | 10 | 0.3 | — | no | Stages: April planting, Mediterranean. |
| `cabbage` | Cabbage | ملفوف | 0.7 | 1.05 | 0.95 | 40 | 60 | 50 | 15 | 0.4 | 0.95 | no | Stages: September planting, California desert. |
| `broccoli` | Broccoli | بروكلي | 0.7 | 1.05 | 0.95 | 35 | 45 | 40 | 15 | 0.3 | — | no | Stages: September planting, California desert. |
| `cauliflower` | Cauliflower | قرنبيط | 0.7 | 1.05 | 0.95 | 35 | 50 | 40 | 15 | 0.4 | — | no | Stages: September planting, California desert. |
| `carrot` | Carrot | جزر | 0.7 | 1.05 | 0.95 | 20 | 30 | 50 | 20 | 0.3 | — | no | Stages: October planting, arid climate. |
| `spinach` | Spinach | سبانخ | 0.7 | 1.0 | 0.95 | 20 | 20 | 15 | 5 | 0.3 | — | no | Stages: April planting, Mediterranean. |
| `onion_dry` | Onion (dry) | بصل | 0.7 | 1.05 | 0.75 | 15 | 25 | 70 | 40 | 0.4 | 1.1 | no | Stages: April planting, Mediterranean. |
| `cucumber` | Cucumber (fresh market) | خيار | 0.6 | 1.0 | 0.75 | 20 | 30 | 40 | 15 | 0.3 | — | no | Stages: June/August planting, arid region. |
| `zucchini` | Squash / Zucchini | كوسة | 0.5 | 0.95 | 0.75 | 25 | 35 | 25 | 15 | 0.3 | — | no | Stages: April/December planting, Mediterranean & arid. |
| `melon` | Sweet melon | شمام | 0.5 | 1.05 | 0.75 | 25 | 35 | 40 | 20 | 0.4 | — | no | Stages: May planting, Mediterranean. |
| `watermelon` | Watermelon | بطيخ | 0.4 | 1.0 | 0.75 | 20 | 30 | 30 | 30 | 0.4 | 1.1 | no | Stages: April planting, Italy. |
| `potato` | Potato | بطاطس | 0.5 | 1.15 | 0.75 | 25 | 30 | 45 | 30 | 0.6 | 1.1 | no | Kc_ini = roots & tubers group value. Stages: May planting, continental climate. |
| `sweet_potato` | Sweet potato | بطاطا حلوة | 0.5 | 1.15 | 0.65 | 20 | 30 | 60 | 40 | 0.4 | — | no | Kc_ini = group value. Stages: April planting, Mediterranean. |
| `beans_green` | Beans (green) | فاصوليا خضراء | 0.5 | 1.05 | 0.9 | 20 | 30 | 30 | 10 | 0.4 | 1.15 | no | Stages: Feb/March planting, California & Mediterranean. |
| `peas_fresh` | Peas (fresh) | بازلاء | 0.5 | 1.15 | 1.1 | 15 | 25 | 35 | 15 | 0.5 | 1.15 | no | Stages: May planting, Europe. |
| `lentil` | Lentil | عدس | 0.4 | 1.1 | 0.3 | 20 | 30 | 60 | 40 | 0.5 | — | no | Kc_ini = legumes group value. Stages: April planting, Europe. |
| `groundnut` | Groundnut (peanut) | فول سوداني | 0.4 | 1.15 | 0.6 | 25 | 35 | 45 | 25 | 0.4 | 0.7 | no | Kc_ini = group value. Stages: dry season, West Africa. |
| `soybean` | Soybean | فول الصويا | 0.4 | 1.15 | 0.5 | 15 | 15 | 40 | 15 | 0.75 | 0.85 | no | Kc_ini = group value; h range 0.5–1.0 m (midpoint). Stages: December, tropics. |
| `wheat_spring` | Wheat (spring) | قمح | 0.3 | 1.15 | 0.25 | 20 | 25 | 60 | 30 | 1.0 | 1.15 | no | Kc_ini = cereals group value; Kc_end range 0.25–0.4. Stages: March/April, 35–45°N. |
| `barley` | Barley | شعير | 0.3 | 1.15 | 0.25 | 15 | 25 | 50 | 30 | 1.0 | — | no | Kc_ini = group value. Stages: November planting, Central India. |
| `maize_grain` | Maize (grain) | ذرة | 0.3 | 1.2 | 0.6 | 30 | 50 | 60 | 40 | 2.0 | 1.25 | no | Kc_ini = group value; Kc_end 0.60 (harvest at high grain moisture; 0.35 if field-dried). Stages: April planting, East Africa (altitude). |
| `sorghum` | Sorghum (grain) | ذرة رفيعة | 0.3 | 1.05 | 0.55 | 20 | 35 | 40 | 30 | 1.5 | 0.9 | no | Kc_mid range 1.00–1.10 (midpoint); h range 1–2 m. Stages: May/June, USA/Pakistan/Med. |
| `rice` | Rice | أرز | 1.05 | 1.2 | 0.75 | 30 | 30 | 60 | 30 | 1.0 | — | no | Kc_end range 0.90–0.60 (midpoint). Stages: Dec/May, tropics & Mediterranean. |
| `cotton` | Cotton | قطن | 0.35 | 1.175 | 0.6 | 30 | 50 | 60 | 55 | 1.35 | 0.85 | no | Kc_ini = group value; Kc_mid 1.15–1.20 and Kc_end 0.70–0.50 (midpoints); h 1.2–1.5 m. |
| `sunflower` | Sunflower | دوار الشمس | 0.35 | 1.075 | 0.35 | 25 | 35 | 45 | 25 | 2.0 | 0.95 | no | Kc_ini = group value; Kc_mid range 1.00–1.15 (midpoint). |
| `citrus` | Citrus (70% canopy, no ground cover) | حمضيات | 0.7 | 0.65 | 0.7 | 60 | 90 | 120 | 95 | 4.0 | — | yes | Annual cycle (365 d) starting at the cycle start date. Stages: January, Mediterranean. |
| `olive` | Olive (40–60% ground cover) | زيتون | 0.65 | 0.7 | 0.7 | 30 | 90 | 60 | 90 | 4.0 | — | yes | Annual cycle; Kc_end applies after day 270. h range 3–5 m. Stages: March, Mediterranean. |
| `date_palm` | Date palm | نخيل | 0.9 | 0.95 | 0.95 | — | — | — | — | 8.0 | — | yes | No stage lengths in Table 11; Kc_mid used year-round (time-constant approximation). |
| `alfalfa` | Alfalfa (hay, averaged cutting effects) | برسيم | 0.4 | 0.95 | 0.9 | — | — | — | — | 0.7 | 1.1 | yes | Kc_mid used year-round as an upper approximation of the cutting-cycle average. |

Aliases (used by the chatbot entity matcher) are stored in `crops.aliases`, e.g. tomato → بندوره, طماطه, tomatoes.

### 6.2 Irrigation methods

| Code | Name | Efficiency | Source | Note |
|---|---|---|---|---|
| `surface` | Surface (border, furrow, basin) | 0.6 | FAO Irrigation Water Management Training Manual No. 4, Annex I, Table 8 | Indicative field application efficiency. |
| `sprinkler` | Sprinkler | 0.75 | FAO Irrigation Water Management Training Manual No. 4, Annex I, Table 8 | Indicative field application efficiency. |
| `drip` | Drip | 0.9 | FAO Irrigation Water Management Training Manual No. 4, Annex I, Table 8 | Indicative field application efficiency. |

### 6.3 Hydroponic reference profiles

| Code | Name | Crop | pH min | pH max | EC min | EC max | Source | Note |
|---|---|---|---|---|---|---|---|---|
| `lettuce_cornell` | Lettuce — Cornell CEA set-points | lettuce | 5.6 | 6.0 | 1.15 | 1.25 | Cornell CEA Hydroponic Lettuce Handbook (Brechner & Both, 2013) | pH 5.8 optimum (5.6–6.0 acceptable); EC 1150–1250 µS/cm *above source water*. Set-points are for the handbook's NFT/raft system; verify for your system. |

## 7. Editing the knowledge base

Reading the knowledge base (`GET /api/knowledge-base`, `/facts`, `/rules`, `/rules/{id}`, `/rules/{id}/history`,
`/percepts`) and calling `POST /api/knowledge-base/validate` or `POST /api/knowledge-base/ask` is open to every
authenticated user. **Changing** it is restricted to `SUPER_ADMIN`: `kb_service.create_rule`, `update_rule` and
`update_fact` start with `ensure_role(user, {Role.SUPER_ADMIN}, "edit the knowledge base")`, which raises `403 forbidden`
for any other role.

In the UI this is the **Knowledge Base** page (`frontend/src/pages/KnowledgeBasePage.tsx`) with the tabs *Rules*,
*Facts*, *Percepts*, *Validate* and *Logic Lab* (`frontend/src/components/kb/RulesTab.tsx`, `FactsTabs.tsx`,
`ValidationIssues.tsx`, `LogicLab.tsx`). When a save is rejected, the rule dialog shows the validation report returned
in `error.details` (screenshot: `docs/screenshots/kb-rule-validation-en.png`).

### 7.1 Creating a rule — `POST /api/knowledge-base/rules`

Request body (`backend/app/schemas/ai.py::RuleIn`):

| Field | Constraint |
|---|---|
| `code` | regex `^R-[A-Z]{3}-\d{3}$`, unique per knowledge base (else `409 conflict`) |
| `category` | one of `irrigation`, `decision`, `advisory`, `alert`, `hydroponics` |
| `antecedent`, `consequent` | parsed by `rules/rule.py::build_rule` (syntax errors → `422`) |
| `action_group` | optional, ≤ 64 chars |
| `priority` | integer 0–1000 (default 50) |
| `severity` | `info` \| `warning` \| `critical` \| null |
| `name_en/ar`, `explanation_en/ar` | required, 2–200 / 2–2000 chars |
| `recommendation_en/ar`, `source` | optional |
| `is_active` | default `true` |

Processing (`kb_service.create_rule`):

1. role check (SUPER_ADMIN), duplicate-code check, `build_rule` (Horn form: body of literals, single positive head,
   no symbol twice, head not in its own body);
2. **validation gate** — `_validate_candidate` loads the active knowledge base, adds the candidate (only if
   `is_active`) and runs `validation.py::validate_rules`. If the report is not `ok`, the request fails with
   `422 validation_error`, message *"The rule makes the knowledge base invalid."* and the full report in `details`;
3. insert the `knowledge_rules` row (`updated_by_id` = actor);
4. insert a `knowledge_rule_history` row (`version=1`, `change_type="create"`, `snapshot` = all rule fields);
5. write an `audit_logs` row with action `kb.rule_create`.

### 7.2 Editing / (de)activating a rule — `PATCH /api/knowledge-base/rules/{rule_id}`

`RuleUpdate` allows every field except `code` and `category`. `kb_service.update_rule` merges the change into the
current rule, rebuilds it, and validates the knowledge base **with the old version replaced** by the new one
(`replace_code=rule.code`); a deactivated rule is simply removed from the validated set. On success the rule's
`version` is incremented and a history row is written with `change_type` = `update`, `activate` or `deactivate`, plus
an audit row `kb.rule_update` listing the changed field names.

### 7.3 Editing a fact — `PATCH /api/knowledge-base/facts/{fact_id}`

`kb_service.update_fact`:

- **axiom** — the new value must parse as a propositional sentence; after the change the knowledge base must still be
  consistent (`report["consistent"]`), otherwise the transaction is rolled back and `422` is returned. Only
  consistency gates an axiom edit. An `integrity_violation` (or any other error issue) caused by the new axiom is
  visible through `POST /api/knowledge-base/validate` but does not block the edit;
- **scientific / policy** — the value must be a number (booleans are rejected) and `≥ 0`;
- **scientific** — a `source` must exist (either the stored one or a new one in the request);
- `version` is incremented, `updated_by_id` set, and an audit row `kb.fact_update` stores `key`, `old` and `new`.

### 7.4 What the validation gate checks

`POST /api/knowledge-base/validate` runs the same checks on demand (optionally "as if" a candidate rule were added or
replaced). Severity decides whether a change is accepted: `ValidationReport.ok` is `consistent and no error issues`.

| Issue code | Severity | Meaning | Blocks saving? |
|---|---|---|---|
| `negation_on_derived` | error | `~x` used on a symbol that is not a percept | yes |
| `unknown_symbol` | error | a body symbol is neither a percept nor any rule's head | yes |
| `head_is_percept` | error | a rule concludes a percept symbol | yes |
| `inconsistent_kb` | error | domain axioms ∧ Clark completion of the rules is unsatisfiable | yes |
| `integrity_violation` | error | some percept world derives both sides of an integrity constraint (e.g. `irrigate_today` and `skip_irrigation_today`); a witness model is attached | yes |
| `conflict` | error | two rules of one action group, **equal priority**, can fire together | yes |
| `dead_rule` | warning | a rule's body can never be true under the domain axioms and the completion | no |
| `coverage_gap` | warning | a complete world exists where no `irrigation_action` rule fires | no |
| `subsumed_rule` | warning | same head, body is a strict superset of another rule's body | no |
| `overlap_resolved` | info | two group rules can fire together but priorities differ | no |
| `coverage_complete` | info | every complete world reaches an `irrigation_action` decision | no |

"Blocks saving" applies to rule creates and updates. An axiom edit is blocked only by `inconsistent_kb` (§7.3).

The logic behind each check, and the actual report for the reference knowledge base (60 SAT calls, only
`coverage_complete`), are in [logic.md](logic.md#6-knowledge-base-validation).

## 8. Versioning and audit

| Mechanism | Where | What it records |
|---|---|---|
| Rule version | `knowledge_rules.version` | starts at 1, `+1` on every successful update |
| Rule history | `knowledge_rule_history` | one row per create/update/activate/deactivate with a full `snapshot` of the rule fields, `changed_by_id`, `changed_at`; the seed also writes the initial `create` row (with no user) |
| Fact version | `knowledge_facts.version` | `+1` on every successful update; `updated_by_id` |
| Audit log | `audit_logs` | `kb.rule_create`, `kb.rule_update`, `kb.fact_update` (actor, company, entity id, details, IP) |
| Knowledge base version | `knowledge_bases.version` | stays `1`; it is not incremented by rule or fact edits. Explanations report it as `kb_version`. |

Changes take effect on the next request: every service call loads the active knowledge base through
`backend/app/ai/knowledge_base/loader.py::load_knowledge` (only rows with `is_active = true`). Persisted
recommendations keep the full explanation payload that was produced at the time (`recommendations.payload`), so an
old recommendation still shows the rules and thresholds that were used then.

