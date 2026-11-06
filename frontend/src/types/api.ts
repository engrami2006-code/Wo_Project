/**
 * Hand-written types mirroring backend/app/schemas/*.py and the explanation contract built in
 * backend/app/ai/explanations/builder.py. UUIDs and datetimes arrive as strings.
 */

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

export interface Message {
  message: string;
}

/* ------------------------------------------------------------------ auth & users */
export type Role = 'INDIVIDUAL' | 'COMPANY_OWNER' | 'FARM_MANAGER' | 'EMPLOYEE' | 'SUPER_ADMIN';
export type Lang = 'ar' | 'en';

export interface User {
  id: UUID;
  email: string;
  full_name: string;
  role: Role;
  company_id: UUID | null;
  is_active: boolean;
  preferred_language: string;
  created_at: ISODateTime;
  last_login_at?: ISODateTime | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  account_type: 'individual' | 'company';
  company_name?: string | null;
  preferred_language: Lang;
}

export interface ProfileUpdate {
  full_name?: string;
  preferred_language?: Lang;
  current_password?: string;
  new_password?: string;
}

export interface UserCreate {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  company_id?: UUID | null;
  preferred_language: Lang;
}

export interface UserUpdate {
  full_name?: string;
  is_active?: boolean;
  role?: 'FARM_MANAGER' | 'EMPLOYEE';
  preferred_language?: Lang;
}

export interface Company {
  id: UUID;
  name: string;
  created_at: ISODateTime;
}

/* ------------------------------------------------------------------ farms */
export type WaterSource =
  | 'well'
  | 'municipal'
  | 'desalinated'
  | 'treated_wastewater'
  | 'rainwater'
  | 'surface_water'
  | 'recycled'
  | 'other';

export const WATER_SOURCES: WaterSource[] = [
  'well',
  'municipal',
  'desalinated',
  'treated_wastewater',
  'rainwater',
  'surface_water',
  'recycled',
  'other',
];

export type WaterRecordType = 'irrigation' | 'hydroponic' | 'other';
export const WATER_RECORD_TYPES: WaterRecordType[] = ['irrigation', 'hydroponic', 'other'];

export interface Farm {
  id: UUID;
  name: string;
  company_id: UUID | null;
  owner_user_id: UUID | null;
  latitude: number;
  longitude: number;
  location_name: string | null;
  total_area_m2: number | null;
  water_source: WaterSource | null;
  daily_water_allowance_l: number | null;
  notes: string | null;
  is_demo: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface FarmSummary extends Farm {
  plantings_count: number;
  hydro_systems_count: number;
  open_alerts: number;
}

export interface FarmInput {
  name: string;
  latitude: number;
  longitude: number;
  location_name?: string | null;
  total_area_m2?: number | null;
  water_source?: WaterSource | null;
  daily_water_allowance_l?: number | null;
  notes?: string | null;
}

export interface Member {
  user_id: UUID;
  full_name: string;
  email: string;
  role: Role;
}

export interface Crop {
  id: UUID;
  code: string;
  name_en: string;
  name_ar: string;
  aliases: string[];
  category: string;
  kc_ini: number;
  kc_mid: number;
  kc_end: number;
  l_ini: number | null;
  l_dev: number | null;
  l_mid: number | null;
  l_late: number | null;
  max_height_m: number | null;
  ky: number | null;
  is_perennial: boolean;
  source: string;
  source_note: string | null;
  is_reference: boolean;
  season_length_days: number | null;
}

export interface CropCreate {
  code: string;
  name_en: string;
  name_ar: string;
  aliases: string[];
  category: string;
  kc_ini: number;
  kc_mid: number;
  kc_end: number;
  l_ini: number | null;
  l_dev: number | null;
  l_mid: number | null;
  l_late: number | null;
  max_height_m: number | null;
  ky: number | null;
  is_perennial: boolean;
  source: string;
  source_note: string | null;
}

export interface IrrigationMethod {
  id: UUID;
  code: string;
  name_en: string;
  name_ar: string;
  efficiency: number;
  source: string;
  source_note: string | null;
}

export type GrowthStage = 'initial' | 'development' | 'mid' | 'late';
export const GROWTH_STAGES: GrowthStage[] = ['initial', 'development', 'mid', 'late'];
export type PlantingStatus = 'active' | 'harvested';

export interface CurrentStage {
  status: 'not_yet_planted' | 'in_season' | 'season_ended' | string;
  stage: string | null;
  days_since_planting: number | null;
  day_in_stage: number | null;
  stage_length: number | null;
  note: string;
}

export interface Planting {
  id: UUID;
  farm_id: UUID;
  crop_id: UUID;
  crop: Crop;
  variety: string | null;
  area_m2: number;
  planting_date: ISODate | null;
  soil_type: string | null;
  irrigation_method_id: UUID | null;
  irrigation_method: IrrigationMethod | null;
  irrigation_efficiency: number | null;
  stage_override: GrowthStage | null;
  status: PlantingStatus;
  notes: string | null;
  created_at: ISODateTime;
  current_stage: CurrentStage | null;
}

export interface PlantingInput {
  crop_id?: UUID;
  variety?: string | null;
  area_m2?: number;
  planting_date?: ISODate | null;
  soil_type?: string | null;
  irrigation_method_id?: UUID | null;
  irrigation_efficiency?: number | null;
  stage_override?: GrowthStage | null;
  status?: PlantingStatus;
  notes?: string | null;
  clear_stage_override?: boolean;
}

/* ------------------------------------------------------------------ water */
export interface WaterRecord {
  id: UUID;
  farm_id: UUID;
  farm_crop_id: UUID | null;
  hydroponic_system_id: UUID | null;
  recorded_at: ISODateTime;
  volume_l: number;
  source: WaterSource;
  record_type: WaterRecordType;
  notes: string | null;
  is_demo: boolean;
  created_at: ISODateTime;
}

export interface WaterRecordInput {
  farm_id: UUID;
  farm_crop_id?: UUID | null;
  hydroponic_system_id?: UUID | null;
  recorded_at: ISODateTime;
  volume_l: number;
  source: WaterSource;
  record_type: WaterRecordType;
  notes?: string | null;
}

export interface CalculationStep {
  name: string;
  formula: string;
  values: Record<string, unknown>;
  result: unknown;
  unit: string;
  reference: string;
}

export interface CalculationResult {
  kc?: number;
  kc_climate_adjusted?: boolean;
  et0_mm?: number;
  etc_mm?: number;
  p_eff_mm?: number;
  nir_mm?: number;
  net_l?: number;
  gross_l?: number;
  coverage_pct?: number | null;
  [key: string]: unknown;
}

export interface Calculation {
  id: UUID | null;
  farm_id?: UUID;
  farm_crop_id?: UUID | null;
  target_date?: ISODate;
  method: string;
  inputs: Record<string, unknown>;
  parameters: Record<string, unknown>;
  steps: CalculationStep[];
  result: CalculationResult;
  weather_snapshot_id?: UUID | null;
  created_at?: ISODateTime;
  weather_status?: WeatherStatusPayload | null;
}

export interface CalculationRequest {
  farm_crop_id: UUID;
  target_date?: ISODate | null;
  et0_override_mm?: number | null;
  precipitation_override_mm?: number | null;
}

export interface CalculationResponse {
  calculation: Calculation | null;
  status: 'calculated' | 'insufficient_data';
  missing_data: string[];
  message: string;
}

export interface SeriesPoint {
  period: string;
  total_l: number;
  records: number;
}

export interface Anomaly {
  date: string;
  total_l: number;
  median_l: number;
  factor: number;
  rule: string;
}

export interface WaterAnalytics {
  farm_id: UUID | null;
  period: string;
  has_data: boolean;
  sufficient_history: boolean;
  message: string | null;
  days_with_records: number;
  total_l: number | null;
  average_per_period_l: number | null;
  min_period_l: number | null;
  max_period_l: number | null;
  trend_pct: number | null;
  l_per_m2: number | null;
  series: SeriesPoint[];
  by_farm: { farm: string; total_l: number }[];
  by_crop: { name_en: string; name_ar: string; total_l: number }[];
  by_source: { source: string; total_l: number }[];
  anomalies: Anomaly[];
}

export interface Baseline {
  id: UUID;
  farm_id: UUID;
  farm_crop_id: UUID | null;
  period_start: ISODate;
  period_end: ISODate;
  total_volume_l: number;
  area_m2: number;
  notes: string | null;
  created_at: ISODateTime;
}

export interface BaselineInput {
  farm_id: UUID;
  farm_crop_id?: UUID | null;
  period_start: ISODate;
  period_end: ISODate;
  total_volume_l: number;
  area_m2: number;
  notes?: string | null;
}

export interface ImpactReport {
  farm_id: UUID;
  baseline: Baseline | null;
  baseline_l_per_m2_day: number | null;
  current_l_per_m2_day: number | null;
  current_days: number;
  measured_savings_pct: number | null;
  measured_savings_note: string;
  calculated_requirement_l: number | null;
  actual_usage_l: number | null;
  apparent_savings_l: number | null;
  apparent_savings_note: string;
}

/* ------------------------------------------------------------------ explanation contract */
export type Certainty = 'entailed' | 'insufficient_data' | string;
export type RuleRole = 'decision' | 'intermediate' | 'advisory' | 'alert';
export type Severity = 'info' | 'warning' | 'critical';

export interface RecommendationHead {
  action: string;
  rule: string;
  title_en: string | null;
  title_ar: string | null;
  text_en: string;
  text_ar: string;
  amount_l: number | null;
}

export interface SupportingFact {
  symbol: string;
  value: boolean;
  used: boolean;
  derived: boolean;
  evidence: Record<string, unknown>;
  description_en: string;
  description_ar: string;
}

export interface TriggeredRule {
  code: string;
  name_en: string;
  name_ar: string;
  antecedent: string;
  consequent: string;
  priority?: number;
  action_group?: string | null;
  category?: string;
  role: RuleRole;
  fired_order: number | null;
  explanation_en: string;
  explanation_ar: string;
  source: string | null;
}

export interface Advisory {
  code: string;
  symbol: string;
  text_en: string;
  text_ar: string;
  name_en: string | null;
  name_ar: string | null;
}

export interface ExplanationAlert {
  code: string;
  symbol: string;
  severity: Severity;
  title_en: string | null;
  title_ar: string | null;
  message_en: string;
  message_ar: string;
}

export interface BlockingCondition {
  literal: string;
  state: 'false' | 'unknown' | 'not_derived' | string;
  description_en: string;
  description_ar: string;
  flip_en: string | null;
  flip_ar: string | null;
  reason: string | null;
}

export interface Alternative {
  rule: string;
  action: string;
  name_en: string;
  name_ar: string;
  status: 'overridden' | 'not_fired';
  blocking: BlockingCondition[];
  reason_en: string;
  reason_ar: string;
}

export interface WhatCouldChange {
  rule?: string;
  action?: string;
  condition_en: string;
  condition_ar: string;
  effect_en: string;
  effect_ar: string;
}

export interface MissingDataItem {
  symbol: string;
  fields: string[];
  hints: { en: string; ar: string }[];
  reason: string | null;
}

export interface ProofNode {
  literal: string;
  status: 'proven' | 'disproven' | 'unknown' | string;
  via_rule: string | null;
  reason: string;
  children: ProofNode[];
}

export interface BackwardChainingResult {
  goal: string;
  status: string;
  missing: string[];
  goals_expanded?: number;
  proof: ProofNode;
}

export interface FiredStep {
  order: number;
  code: string;
  premises: string[];
  conclusion: string;
}

export interface ConflictResolution {
  group: string;
  winner: string;
  candidates: string[];
  overridden: string[];
}

export interface Trace {
  engine: string;
  agenda: string[];
  fired: FiredStep[];
  conflict_resolution: ConflictResolution[];
  blocked?: string[];
  backward_chaining: BackwardChainingResult[];
}

export interface Percept {
  symbol: string;
  value: boolean | null;
  evidence: Record<string, unknown>;
  flip_en: string | null;
  flip_ar: string | null;
}

export interface Explanation {
  recommendation: RecommendationHead | null;
  reason_en: string;
  reason_ar: string;
  supporting_facts: SupportingFact[];
  triggered_rules: TriggeredRule[];
  advisories: Advisory[];
  alerts: ExplanationAlert[];
  alternatives: Alternative[];
  what_could_change: WhatCouldChange[];
  missing_data: MissingDataItem[];
  calculation: Calculation | null;
  certainty: Certainty;
  data_quality: string;
  kb_version?: number;
  trace: Trace;
  percepts: Percept[];
  fired_codes?: string[];
  context?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ irrigation */
export interface IrrigationRequest {
  farm_crop_id: UUID;
  target_date?: ISODate | null;
  available_water_l?: number | null;
  et0_override_mm?: number | null;
  precipitation_override_mm?: number | null;
  persist?: boolean;
}

export interface IrrigationResponse {
  status: 'recommendation' | 'insufficient_data';
  recommendation_id: UUID | null;
  explanation: Explanation;
  weather_status: string;
  alerts_created: number;
}

export interface ScheduleTaskInput {
  name: string;
  farm_crop_id?: UUID | null;
  volume_l: number;
  flow_lph: number;
}

export interface ScheduleRequest {
  farm_id?: UUID | null;
  slot_minutes: 15 | 30 | 60;
  window_start: string;
  window_end: string;
  blocked: { start: string; end: string }[];
  pump_capacity_lph: number;
  daily_limit_l?: number | null;
  tasks: ScheduleTaskInput[];
}

export interface ScheduledTask {
  name: string;
  farm_crop_id: UUID | null;
  volume_l: number;
  flow_lph: number;
  slots: number;
  duration_min: number;
  start: string | null;
  end: string | null;
}

export interface LoadSlot {
  slot: number;
  time: string;
  load_lph: number;
  blocked: boolean;
}

export interface ScheduleResponse {
  status: 'solved' | 'infeasible' | string;
  message: string;
  violated: string | null;
  schedule: ScheduledTask[];
  load_profile?: LoadSlot[];
  stats: Record<string, number>;
  formulation: {
    variables: string[];
    domains: string;
    constraints: string[];
    heuristics: string[];
    neighbors?: Record<string, string[]>;
  };
}

export type RecommendationStatus = 'new' | 'accepted' | 'dismissed';

export interface RecommendationSummary {
  id: UUID;
  farm_id: UUID;
  farm_crop_id: UUID | null;
  hydroponic_system_id: UUID | null;
  kind: string;
  action: string;
  title_en: string;
  title_ar: string;
  summary_en: string;
  summary_ar: string;
  amount_l: number | null;
  target_date: ISODate | null;
  certainty: string;
  data_quality: string;
  status: RecommendationStatus;
  created_at: ISODateTime;
  payload: Explanation | null;
}

/* ------------------------------------------------------------------ hydroponics */
export type HydroSystemType = 'NFT' | 'DWC' | 'EBB_FLOW' | 'DRIP' | 'WICK' | 'AEROPONICS' | 'RAFT' | 'SUBSTRATE';
export const HYDRO_TYPES: HydroSystemType[] = ['NFT', 'DWC', 'EBB_FLOW', 'DRIP', 'WICK', 'AEROPONICS', 'RAFT', 'SUBSTRATE'];
export type SystemStatus = 'active' | 'inactive' | 'maintenance';
export const SYSTEM_STATUSES: SystemStatus[] = ['active', 'inactive', 'maintenance'];

export interface HydroRecord {
  id: UUID;
  system_id: UUID;
  recorded_at: ISODateTime;
  period_days: number;
  water_input_l: number;
  water_consumed_l: number | null;
  water_recycled_l: number | null;
  water_discharged_l: number | null;
  water_losses_l: number | null;
  reservoir_start_l: number | null;
  reservoir_end_l: number | null;
  ph: number | null;
  ec: number | null;
  water_temp_c: number | null;
  notes: string | null;
  created_at: ISODateTime;
}

export interface HydroRecordInput {
  recorded_at: ISODateTime;
  period_days: number;
  water_input_l: number;
  water_consumed_l?: number | null;
  water_recycled_l?: number | null;
  water_discharged_l?: number | null;
  water_losses_l?: number | null;
  reservoir_start_l?: number | null;
  reservoir_end_l?: number | null;
  ph?: number | null;
  ec?: number | null;
  water_temp_c?: number | null;
  notes?: string | null;
}

export interface HydroSystem {
  id: UUID;
  farm_id: UUID;
  name: string;
  system_type: HydroSystemType;
  crop_id: UUID | null;
  growing_area_m2: number;
  plant_count: number;
  reservoir_capacity_l: number;
  is_closed_loop: boolean;
  status: SystemStatus;
  ph_min: number | null;
  ph_max: number | null;
  ec_min: number | null;
  ec_max: number | null;
  threshold_source: string | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  latest_record: HydroRecord | null;
  records_count: number;
}

export interface HydroSystemInput {
  farm_id?: UUID;
  name?: string;
  system_type?: HydroSystemType;
  crop_id?: UUID | null;
  growing_area_m2?: number;
  plant_count?: number;
  reservoir_capacity_l?: number;
  is_closed_loop?: boolean;
  status?: SystemStatus;
  ph_min?: number | null;
  ph_max?: number | null;
  ec_min?: number | null;
  ec_max?: number | null;
  threshold_source?: string | null;
  profile_code?: string | null;
  notes?: string | null;
}

export interface HydroProfile {
  id: UUID;
  code: string;
  name_en: string;
  name_ar: string;
  crop_code: string | null;
  ph_min: number | null;
  ph_max: number | null;
  ec_min: number | null;
  ec_max: number | null;
  source: string;
  source_note: string | null;
}

export interface HydroBalanceRow {
  id: UUID;
  recorded_at: ISODateTime;
  ph: number | null;
  ec: number | null;
  water_temp_c: number | null;
  input_l: number;
  consumed_l: number | null;
  recycled_l: number | null;
  discharged_l: number | null;
  losses_l: number | null;
  delta_storage_l: number | null;
  unaccounted_l: number | null;
  unaccounted_fraction: number | null;
  recirculation_ratio: number | null;
  input_per_day_l: number | null;
  input_per_plant_day_l: number | null;
  input_per_m2_day_l: number | null;
  missing_terms: string[];
}

export interface HydroRanges {
  ph_min: number | null;
  ph_max: number | null;
  ec_min: number | null;
  ec_max: number | null;
  source: string | null;
  configured: boolean;
}

export interface HydroTotals {
  input_l: number;
  consumed_l: number;
  recycled_l: number;
  discharged_l: number;
  losses_l: number;
  days: number;
  input_per_day_l: number | null;
  input_per_plant_day_l: number | null;
  recirculation_ratio: number | null;
}

export interface HydroBalanceReport {
  system_id: UUID;
  has_data: boolean;
  message: string | null;
  totals: HydroTotals | null;
  records: HydroBalanceRow[];
  ranges: HydroRanges;
  evaluation?: Explanation;
}

export interface HydroRecordResult {
  record: HydroRecord;
  balance: Record<string, unknown>;
  evaluation: Explanation;
  alerts_created: number;
}

/* ------------------------------------------------------------------ weather */
export interface WeatherSnapshot {
  id: UUID;
  provider: string;
  fetched_at: ISODateTime;
  latitude: number;
  longitude: number;
  timezone: string | null;
  current: Record<string, number | string | null>;
  daily: Record<string, (number | string | null)[]>;
  units: Record<string, string>;
  variables_set: string | null;
}

export interface WeatherStatusPayload {
  status: 'fresh' | 'cached' | 'unavailable' | string;
  age_hours: number | null;
  stale: boolean;
  message: string;
  fetched_now: boolean;
  snapshot: WeatherSnapshot | null;
  farm_id?: UUID;
  note?: string;
}

/* ------------------------------------------------------------------ dashboard */
export interface DashboardEmpty {
  empty: true;
  farms: number;
  message: string;
  generated_at: ISODateTime;
}

export interface DashboardFull {
  empty: false;
  generated_at: ISODateTime;
  counts: {
    farms: number;
    active_plantings: number;
    hydroponic_systems: number;
    active_hydroponic_systems: number;
    cultivated_area_m2: number;
    open_alerts: number;
  };
  water: {
    last_30_days_l: number | null;
    previous_30_days_l: number | null;
    trend_pct: number | null;
    days_with_records: number;
    hydroponic_l: number | null;
    series: { date: string; total_l: number }[];
    l_per_m2_30d: number | null;
  };
  crop_distribution: { code: string; name_en: string; name_ar: string; area_m2: number }[];
  alerts: {
    by_severity: Partial<Record<Severity, number>>;
    latest: {
      id: UUID;
      severity: Severity;
      title_en: string;
      title_ar: string;
      message_en: string;
      message_ar: string;
      rule_code: string;
      created_at: ISODateTime;
    }[];
  };
  recommendations: {
    id: UUID;
    kind: string;
    action: string;
    title_en: string;
    title_ar: string;
    summary_en: string;
    summary_ar: string;
    amount_l: number | null;
    created_at: ISODateTime;
  }[];
  irrigation_actions_30d: Record<string, number>;
  weather: { farm_id: UUID; farm: string; status: string; age_hours: number | null }[];
  hydroponics: {
    id: UUID;
    name: string;
    type: HydroSystemType;
    status: SystemStatus;
    plant_count: number;
    reservoir_capacity_l: number;
    last_ph: number | null;
    last_ec: number | null;
    last_record_at: ISODateTime | null;
    in_range: boolean | null;
  }[];
  farms: { id: UUID; name: string; latitude: number; longitude: number; is_demo: boolean }[];
  crops_count: number;
}

export type DashboardSummary = DashboardEmpty | DashboardFull;

/* ------------------------------------------------------------------ alerts */
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface Alert {
  id: UUID;
  farm_id: UUID;
  farm_crop_id: UUID | null;
  hydroponic_system_id: UUID | null;
  rule_code: string;
  symbol: string;
  severity: Severity;
  title_en: string;
  title_ar: string;
  message_en: string;
  message_ar: string;
  evidence: { percepts?: Percept[]; rule?: string; [key: string]: unknown };
  status: AlertStatus;
  created_at: ISODateTime;
  acknowledged_at: ISODateTime | null;
  resolved_at: ISODateTime | null;
  resolved_reason: string | null;
}

/* ------------------------------------------------------------------ chatbot */
export interface ChatOption {
  label: string;
  value: string;
}

export interface ChatReply {
  session_id: UUID;
  intent: string | null;
  language: Lang;
  text: string;
  status: 'answer' | 'clarification' | 'missing_data' | 'fallback';
  options: ChatOption[];
  explanation: Explanation | null;
  nlu: {
    normalized?: string;
    intent?: string | null;
    scores?: Record<string, number>;
    entities?: Record<string, unknown>;
  };
}

/* ------------------------------------------------------------------ knowledge base */
export interface KBOverview {
  kb_id: UUID;
  version: number;
  rules_total: number;
  rules_active: number;
  rules_by_category: Record<string, number>;
  facts_by_kind: Record<string, number>;
  percepts: number;
  action_groups: string[];
  pipeline: string[];
}

export type RuleCategory = 'irrigation' | 'decision' | 'advisory' | 'alert' | 'hydroponics';
export const RULE_CATEGORIES: RuleCategory[] = ['irrigation', 'decision', 'advisory', 'alert', 'hydroponics'];

export interface Rule {
  id: UUID;
  code: string;
  name_en: string;
  name_ar: string;
  category: string;
  antecedent: string;
  consequent: string;
  action_group: string | null;
  priority: number;
  severity: Severity | null;
  recommendation_en: string | null;
  recommendation_ar: string | null;
  explanation_en: string;
  explanation_ar: string;
  source: string | null;
  version: number;
  is_active: boolean;
  updated_at: ISODateTime;
}

export interface RuleInput {
  code?: string;
  name_en?: string;
  name_ar?: string;
  category?: RuleCategory;
  antecedent?: string;
  consequent?: string;
  action_group?: string | null;
  priority?: number;
  severity?: Severity | null;
  recommendation_en?: string | null;
  recommendation_ar?: string | null;
  explanation_en?: string;
  explanation_ar?: string;
  source?: string | null;
  is_active?: boolean;
}

export interface RuleHistory {
  id: UUID;
  rule_code: string;
  version: number;
  change_type: string;
  snapshot: Record<string, unknown>;
  changed_by_id: UUID | null;
  changed_at: ISODateTime;
}

export interface Fact {
  id: UUID;
  key: string;
  value: unknown;
  unit: string | null;
  kind: 'scientific' | 'policy' | 'axiom' | string;
  category: string;
  description_en: string;
  description_ar: string;
  source: string | null;
  version: number;
  is_active: boolean;
  updated_at: ISODateTime;
}

export interface PerceptDef {
  symbol: string;
  category: string;
  description_en: string;
  description_ar: string;
  depends_on: string[];
  threshold_key: string | null;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info' | string;
  code: string;
  message: string;
  rules: string[];
  model: Record<string, boolean> | null;
}

export interface ValidationReport {
  ok: boolean;
  consistent: boolean;
  stats: Record<string, number>;
  issues: ValidationIssue[];
}

export interface LogicAskRequest {
  facts: Record<string, boolean>;
  query: string;
  categories?: string[];
  include_axioms?: boolean;
}

export interface LogicAskResponse {
  query: string;
  query_ascii: string;
  query_cnf: string[];
  tell: Record<string, boolean>;
  forward_chaining: {
    entailed: boolean | null;
    applicable: boolean;
    derived: string[];
    agenda: string[];
    fired: FiredStep[];
  };
  backward_chaining:
    | { status: string; missing: string[]; goals_expanded: number; proof: ProofNode }
    | { status: 'not_applicable'; note: string };
  model_checking: {
    entailed: boolean;
    symbols: string[];
    models_checked: number;
    kb_models: number;
    counterexample: Record<string, boolean> | null;
    [key: string]: unknown;
  };
  dpll: {
    entailed: boolean;
    calls: number;
    unit_propagations: number;
    pure_assignments: number;
    clauses: number;
    counter_model: Record<string, boolean> | null;
  };
  resolution: {
    entailed: boolean;
    steps: { from: string; resolvent: string }[];
    clauses_generated?: number;
    limit_reached?: boolean;
  };
  relevant_rules: string[];
  agreement: boolean;
  note: string;
}

/* ------------------------------------------------------------------ land distribution */
export interface LandCandidateInput {
  crop_id?: UUID | null;
  name?: string | null;
  water_l_per_m2?: number | null;
  yield_kg_per_m2: number;
  price_per_kg?: number | null;
  min_area_m2: number;
  max_area_m2?: number | null;
  min_production_kg?: number | null;
}

export type SearchAlgorithm = 'astar' | 'ucs' | 'greedy' | 'bfs';
export const SEARCH_ALGORITHMS: SearchAlgorithm[] = ['astar', 'ucs', 'greedy', 'bfs'];

export interface LandRequest {
  farm_id?: UUID | null;
  total_area_m2: number;
  num_units: number;
  available_water_l: number;
  objective: 'max_production' | 'min_water';
  use_value: boolean;
  production_target_kg?: number | null;
  season_et0_mm_day?: number | null;
  efficiency?: number | null;
  candidates: LandCandidateInput[];
  algorithms: SearchAlgorithm[];
}

export interface LandAllocation {
  name: string;
  units: number;
  area_m2: number;
  water_l: number;
  production_kg: number;
  value: number;
  min_units: number;
  max_units: number | null;
}

export interface AlgorithmRun {
  algorithm: SearchAlgorithm | string;
  found: boolean;
  cost: number | null;
  objective_value: number | null;
  production: number | null;
  water_used_l: number | null;
  allocation: number[] | null;
  nodes_expanded: number;
  nodes_generated: number;
  max_frontier: number;
  runtime_ms: number;
  limit_reached: boolean;
  optimal_guarantee: boolean;
}

export interface LandResponse {
  request_id: UUID;
  status: 'optimal' | 'infeasible' | 'limit_reached';
  objective: string;
  statement: string;
  message: string;
  allocation: LandAllocation[];
  totals: Record<string, number | null>;
  binding_constraints: string[];
  formulation: {
    state?: string;
    initial_state?: string;
    actions?: string;
    transition?: string;
    goal_test?: string;
    step_cost?: string;
    heuristic?: string;
    units?: number;
    unit_area_m2?: number;
    p_max?: number;
    candidates?: {
      name: string;
      crop_id: UUID | null;
      water_l_per_m2: number;
      water_source: string;
      yield_kg_per_m2: number;
      price_per_kg: number | null;
      min_units: number;
      max_units: number | null;
    }[];
    [key: string]: unknown;
  };
  comparison: AlgorithmRun[];
  created_at: ISODateTime;
}

export interface LandRequestSummary {
  id: UUID;
  objective: string;
  created_at: ISODateTime;
  farm_id: UUID | null;
  status: string;
  objective_value: number | null;
  total_water_l: number | null;
  total_area_m2: number;
}

/* ------------------------------------------------------------------ admin */
export interface AuditLog {
  id: UUID;
  action: string;
  entity_type: string | null;
  entity_id: UUID | null;
  details: Record<string, unknown> | null;
  user_id: UUID | null;
  user_email: string | null;
  ip_address: string | null;
  created_at: ISODateTime;
}

export interface LandRequestDetail {
  id: UUID;
  objective: string;
  inputs: LandRequest;
  created_at: ISODateTime;
  result: {
    status: string;
    allocation: LandAllocation[];
    objective_value: number | null;
    total_water_l: number | null;
    total_production: number | null;
    search_stats: Record<string, unknown> | null;
    comparison: AlgorithmRun[] | null;
    message: string | null;
  } | null;
}
