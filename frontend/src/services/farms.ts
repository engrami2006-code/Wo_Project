import { http } from './api';
import type {
  Crop,
  CropCreate,
  Farm,
  FarmInput,
  FarmSummary,
  IrrigationMethod,
  Member,
  Message,
  Page,
  Planting,
  PlantingInput,
  UUID,
} from '../types/api';

export const farmService = {
  list: (params: { page?: number; size?: number; search?: string } = {}) =>
    http.get<Page<FarmSummary>>('/farms', { page: params.page ?? 1, size: params.size ?? 100, search: params.search }),
  get: (id: UUID) => http.get<Farm>(`/farms/${id}`),
  create: (data: FarmInput) => http.post<Farm>('/farms', data),
  update: (id: UUID, data: Partial<FarmInput>) => http.patch<Farm>(`/farms/${id}`, data),
  remove: (id: UUID) => http.del(`/farms/${id}`),
  members: (id: UUID) => http.get<Member[]>(`/farms/${id}/members`),
  addMember: (id: UUID, userId: UUID) => http.post<Message>(`/farms/${id}/members`, { user_id: userId }),
  removeMember: (id: UUID, userId: UUID) => http.del(`/farms/${id}/members/${userId}`),
  plantings: (id: UUID) => http.get<Planting[]>(`/farms/${id}/crops`),
  createPlanting: (farmId: UUID, data: PlantingInput) => http.post<Planting>(`/farms/${farmId}/crops`, data),
  getPlanting: (id: UUID) => http.get<Planting>(`/farm-crops/${id}`),
  updatePlanting: (id: UUID, data: PlantingInput) => http.patch<Planting>(`/farm-crops/${id}`, data),
  removePlanting: (id: UUID) => http.del(`/farm-crops/${id}`),
};

export const cropService = {
  list: (search?: string) => http.get<Crop[]>('/crops', { search }),
  get: (id: UUID) => http.get<Crop>(`/crops/${id}`),
  create: (data: CropCreate) => http.post<Crop>('/crops', data),
  methods: () => http.get<IrrigationMethod[]>('/irrigation/methods'),
};
