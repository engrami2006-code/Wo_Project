import { http } from './api';
import type { AuditLog, Company, Page, User, UserCreate, UserUpdate, UUID } from '../types/api';

export const userService = {
  list: (page = 1, size = 100) => http.get<Page<User>>('/users', { page, size }),
  create: (data: UserCreate) => http.post<User>('/users', data),
  update: (id: UUID, data: UserUpdate) => http.patch<User>(`/users/${id}`, data),
};

export const companyService = {
  list: () => http.get<Company[]>('/companies'),
  create: (name: string) => http.post<Company>('/companies', { name }),
  rename: (id: UUID, name: string) => http.patch<Company>(`/companies/${id}`, { name }),
};

export const adminService = {
  auditLogs: (f: { action?: string; user_id?: UUID; page?: number; size?: number } = {}) =>
    http.get<Page<AuditLog>>('/admin/audit-logs', { ...f }),
  stats: () => http.get<Record<string, number>>('/admin/stats'),
};
