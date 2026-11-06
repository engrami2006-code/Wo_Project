# Agronomy — FAO-56 Crop Water Requirement

Soil-based irrigation in WO follows **FAO Irrigation and Drainage Paper 56** (Allen, Pereira, Raes & Smith, 1998) with
the **single crop coefficient** method. All functions live in `backend/app/agronomy/fao56.py`; every function returns
its result together with the list of steps (`Step(name, formula, values, result, unit, reference)`), which are stored
with the calculation and shown in the UI (`frontend/src/components/explain/CalculationSteps.tsx`, Water calculations
page).

Hydroponic systems **never** use these equations; they use a measured water balance ([hydroponics.md](hydroponics.md)).

## 1. Sources (as stored in the knowledge base)

| Use | Source string in `reference_data.py` |
|---|---|
| Kc_ini, Kc_mid, Kc_end, stage lengths, crop height | `FAO-56 (Allen et al., 1998), Tables 11 & 12` |
| Seasonal yield-response factor Ky | `FAO-33 (Doorenbos & Kassam, 1979) via FAO-66 (Steduto et al., 2012) Table 1` |
| Irrigation efficiencies (surface 0.60, sprinkler 0.75, drip 0.90) | `FAO Irrigation Water Management Training Manual No. 4, Annex I, Table 8` |
| Effective rainfall fraction 0.8 | `FAO Training Manual No. 3 (Brouwer & Heibloem, 1986), §3.2 — the 0.8 coefficient of the dependable-rainfall formula, applied here as a simplified daily fraction (configurable).` |
| Reference RHmin 45 %, reference u₂ 2 m/s | `FAO-56 Eq. 62` |
| 1 mm × 1 m² = 1 L | `Definition: 1 mm × 1 m² = 0.001 m³ = 1 L` |

The 32 reference crops with their coefficients are listed in [knowledge-base.md §6.1](knowledge-base.md#61-fao-56-crops).
Each crop's `source_note` states that the values are *reference starting points* to be adjusted to local planting dates
and climate.

## 2. Pipeline

```text
planting_date ─▶ growth stage (Table 11) ─▶ Kc(t) (Table 12, Eq. 66) ─▶ [climatic adjustment Eq. 62/65, u₂ by Eq. 47]
ET0 (Open-Meteo FAO Penman-Monteith, or manual) ─▶ ETc = Kc × ET0 ─▶ P_eff = f × P ─▶ NIR = max(0, ETc − P_eff)
NIR × area ─▶ net volume (L) ─▶ ÷ efficiency ─▶ gross volume (L)
```

### 2.1 Growth stage — `growth_stage(crop, planting_date, on, override)`

`days = on − planting_date`.

| Case | Result |
|---|---|
| manual `stage_override` set on the planting | `in_season`, that stage (note "manual stage override") |
| days < 0 | `not_yet_planted` |
| annual crop, days ≥ L_ini + L_dev + L_mid + L_late | `season_ended` |
| otherwise | the stage whose interval contains `days`: initial `[0, L_ini)`, development `[L_ini, L_ini+L_dev)`, mid, late; also `day_in_stage` and `stage_length` |
| perennial with stage lengths | `day = days mod 365`; after the FAO-56 cycle (day ≥ Σ L) the stage is `late` with Kc_end applied ("after the FAO-56 cycle, Kc_end is applied") |
| perennial without stage lengths (date palm, alfalfa) | `mid` all year ("Kc_mid used year-round") |
| annual crop without stage lengths | in season but stage undefined → Kc cannot be computed (the agent reports missing data) |

### 2.2 Crop coefficient — `crop_coefficient(crop, stage, u2, rh_min)` (FAO-56 Eq. 66, Table 12)

| Stage | Kc |
|---|---|
| initial | Kc_ini |
| development | Kc_ini + (i / L_dev)·(Kc_mid − Kc_ini), i = day in stage |
| mid | Kc_mid |
| late | Kc_mid + (i / L_late)·(Kc_end − Kc_mid) |
| late after the perennial cycle | Kc_end |
| development / late with a manual override (position unknown) | the midpoint of the two stage values |

Outside the season the function raises an error; the perception layer turns that into an *unknown* percept.

### 2.3 Climatic adjustment — FAO-56 Eq. 62 (Kc_mid) and Eq. 65 (Kc_end)

Applied only when **RHmin, u₂ and the crop height h** are all available (RHmin and mean wind come from the Open-Meteo
extended variables):

```text
Kc = Kc_tab + [0.04 (u₂ − 2) − 0.004 (RHmin − 45)] · (h / 3)^0.3
```

Inputs are clipped to the validity ranges given by FAO-56: 1 ≤ u₂ ≤ 6 m/s, 20 ≤ RHmin ≤ 80 %, 0.1 ≤ h ≤ 10 m
(`adjust_kc_for_climate`). Kc_end is adjusted only when Kc_end ≥ 0.45. The reference values 2 m/s and 45 % are the
knowledge-base facts `kc_ref_u2` and `kc_ref_rhmin`. When an input is missing the step is recorded as *"skipped — RHmin,
u2 or crop height not available; Table 12 values used"* and `kc_climate_adjusted = false`.

### 2.4 Wind conversion — FAO-56 Eq. 47

Open-Meteo reports wind at 10 m; FAO-56 needs u₂ at 2 m:

```text
u₂ = u_z · 4.87 / ln(67.8 · z − 5.42)        (z = 10 m)
```

`u2_from_uz(3.0) = 2.244 m/s`; `u2_from_uz(5.0) = 3.740 m/s`.

### 2.5 Water requirement — `water_requirement(...)`

| Quantity | Formula | Unit | Reference in the step |
|---|---|---|---|
| Crop evapotranspiration | ETc = Kc × ET0 | mm/day | FAO-56 Eq. 56 |
| Effective rainfall | P_eff = f × P, f = `effective_rainfall_fraction` (0.8) | mm | FAO TM3 §3.2 (simplified daily fraction) |
| Net irrigation requirement | NIR = max(0, ETc − P_eff) | mm | — |
| Net volume | V_net = NIR × Area (× `mm_to_l_per_m2` = 1) | L | 1 mm × 1 m² = 1 L |
| Gross volume | V_gross = V_net / efficiency | L | FAO TM4 Annex I |

Validation: area > 0, 0 < efficiency ≤ 1 and ET0 ≥ 0, otherwise `ValueError`. The API rejects a non-positive planting
area with `422` before any calculation (`PlantingCreate.area_m2 > 0`, and the database check `area_m2 > 0`). If the
precipitation forecast is missing, ETc is still computed but P_eff, NIR and the volumes are not (the step says *"not
computed — precipitation forecast not available"*).

**Efficiency** comes from the planting's own `irrigation_efficiency` override if set, otherwise from its irrigation
method (`irrigation_service._efficiency`); a planting with neither cannot be calculated (`422`, *"Set an irrigation
method or an efficiency for this planting first."*).

**ET0** is Open-Meteo's `et0_fao_evapotranspiration` (FAO Penman-Monteith) for the target date, or the user's
`et0_override_mm` (0–30 mm), which sets `data_quality = "manual_et0"`. Precipitation can likewise be overridden.

### 2.6 Seasonal requirement (used by land distribution)

`seasonal_gross_requirement_l_per_m2(crop, et0_mm_day, efficiency)` assumes a constant mean ET0:

```text
ETc_season = ET0 × [Kc_ini·L_ini + ½(Kc_ini + Kc_mid)·L_dev + Kc_mid·L_mid + ½(Kc_mid + Kc_end)·L_late]
gross (L/m²) = ETc_season / efficiency
```

Perennials with stage lengths shorter than a year add Kc_end for the remaining days to 365; perennials without stage
lengths use Kc_mid × 365.

## 3. What is stored

`POST /api/water/calculations` (and every persisted irrigation recommendation) writes an immutable `water_calculations`
row: `inputs` (ET0 and its source, precipitation and its source, area, efficiency and its source, planting and target
dates, available water and its source, RHmin, wind), `parameters` (Kc values, stage lengths, height, Ky, effective-rain
fraction, critical-supply ratio), `method = "FAO-56 single crop coefficient"`, `steps`, `result` (kc,
kc_climate_adjusted, et0_mm, etc_mm, p_eff_mm, nir_mm, net_l, gross_l, coverage_pct when available water is known),
`weather_snapshot_id`, `created_by_id`, `created_at`. An audit entry `calculation.create` is written. If ETc cannot be
computed, nothing is stored and the response is `status = "insufficient_data"` with the reason.

## 4. Worked numeric examples (computed with the code)

### 4.1 Tomato, development stage, with climatic adjustment

Inputs (illustrative): tomato (Kc 0.6 / 1.15 / 0.80, L = 30/40/40/25 d, h = 0.6 m), planted 2026-08-20, target
2026-10-03, 500 m², drip 0.90, ET0 6.2 mm, P 2.0 mm, RHmin 30 %, wind at 10 m 3.0 m/s.

| Step | Calculation | Result |
|---|---|---|
| Stage | day 44 → development (day 14 of 40) | development |
| u₂ (Eq. 47) | 3.0 × 4.87 / ln(672.58) | 2.244 m/s |
| Kc_mid (Eq. 62) | 1.15 + [0.04(0.244) − 0.004(30 − 45)] × (0.6/3)^0.3 = 1.15 + 0.0698 × 0.617 | 1.193 |
| Kc_end (Eq. 65) | 0.80 + 0.043 | 0.843 |
| Kc (Eq. 66) | 0.6 + (14/40)(1.193 − 0.6) | 0.8076 |
| ETc | 0.8076 × 6.2 | 5.007 mm/day |
| P_eff | 0.8 × 2.0 | 1.600 mm |
| NIR | 5.007 − 1.600 | 3.407 mm |
| Net volume | 3.407 × 500 | 1,703.45 L |
| Gross volume | 1,703.45 / 0.90 | 1,892.72 L |

This is the calculation used by the worked agent example in [ai.md §10](ai.md#10-fully-worked-example-computed-with-the-code).

### 4.2 Tomato, mid-season, no climatic data

ET0 5.0 mm, P 0 mm, 1,000 m², sprinkler 0.75, mid-season (Kc = Kc_mid = 1.15, adjustment skipped):

| ETc | P_eff | NIR | Net | Gross |
|---|---|---|---|---|
| 5.75 mm | 0.0 mm | 5.75 mm | 5,750 L | 7,666.67 L |

### 4.3 Kc through the tomato season (planted 2026-01-01, no adjustment)

| Day | Stage | Day in stage | Kc | Formula |
|---|---|---|---|---|
| 10 | initial | 10 / 30 | 0.600 | Kc_ini |
| 44 | development | 14 / 40 | 0.7925 | Kc_ini + (14/40)(1.15 − 0.6) |
| 85 | mid | 15 / 40 | 1.150 | Kc_mid |
| 120 | late | 10 / 25 | 1.010 | Kc_mid + (10/25)(0.80 − 1.15) |
| 140 | season ended | — | — | (135-day season) |

### 4.4 Perennials

- Olive (L = 30/90/60/90, Σ = 270 d), cycle start 2025-03-01, date 2026-01-15 → day 320 of 365 → `late`, Kc_end
  applied (*"perennial annual cycle: day 320 of 365; after the FAO-56 cycle, Kc_end is applied"*). Seasonal planning
  value at ET0 5 mm/day and efficiency 0.9: Σ Kc·days = 251.75, ETc 1,258.75 mm/year, 1,398.61 L/m².
- Date palm (no stage lengths) → always `mid`, Kc_mid = 0.95 (*"perennial without FAO-56 stage lengths: Kc_mid used
  year-round"*).
