import { http } from './api';
import type { LandRequest, LandRequestDetail, LandRequestSummary, LandResponse, Page, UUID } from '../types/api';

export const landService = {
  optimize: (data: LandRequest) => http.post<LandResponse>('/land-distribution/optimize', data),
  requests: (page = 1, size = 10) => http.get<Page<LandRequestSummary>>('/land-distribution/requests', { page, size }),
  request: (id: UUID) => http.get<LandRequestDetail>(`/land-distribution/requests/${id}`),
};
