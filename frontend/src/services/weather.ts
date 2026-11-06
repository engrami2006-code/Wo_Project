import { http } from './api';
import type { UUID, WeatherSnapshot, WeatherStatusPayload } from '../types/api';

export const weatherService = {
  get: (farmId: UUID) => http.get<WeatherStatusPayload>(`/weather/${farmId}`),
  refresh: (farmId: UUID) => http.post<WeatherStatusPayload>(`/weather/${farmId}/refresh`),
  snapshots: (farmId: UUID, limit = 10) => http.get<WeatherSnapshot[]>(`/weather/${farmId}/snapshots`, { limit }),
};
