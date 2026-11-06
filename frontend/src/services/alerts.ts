import { http } from './api';
import type { Alert, AlertStatus, Page, Severity, UUID } from '../types/api';

export const alertService = {
  list: (f: { farm_id?: UUID; status?: AlertStatus; severity?: Severity; page?: number; size?: number } = {}) =>
    http.get<Page<Alert>>('/alerts', { ...f }),
  update: (id: UUID, status: 'acknowledged' | 'resolved') => http.patch<Alert>(`/alerts/${id}`, { status }),
  evaluate: (farmId: UUID) => http.post<Record<string, number>>('/alerts/evaluate', {}, { farm_id: farmId }),
};
