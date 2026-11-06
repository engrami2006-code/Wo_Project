import { http } from './api';
import type {
  Baseline,
  BaselineInput,
  Calculation,
  CalculationRequest,
  CalculationResponse,
  ImpactReport,
  Page,
  UUID,
  WaterAnalytics,
  WaterRecord,
  WaterRecordInput,
} from '../types/api';

export interface RecordFilters {
  farm_id?: UUID;
  farm_crop_id?: UUID;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}

export interface AnalyticsFilters {
  farm_id?: UUID;
  period: 'day' | 'week' | 'month' | 'year';
  date_from?: string;
  date_to?: string;
}

export const waterService = {
  records: (f: RecordFilters) => http.get<Page<WaterRecord>>('/water/records', { ...f }),
  createRecord: (data: WaterRecordInput) => http.post<WaterRecord>('/water/records', data),
  removeRecord: (id: UUID) => http.del(`/water/records/${id}`),
  analytics: (f: AnalyticsFilters) => http.get<WaterAnalytics>('/water/analytics', { ...f }),
  calculate: (data: CalculationRequest) => http.post<CalculationResponse>('/water/calculations', data),
  calculations: (f: { farm_id?: UUID; farm_crop_id?: UUID; limit?: number } = {}) =>
    http.get<Calculation[]>('/water/calculations', { ...f }),
  baselines: (farmId: UUID) => http.get<Baseline[]>('/water/baselines', { farm_id: farmId }),
  createBaseline: (data: BaselineInput) => http.post<Baseline>('/water/baselines', data),
  impact: (farmId: UUID) => http.get<ImpactReport>('/water/impact', { farm_id: farmId }),
};
