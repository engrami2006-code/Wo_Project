import { http } from './api';
import type {
  Explanation,
  HydroBalanceReport,
  HydroProfile,
  HydroRecord,
  HydroRecordInput,
  HydroRecordResult,
  HydroSystem,
  HydroSystemInput,
  Page,
  UUID,
} from '../types/api';

export const hydroService = {
  list: (farmId?: UUID) => http.get<HydroSystem[]>('/hydroponics', { farm_id: farmId }),
  get: (id: UUID) => http.get<HydroSystem>(`/hydroponics/${id}`),
  create: (data: HydroSystemInput) => http.post<HydroSystem>('/hydroponics', data),
  update: (id: UUID, data: HydroSystemInput) => http.patch<HydroSystem>(`/hydroponics/${id}`, data),
  remove: (id: UUID) => http.del(`/hydroponics/${id}`),
  profiles: () => http.get<HydroProfile[]>('/hydroponics/profiles'),
  records: (id: UUID, page = 1, size = 50) => http.get<Page<HydroRecord>>(`/hydroponics/${id}/records`, { page, size }),
  addRecord: (id: UUID, data: HydroRecordInput) => http.post<HydroRecordResult>(`/hydroponics/${id}/records`, data),
  balance: (id: UUID) => http.get<HydroBalanceReport>(`/hydroponics/${id}/balance`),
  evaluate: (id: UUID) => http.get<Explanation>(`/hydroponics/${id}/evaluation`),
};
