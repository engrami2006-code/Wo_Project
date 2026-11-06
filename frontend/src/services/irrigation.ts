import { http } from './api';
import type {
  IrrigationRequest,
  IrrigationResponse,
  Page,
  RecommendationStatus,
  RecommendationSummary,
  ScheduleRequest,
  ScheduleResponse,
  UUID,
} from '../types/api';

export const irrigationService = {
  recommend: (data: IrrigationRequest) => http.post<IrrigationResponse>('/irrigation/recommendation', data),
  schedule: (data: ScheduleRequest) => http.post<ScheduleResponse>('/irrigation/schedule', data),
};

export const recommendationService = {
  list: (f: { farm_id?: UUID; kind?: string; page?: number; size?: number } = {}) =>
    http.get<Page<RecommendationSummary>>('/recommendations', { ...f }),
  get: (id: UUID) => http.get<RecommendationSummary>(`/recommendations/${id}`),
  setStatus: (id: UUID, status: RecommendationStatus) =>
    http.patch<RecommendationSummary>(`/recommendations/${id}`, { status }),
};
