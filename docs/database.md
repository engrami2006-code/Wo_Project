# Database

WO uses **PostgreSQL 16** in normal operation, through SQLAlchemy 2.x (synchronous) with Alembic migrations. The models
use only portable column types (`Uuid`, `JSON`, `Float`, `String`, `Text`, `Date`, `DateTime(timezone=True)`), so the
same schema also runs on SQLite (the engine enables `PRAGMA foreign_keys=ON` for SQLite in
`backend/app/core/database.py`).

| Item | Location |
|---|---|
| Models | `backend/app/models/` — `user.py`, `farm.py`, `crop.py`, `hydroponics.py`, `water.py`, `weather.py`, `knowledge.py`, `ops.py`; shared helpers in `base.py` |
| Migrations | `backend/alembic/versions/0001_initial_schema.py` (all 26 tables), `0002_reference_knowledge.py` (reference knowledge data) |
| Alembic environment | `backend/alembic/env.py` (URL from `DATABASE_URL`, `render_as_batch=True`, `compare_type=True`) |
| Diagram | [uml/11-database-er.mmd](uml/11-database-er.mmd) ([PNG](uml/png/11-database-er.png)) |

## 1. Conventions

- **Primary keys**: UUID (`uuid.uuid4`) on every table.
- **Timestamps**: `created_at`/`updated_at` (`TimestampMixin`, timezone-aware, default `utcnow`, server default
  `now()`, `updated_at` refreshed on update) on the main entities; append-only tables (records, calculations,
  recommendations, alerts, logs, snapshots) have their own `created_at`/`fetched_at`/`changed_at`.
- **Enums** are stored as `VARCHAR` (`str_enum` = `Enum(..., native_enum=False)`), validated by SQLAlchemy.
- **Naming convention** (`base.py::NAMING_CONVENTION`): `ix_<table>_<column>`, `uq_<table>_<column>`,
  `ck_<table>_<name>`, `fk_<table>_<column>_<referred table>`, `pk_<table>`.
- **Every foreign key declares `ondelete`** explicitly: `CASCADE` for data owned by its parent, `SET NULL` for
  references that should survive (authors, optional links), `RESTRICT` where deletion must be prevented
  (`farm_crops.crop_id`).
- **Indexes** on the tenant keys (`company_id`, `owner_user_id`, `farm_id`) and composite time indexes for the
  record tables (`(farm_id, recorded_at)`, `(system_id, recorded_at)`, `(farm_id, fetched_at)`, `(farm_id,
  created_at)`).

## 2. Reference data vs operational data

A knowledge-based system needs its knowledge; the user's world must start empty. The two classes are kept apart:

| Class | Tables | How rows get there | Empty after `alembic upgrade head`? |
|---|---|---|---|
| **Reference knowledge** (part of the AI model) | `knowledge_bases`, `knowledge_rules`, `knowledge_rule_history` (initial `create` rows), `knowledge_facts`, `knowledge_percepts`, `crops` (rows with `is_reference = true`), `irrigation_methods`, `hydroponic_profiles` | data migration `0002` → `app/ai/knowledge_base/seed.py::seed_reference_knowledge` (idempotent), from `reference_data.py`; every scientific value carries a `source` | **No** — 1 knowledge base, 39 rules, 24 facts (4 scientific, 12 policy, 8 axioms), 27 percepts, 32 crops, 3 irrigation methods, 1 hydroponic profile |
| **Operational data** (the user's world) | `companies`, `users`, `farms`, `farm_members`, `farm_crops`, custom `crops` (`is_reference = false`), `hydroponic_systems`, `hydroponic_records`, `water_records`, `water_calculations`, `water_baselines`, `weather_snapshots`, `recommendations`, `alerts`, `land_distribution_requests`, `land_distribution_results`, `chat_sessions`, `chat_messages`, `audit_logs` | created by users or by the system at runtime | **Yes** — no users, farms or records are seeded |

`farms.is_demo` and `water_records.is_demo` flag demo data. No demo seeding runs automatically: no migration or
startup step creates demo rows. The optional, manual script `python -m app.scripts.demo_seed` creates:

- the account `demo@wo-demo.com` (`COMPANY_OWNER`) and the company "DEMO — WO Sample Agro Co.";
- one farm with `is_demo = true`, named "DEMO — Sample Farm (illustrative data)"; the UI shows a DEMO badge for it;
- three plantings, water records with `is_demo = true`, a baseline and a hydroponic system with records;
- the calculations, alerts and recommendations produced by running the real agent once per planting with manual ET0.

All of these values are illustrative inputs, not measurements. `python -m app.scripts.demo_seed --remove` deletes the
demo account, its company and everything under it (see [deployment.md §7](deployment.md#7-demo-data-optional)). The
first administrator is created explicitly with `python -m app.scripts.create_superadmin`.

## 2.1 Relationships at a glance

```text
companies 1─* users            companies 1─* farms            users 1─* farms (INDIVIDUAL owner)
farms 1─* farm_members *─1 users                              farms 1─* farm_crops *─1 crops
farm_crops *─1 irrigation_methods                              farms 1─* hydroponic_systems 1─* hydroponic_records
farms 1─* water_records (*─1 farm_crops | hydroponic_systems)  farms 1─* water_calculations *─1 weather_snapshots
farms 1─* water_baselines   farms 1─* weather_snapshots       farms 1─* recommendations, alerts
land_distribution_requests 1─1 land_distribution_results       users 1─* chat_sessions 1─* chat_messages
knowledge_bases 1─* knowledge_facts, knowledge_rules, knowledge_percepts; knowledge_rules 1─* knowledge_rule_history
audit_logs *─1 users, companies (SET NULL)
```

Deleting a **company** cascades to its users and farms; deleting a **farm** cascades to its members, plantings,
hydroponic systems (and their records), water records, calculations, baselines, weather snapshots, recommendations and
alerts. Land-distribution requests keep their history (`farm_id` → `SET NULL`) but are deleted with their creator.
Audit rows survive user and company deletion (`SET NULL`). A crop that is still used by a planting cannot be deleted
(`RESTRICT`).

## 3. Tables

The tables below are generated from the SQLAlchemy metadata (`app.models.Base.metadata`) and match migration `0001`.
"Null" = whether the column is nullable; defaults are application-side defaults.

### 3.1 `companies`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `name` | varchar(200) | no |  |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |


### 3.2 `users`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `email` | varchar(320) | no | unique |
| `password_hash` | varchar(255) | no |  |
| `full_name` | varchar(200) | no |  |
| `role` | enum(INDIVIDUAL/COMPANY_OWNER/FARM_MANAGER/EMPLOYEE/SUPER_ADMIN) | no |  |
| `company_id` | uuid | yes | FK → `companies.id` (CASCADE) |
| `is_active` | bool | no | default `True` |
| `preferred_language` | varchar(2) | no | default `ar` |
| `token_version` | int | no | default `0` |
| `last_login_at` | timestamptz | yes |  |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_users_company_id` (company_id); `ix_users_email` (email) unique.  

### 3.3 `farms`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `name` | varchar(200) | no |  |
| `company_id` | uuid | yes | FK → `companies.id` (CASCADE) |
| `owner_user_id` | uuid | yes | FK → `users.id` (CASCADE) |
| `created_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `latitude` | float | no |  |
| `longitude` | float | no |  |
| `location_name` | varchar(200) | yes |  |
| `total_area_m2` | float | yes |  |
| `water_source` | varchar(32) | yes |  |
| `daily_water_allowance_l` | float | yes |  |
| `notes` | text | yes |  |
| `is_demo` | bool | no | default `False` |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_farms_company_id` (company_id); `ix_farms_owner_user_id` (owner_user_id).  
Checks: `ck_farms_longitude_range`: `longitude >= -180 AND longitude <= 180`; `ck_farms_allowance_non_negative`: `daily_water_allowance_l IS NULL OR daily_water_allowance_l >= 0`; `ck_farms_latitude_range`: `latitude >= -90 AND latitude <= 90`; `ck_farms_area_positive`: `total_area_m2 IS NULL OR total_area_m2 > 0`.

### 3.4 `farm_members`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `user_id` | uuid | no | FK → `users.id` (CASCADE) |

Indexes: `ix_farm_members_farm_id` (farm_id); `ix_farm_members_user_id` (user_id).  
Unique: `farm_user` (farm_id, user_id).  

### 3.5 `crops`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `code` | varchar(64) | no |  |
| `name_en` | varchar(120) | no |  |
| `name_ar` | varchar(120) | no |  |
| `aliases` | json | no | default `list` |
| `category` | varchar(64) | no |  |
| `kc_ini` | float | no |  |
| `kc_mid` | float | no |  |
| `kc_end` | float | no |  |
| `l_ini` | int | yes |  |
| `l_dev` | int | yes |  |
| `l_mid` | int | yes |  |
| `l_late` | int | yes |  |
| `max_height_m` | float | yes |  |
| `ky` | float | yes |  |
| `is_perennial` | bool | no | default `False` |
| `source` | varchar(300) | no |  |
| `source_note` | text | yes |  |
| `is_reference` | bool | no | default `False` |
| `company_id` | uuid | yes | FK → `companies.id` (CASCADE) |
| `owner_user_id` | uuid | yes | FK → `users.id` (CASCADE) |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_crops_code` (code); `ix_crops_company_id` (company_id); `ix_crops_owner_user_id` (owner_user_id).  
Checks: `ck_crops_kc_non_negative`: `kc_ini >= 0 AND kc_mid >= 0 AND kc_end >= 0`.

### 3.6 `irrigation_methods`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `code` | varchar(32) | no | unique |
| `name_en` | varchar(120) | no |  |
| `name_ar` | varchar(120) | no |  |
| `efficiency` | float | no |  |
| `source` | varchar(300) | no |  |
| `source_note` | text | yes |  |

Unique: `uq_irrigation_methods_code` (code).  
Checks: `ck_irrigation_methods_efficiency_range`: `efficiency > 0 AND efficiency <= 1`.

### 3.7 `farm_crops`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `crop_id` | uuid | no | FK → `crops.id` (RESTRICT) |
| `variety` | varchar(120) | yes |  |
| `area_m2` | float | no |  |
| `planting_date` | date | yes |  |
| `soil_type` | varchar(32) | yes |  |
| `irrigation_method_id` | uuid | yes | FK → `irrigation_methods.id` (SET NULL) |
| `irrigation_efficiency` | float | yes |  |
| `stage_override` | enum(initial/development/mid/late) | yes |  |
| `status` | enum(active/harvested) | no | default `active` |
| `notes` | text | yes |  |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_farm_crops_farm_id` (farm_id).  
Checks: `ck_farm_crops_efficiency_range`: `irrigation_efficiency IS NULL OR (irrigation_efficiency > 0 AND irrigation_efficiency <= 1)`; `ck_farm_crops_area_positive`: `area_m2 > 0`.

### 3.8 `hydroponic_profiles`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `code` | varchar(64) | no | unique |
| `name_en` | varchar(160) | no |  |
| `name_ar` | varchar(160) | no |  |
| `crop_code` | varchar(64) | yes |  |
| `ph_min` | float | yes |  |
| `ph_max` | float | yes |  |
| `ec_min` | float | yes |  |
| `ec_max` | float | yes |  |
| `source` | varchar(300) | no |  |
| `source_note` | text | yes |  |

Unique: `uq_hydroponic_profiles_code` (code).  

### 3.9 `hydroponic_systems`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `name` | varchar(160) | no |  |
| `system_type` | enum(NFT/DWC/EBB_FLOW/DRIP/WICK/AEROPONICS/RAFT/SUBSTRATE) | no |  |
| `crop_id` | uuid | yes | FK → `crops.id` (SET NULL) |
| `growing_area_m2` | float | no |  |
| `plant_count` | int | no | default `0` |
| `reservoir_capacity_l` | float | no |  |
| `is_closed_loop` | bool | no | default `True` |
| `status` | enum(active/inactive/maintenance) | no | default `active` |
| `ph_min` | float | yes |  |
| `ph_max` | float | yes |  |
| `ec_min` | float | yes |  |
| `ec_max` | float | yes |  |
| `threshold_source` | varchar(300) | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_hydroponic_systems_farm_id` (farm_id).  
Checks: `ck_hydroponic_systems_area_positive`: `growing_area_m2 > 0`; `ck_hydroponic_systems_reservoir_positive`: `reservoir_capacity_l > 0`; `ck_hydroponic_systems_ph_order`: `ph_min IS NULL OR ph_max IS NULL OR ph_min < ph_max`; `ck_hydroponic_systems_plants_non_negative`: `plant_count >= 0`; `ck_hydroponic_systems_ec_order`: `ec_min IS NULL OR ec_max IS NULL OR ec_min < ec_max`.

### 3.10 `hydroponic_records`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `system_id` | uuid | no | FK → `hydroponic_systems.id` (CASCADE) |
| `recorded_at` | timestamptz | no |  |
| `period_days` | float | no | default `1.0` |
| `water_input_l` | float | no |  |
| `water_consumed_l` | float | yes |  |
| `water_recycled_l` | float | yes |  |
| `water_discharged_l` | float | yes |  |
| `water_losses_l` | float | yes |  |
| `reservoir_start_l` | float | yes |  |
| `reservoir_end_l` | float | yes |  |
| `ph` | float | yes |  |
| `ec` | float | yes |  |
| `water_temp_c` | float | yes |  |
| `notes` | text | yes |  |
| `created_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `created_at` | timestamptz | no |  |

Indexes: `ix_hydroponic_records_system_time` (system_id, recorded_at).  
Checks: `ck_hydroponic_records_ph_range`: `ph IS NULL OR (ph >= 0 AND ph <= 14)`; `ck_hydroponic_records_input_non_negative`: `water_input_l >= 0`; `ck_hydroponic_records_ec_non_negative`: `ec IS NULL OR ec >= 0`; `ck_hydroponic_records_period_positive`: `period_days > 0`.

### 3.11 `water_records`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `farm_crop_id` | uuid | yes | FK → `farm_crops.id` (SET NULL) |
| `hydroponic_system_id` | uuid | yes | FK → `hydroponic_systems.id` (SET NULL) |
| `recorded_at` | timestamptz | no |  |
| `volume_l` | float | no |  |
| `source` | enum(well/municipal/desalinated/treated_wastewater/rainwater/surface_water/recycled/other) | no |  |
| `record_type` | enum(irrigation/hydroponic/other) | no |  |
| `notes` | text | yes |  |
| `created_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `is_demo` | bool | no | default `False` |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_water_records_farm_crop_id` (farm_crop_id); `ix_water_records_farm_time` (farm_id, recorded_at); `ix_water_records_hydroponic_system_id` (hydroponic_system_id).  
Checks: `ck_water_records_volume_non_negative`: `volume_l >= 0`.

### 3.12 `water_calculations`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `farm_crop_id` | uuid | yes | FK → `farm_crops.id` (SET NULL) |
| `target_date` | date | no |  |
| `method` | varchar(120) | no |  |
| `inputs` | json | no |  |
| `parameters` | json | no |  |
| `steps` | json | no |  |
| `result` | json | no |  |
| `weather_snapshot_id` | uuid | yes | FK → `weather_snapshots.id` (SET NULL) |
| `created_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `created_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_water_calculations_farm_crop_id` (farm_crop_id); `ix_water_calculations_farm_id` (farm_id).  

### 3.13 `water_baselines`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `farm_crop_id` | uuid | yes | FK → `farm_crops.id` (SET NULL) |
| `period_start` | date | no |  |
| `period_end` | date | no |  |
| `total_volume_l` | float | no |  |
| `area_m2` | float | no |  |
| `notes` | text | yes |  |
| `created_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `created_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_water_baselines_farm_id` (farm_id).  
Checks: `ck_water_baselines_area_positive`: `area_m2 > 0`; `ck_water_baselines_period_order`: `period_end >= period_start`; `ck_water_baselines_volume_non_negative`: `total_volume_l >= 0`.

### 3.14 `weather_snapshots`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `provider` | varchar(64) | no |  |
| `latitude` | float | no |  |
| `longitude` | float | no |  |
| `timezone` | varchar(64) | yes |  |
| `fetched_at` | timestamptz | no | default `utcnow` |
| `current` | json | no |  |
| `daily` | json | no |  |
| `units` | json | no |  |
| `variables_set` | varchar(16) | no | default `core` |

Indexes: `ix_weather_snapshots_farm_time` (farm_id, fetched_at).  

### 3.15 `knowledge_bases`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `name` | varchar(160) | no | unique |
| `version` | int | no | default `1` |
| `is_active` | bool | no | default `True` |
| `description` | text | yes |  |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Unique: `uq_knowledge_bases_name` (name).  

### 3.16 `knowledge_facts`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `kb_id` | uuid | no | FK → `knowledge_bases.id` (CASCADE) |
| `key` | varchar(120) | no |  |
| `value` | json | no |  |
| `unit` | varchar(40) | yes |  |
| `kind` | enum(scientific/policy/axiom) | no |  |
| `category` | varchar(64) | no |  |
| `description_en` | text | no |  |
| `description_ar` | text | no |  |
| `source` | varchar(400) | yes |  |
| `version` | int | no | default `1` |
| `is_active` | bool | no | default `True` |
| `updated_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_knowledge_facts_kb_id` (kb_id).  
Unique: `kb_key` (kb_id, key).  

### 3.17 `knowledge_rules`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `kb_id` | uuid | no | FK → `knowledge_bases.id` (CASCADE) |
| `code` | varchar(32) | no |  |
| `name_en` | varchar(200) | no |  |
| `name_ar` | varchar(200) | no |  |
| `category` | varchar(64) | no |  |
| `antecedent` | text | no |  |
| `consequent` | varchar(120) | no |  |
| `action_group` | varchar(64) | yes |  |
| `priority` | int | no | default `50` |
| `severity` | varchar(16) | yes |  |
| `recommendation_en` | text | yes |  |
| `recommendation_ar` | text | yes |  |
| `explanation_en` | text | no |  |
| `explanation_ar` | text | no |  |
| `source` | varchar(400) | yes |  |
| `version` | int | no | default `1` |
| `is_active` | bool | no | default `True` |
| `updated_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_knowledge_rules_kb_id` (kb_id).  
Unique: `kb_code` (kb_id, code).  

### 3.18 `knowledge_rule_history`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `rule_id` | uuid | yes | FK → `knowledge_rules.id` (SET NULL) |
| `rule_code` | varchar(32) | no |  |
| `version` | int | no |  |
| `change_type` | varchar(16) | no |  |
| `snapshot` | json | no |  |
| `changed_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `changed_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_knowledge_rule_history_rule_id` (rule_id).  

### 3.19 `knowledge_percepts`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `kb_id` | uuid | no | FK → `knowledge_bases.id` (CASCADE) |
| `symbol` | varchar(120) | no |  |
| `category` | varchar(64) | no |  |
| `description_en` | text | no |  |
| `description_ar` | text | no |  |
| `depends_on` | json | no | default `list` |
| `threshold_key` | varchar(120) | yes |  |

Indexes: `ix_knowledge_percepts_kb_id` (kb_id).  
Unique: `kb_symbol` (kb_id, symbol).  

### 3.20 `recommendations`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `farm_crop_id` | uuid | yes | FK → `farm_crops.id` (SET NULL) |
| `hydroponic_system_id` | uuid | yes | FK → `hydroponic_systems.id` (SET NULL) |
| `kind` | varchar(32) | no |  |
| `action` | varchar(120) | no |  |
| `title_en` | varchar(300) | no |  |
| `title_ar` | varchar(300) | no |  |
| `summary_en` | text | no |  |
| `summary_ar` | text | no |  |
| `amount_l` | float | yes |  |
| `target_date` | date | yes |  |
| `certainty` | varchar(32) | no |  |
| `data_quality` | varchar(32) | no |  |
| `payload` | json | no |  |
| `status` | enum(new/accepted/dismissed) | no | default `new` |
| `created_by_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `created_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_recommendations_farm_time` (farm_id, created_at).  

### 3.21 `alerts`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | no | FK → `farms.id` (CASCADE) |
| `farm_crop_id` | uuid | yes | FK → `farm_crops.id` (CASCADE) |
| `hydroponic_system_id` | uuid | yes | FK → `hydroponic_systems.id` (CASCADE) |
| `rule_code` | varchar(32) | no |  |
| `symbol` | varchar(120) | no |  |
| `severity` | enum(info/warning/critical) | no |  |
| `title_en` | varchar(300) | no |  |
| `title_ar` | varchar(300) | no |  |
| `message_en` | text | no |  |
| `message_ar` | text | no |  |
| `evidence` | json | no |  |
| `status` | enum(open/acknowledged/resolved) | no | default `open` |
| `dedupe_key` | varchar(300) | no |  |
| `created_at` | timestamptz | no | default `utcnow` |
| `acknowledged_at` | timestamptz | yes |  |
| `resolved_at` | timestamptz | yes |  |
| `resolved_reason` | varchar(300) | yes |  |

Indexes: `ix_alerts_dedupe_key` (dedupe_key); `ix_alerts_farm_status` (farm_id, status).  

### 3.22 `land_distribution_requests`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `farm_id` | uuid | yes | FK → `farms.id` (SET NULL) |
| `created_by_id` | uuid | yes | FK → `users.id` (CASCADE) |
| `objective` | varchar(32) | no |  |
| `inputs` | json | no |  |
| `created_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_land_distribution_requests_created_by_id` (created_by_id); `ix_land_distribution_requests_farm_id` (farm_id).  

### 3.23 `land_distribution_results`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `request_id` | uuid | no | FK → `land_distribution_requests.id` (CASCADE); unique |
| `status` | varchar(32) | no |  |
| `allocation` | json | no |  |
| `objective_value` | float | yes |  |
| `total_water_l` | float | yes |  |
| `total_production` | float | yes |  |
| `search_stats` | json | no |  |
| `comparison` | json | no |  |
| `message` | text | no |  |
| `created_at` | timestamptz | no | default `utcnow` |

Unique: `uq_land_distribution_results_request_id` (request_id).  

### 3.24 `chat_sessions`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `user_id` | uuid | no | FK → `users.id` (CASCADE) |
| `language` | varchar(2) | no | default `ar` |
| `state` | json | no | default `dict` |
| `created_at` | timestamptz | no | default `utcnow` |
| `updated_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_chat_sessions_user_id` (user_id).  

### 3.25 `chat_messages`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `session_id` | uuid | no | FK → `chat_sessions.id` (CASCADE) |
| `role` | varchar(16) | no |  |
| `text` | text | no |  |
| `payload` | json | no | default `dict` |
| `created_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_chat_messages_session_id` (session_id).  

### 3.26 `audit_logs`

| Column | Type | Null | Key / default |
|---|---|---|---|
| `id` | uuid | no | PK |
| `user_id` | uuid | yes | FK → `users.id` (SET NULL) |
| `company_id` | uuid | yes | FK → `companies.id` (SET NULL) |
| `action` | varchar(80) | no |  |
| `entity_type` | varchar(64) | yes |  |
| `entity_id` | varchar(64) | yes |  |
| `details` | json | no | default `dict` |
| `ip_address` | varchar(64) | yes |  |
| `created_at` | timestamptz | no | default `utcnow` |

Indexes: `ix_audit_logs_company_id` (company_id); `ix_audit_logs_time` (created_at); `ix_audit_logs_user_id` (user_id).  

## 4. JSON columns

| Column | Content |
|---|---|
| `crops.aliases` | alternative names (AR/EN) used by the chatbot entity matcher |
| `knowledge_facts.value` | a number (parameters) or a formula string (axioms) |
| `knowledge_percepts.depends_on` | data items a percept depends on |
| `knowledge_rule_history.snapshot` | all rule fields at that version |
| `water_calculations.inputs / parameters / steps / result` | the complete FAO-56 calculation ([agronomy.md §3](agronomy.md#3-what-is-stored)) |
| `weather_snapshots.current / daily / units` | the validated Open-Meteo payload ([weather.md §5](weather.md#5-snapshot-storage)) |
| `recommendations.payload` | the full explanation contract at the time of the decision ([ai.md §6](ai.md#6-explanation-contract)) |
| `alerts.evidence` | `{percepts, rule}` — the percepts (with their evidence) that made the alert rule fire |
| `land_distribution_requests.inputs` | the request as sent |
| `land_distribution_results.allocation / search_stats / comparison` | allocation per crop; formulation, totals, binding constraints; per-algorithm statistics |
| `chat_sessions.state` | dialogue state: slots, pending question, options, last answer summary |
| `chat_messages.payload` | NLU result (user messages) or status, options and explanation (assistant messages) |
| `audit_logs.details` | action details without secrets |

## 5. Migrations

```bash
cd backend
alembic upgrade head        # 0001: create all tables; 0002: load the reference knowledge
alembic downgrade 0001      # removes the reference knowledge rows
```

`0002.downgrade` deletes the rows of `knowledge_rule_history`, `knowledge_rules`, `knowledge_facts`,
`knowledge_percepts`, `knowledge_bases`, `hydroponic_profiles`, `irrigation_methods` and the reference crops
(`is_reference = true`). Deleting the reference crops fails while plantings still use them, because
`farm_crops.crop_id` is `RESTRICT`. See [deployment.md](deployment.md) for running migrations locally and in Docker.
