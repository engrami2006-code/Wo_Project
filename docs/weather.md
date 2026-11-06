# Weather — Open-Meteo with Offline Fallback

Weather is an input, **not a hard dependency**. When the provider is reachable WO fetches, validates and stores a
snapshot; when it is not, the latest valid snapshot is used; when there is none, weather is reported as
*unavailable*. Weather values are **never fabricated**, and the irrigation agent accepts a manual ET0 instead.

| Part | Code |
|---|---|
| Provider interface | `backend/app/integrations/weather/base.py` (`WeatherProvider` Protocol, `WeatherData`, errors) |
| Open-Meteo provider | `backend/app/integrations/weather/open_meteo.py` (`OpenMeteoProvider`, `validate_payload`, `RANGES`) |
| Service and fallback | `backend/app/services/weather_service.py` (`get_weather`, `WeatherStatus`, `day_values`) |
| Storage | `backend/app/models/weather.py::WeatherSnapshot` (table `weather_snapshots`) |
| API | `GET /api/weather/{farm_id}`, `POST /api/weather/{farm_id}/refresh`, `GET /api/weather/{farm_id}/snapshots` |
| UI | `frontend/src/pages/WeatherPage.tsx`, `components/weather/WeatherPanel.tsx` (screenshot `docs/screenshots/weather-en.png`) |

## 1. Provider abstraction

```python
class WeatherProvider(Protocol):
    name: str
    def fetch(self, latitude: float, longitude: float) -> WeatherData: ...
```

`fetch` returns validated `WeatherData(provider, latitude, longitude, timezone, current, daily, units, variables_set)`
or raises:

- `WeatherUnavailableError` — the provider could not be reached (connection error, timeout, DNS, non-200 HTTP status);
- `WeatherValidationError` — the provider answered but the payload failed validation. **It is never stored.**

The application depends only on this interface. `weather_service.get_provider()` returns an `OpenMeteoProvider` built
from the settings `OPEN_METEO_BASE_URL` (default `https://api.open-meteo.com/v1/forecast`) and
`WEATHER_TIMEOUT_SECONDS` (default 8); `weather_service.set_provider()` injects another provider (used for tests or an
alternative source).

## 2. Open-Meteo request

`OpenMeteoProvider.fetch` sends, without an API key:

| Parameter | Value |
|---|---|
| `latitude`, `longitude` | the farm's coordinates |
| `timezone` | `auto` |
| `forecast_days` | `3` |
| `wind_speed_unit` | `ms` |
| `current` | `temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation, weather_code` |
| `daily` (core) | `et0_fao_evapotranspiration, precipitation_sum, precipitation_probability_max, temperature_2m_max, temperature_2m_min, wind_speed_10m_max` |
| `daily` (extended) | core + `minimum_relative_humidity_2m, mean_wind_speed_10m` |

**Extended → core retry.** The first request asks for the extended set (`variables_set = "extended"`). If Open-Meteo
answers **HTTP 400**, the request is repeated with the core set only (`variables_set = "core"`). Any other non-200
status raises `WeatherUnavailableError`. The extended variables feed the FAO-56 climatic adjustment of Kc (RHmin and
mean wind → u₂, see [agronomy.md §2.3](agronomy.md#23-climatic-adjustment--fao-56-eq-62-kc_mid-and-eq-65-kc_end)); without
them the adjustment is skipped and recorded as skipped.

## 3. Validation (`validate_payload`)

| Check | Failure |
|---|---|
| the payload is a JSON object | `Response is not a JSON object` / `Response is not valid JSON` |
| `daily.time` is a non-empty list | `Missing daily.time array` |
| `et0_fao_evapotranspiration` and `precipitation_sum` are present | `Missing required daily variable …` (other daily variables may be absent and are skipped) |
| every present daily array has the same length as `daily.time` | `daily.<var> length does not match daily.time` |
| every value is a number within its plausibility range (nulls allowed) | `<var>=<value> is outside the plausible range [lo, hi]` |
| current values are within range (`weather_code` is not range-checked) | same |
| `daily_units.wind_speed_10m_max` is `m/s` when present | `Unexpected wind unit; m/s was requested` |

Plausibility ranges (`RANGES`):

| Variable | Range |
|---|---|
| `et0_fao_evapotranspiration` | 0 – 30 |
| `precipitation_sum` | 0 – 2000 |
| `precipitation_probability_max`, `minimum_relative_humidity_2m`, `relative_humidity_2m` | 0 – 100 |
| `temperature_2m_max`, `temperature_2m_min`, `temperature_2m` | −90 – 65 |
| `wind_speed_10m_max`, `mean_wind_speed_10m`, `wind_speed_10m` | 0 – 120 |
| `precipitation` (current) | 0 – 500 |

Only the validated `current`, `daily` and `units` dictionaries are kept.

## 4. Fallback states (`weather_service.get_weather`)

```text
latest snapshot younger than weather_cache_minutes (60) and no forced refresh?
    └─ yes → status "fresh" (reused, "Recent snapshot reused (within cache window).")
otherwise, unless offline mode is on:
    fetch → validate → save snapshot → status "fresh" (age 0, fetched_now = true)
    on WeatherUnavailableError / WeatherValidationError → log a warning and fall through
latest snapshot exists?   → status "cached", stale = age > stale_weather_hours (12)
no snapshot at all        → status "unavailable"
```

| Status | `snapshot` | `age_hours` | `stale` | Message (example) |
|---|---|---|---|---|
| `fresh` | the new or reused snapshot | 0 or the snapshot age | false | *"Fresh data fetched from the provider."* |
| `cached` | the latest saved snapshot | its age | `age > 12 h` | *"Using the latest saved snapshot (30.5 h old) because Open-Meteo unreachable: ConnectError."* |
| `unavailable` | `null` | `null` | false | *"Weather data is currently unavailable (offline mode is enabled) and no snapshot is saved."* |

`WeatherStatus.to_dict()` returns `{status, age_hours, stale, message, fetched_now, snapshot}`; the weather router adds
`farm_id` and the note *"relative_humidity_2m is AIR humidity at 2 m, not soil moisture."*

Every `GET /api/weather/{farm_id}` and `POST …/refresh` also runs the weather alert rules (`R-ALR-001` weather
unavailable, `R-ALR-002` snapshot stale) for that farm; the alerts auto-resolve when fresh data arrives.

### 4.1 Staleness

`stale_weather_hours` (policy, 12 h) and `weather_cache_minutes` (policy, 60 min) are knowledge-base facts and can be
changed by a super admin. Staleness is used by:

- the percept `weather_stale` → explanation `data_quality = "stale_weather"`;
- rule `R-ADV-004` (*Refresh weather*: `irrigate_today ∧ weather_stale`);
- rule `R-ALR-002` (info alert);
- the dashboard weather widget (`recent` / `stale` / `unavailable` per farm).

### 4.2 Offline mode

Setting `WEATHER_OFFLINE_MODE=true` skips every provider call (the reason becomes *"offline mode is enabled"*); the
service works only from saved snapshots. `GET /api/health` reports the flag (`weather_offline_mode`). Without weather
for the target date, the irrigation agent reports ET0 and precipitation as missing data; the user can then supply
`et0_override_mm` and `precipitation_override_mm` (Smart Irrigation → *Manual / offline inputs*), which yields
`data_quality = "manual_et0"`.

### 4.3 Picking the target day (`day_values`)

The snapshot's `daily.time` array is searched for the target date. If it is present, ET0
(`et0_fao_evapotranspiration`), precipitation (`precipitation_sum`), RHmin (`minimum_relative_humidity_2m`) and mean
wind (`mean_wind_speed_10m`) are taken from that index (nulls stay null). If the snapshot does not cover the date, the
status is kept but all values are `None` — weather is "known" but not for that day, so the dependent percepts become
unknown rather than being filled with another day's values.

## 5. Snapshot storage

`weather_snapshots`: `id`, `farm_id` (FK → farms, `CASCADE`), `provider`, `latitude`, `longitude`, `timezone`,
`fetched_at`, `current` (JSON), `daily` (JSON), `units` (JSON), `variables_set` (`core`/`extended`); index
`ix_weather_snapshots_farm_time (farm_id, fetched_at)`. Water calculations reference the snapshot they used
(`water_calculations.weather_snapshot_id`, `SET NULL`).

## 6. Air humidity is not soil moisture

`relative_humidity_2m` is the relative humidity of the **air** at 2 m. WO never interprets it as soil moisture:

- the provider module docstring states it;
- the weather API response carries the explicit note quoted above;
- the chatbot's weather answer says *"air humidity, not soil moisture"* / «رطوبة الهواء وليست رطوبة التربة»;
- the UI labels the value as air humidity.

WO has no soil-moisture input (no IoT sensors); see [limitations.md](limitations.md).
