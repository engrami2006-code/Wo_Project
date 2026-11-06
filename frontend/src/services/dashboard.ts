import { http } from './api';
import type { DashboardSummary } from '../types/api';

export const dashboardService = {
  summary: () => http.get<DashboardSummary>('/dashboard/summary'),
};
