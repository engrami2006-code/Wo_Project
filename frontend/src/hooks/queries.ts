import { useQuery } from '@tanstack/react-query';
import { cropService, farmService } from '../services/farms';
import { hydroService } from '../services/hydro';
import type { UUID } from '../types/api';

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  farms: ['farms'] as const,
  farm: (id: UUID) => ['farms', id] as const,
  members: (id: UUID) => ['farms', id, 'members'] as const,
  plantings: (farmId: UUID) => ['plantings', farmId] as const,
  crops: ['crops'] as const,
  methods: ['irrigation-methods'] as const,
  waterRecords: (f: unknown) => ['water-records', f] as const,
  analytics: (f: unknown) => ['analytics', f] as const,
  calculations: (f: unknown) => ['calculations', f] as const,
  baselines: (farmId: UUID) => ['baselines', farmId] as const,
  impact: (farmId: UUID) => ['impact', farmId] as const,
  hydroSystems: (farmId?: UUID) => ['hydro-systems', farmId ?? 'all'] as const,
  hydroSystem: (id: UUID) => ['hydro-system', id] as const,
  hydroBalance: (id: UUID) => ['hydro-balance', id] as const,
  hydroRecords: (id: UUID, page: number) => ['hydro-records', id, page] as const,
  hydroProfiles: ['hydro-profiles'] as const,
  weather: (farmId: UUID) => ['weather', farmId] as const,
  snapshots: (farmId: UUID) => ['weather-snapshots', farmId] as const,
  alerts: (f: unknown) => ['alerts', f] as const,
  recommendations: (f: unknown) => ['recommendations', f] as const,
  recommendation: (id: UUID) => ['recommendation', id] as const,
  kbOverview: ['kb', 'overview'] as const,
  rules: ['kb', 'rules'] as const,
  facts: ['kb', 'facts'] as const,
  percepts: ['kb', 'percepts'] as const,
  ruleHistory: (id: UUID) => ['kb', 'rule-history', id] as const,
  landRequests: (page: number) => ['land-requests', page] as const,
  users: ['users'] as const,
  companies: ['companies'] as const,
  audit: (f: unknown) => ['audit', f] as const,
  adminStats: ['admin-stats'] as const,
};

export function useFarms() {
  return useQuery({ queryKey: qk.farms, queryFn: () => farmService.list({ size: 200 }), staleTime: 30_000 });
}

export function useCrops() {
  return useQuery({ queryKey: qk.crops, queryFn: () => cropService.list(), staleTime: 5 * 60_000 });
}

export function useMethods() {
  return useQuery({ queryKey: qk.methods, queryFn: () => cropService.methods(), staleTime: 10 * 60_000 });
}

export function usePlantings(farmId: UUID | null | undefined) {
  return useQuery({
    queryKey: qk.plantings(farmId ?? 'none'),
    queryFn: () => farmService.plantings(farmId as UUID),
    enabled: !!farmId,
  });
}

export function useHydroSystems(farmId?: UUID) {
  return useQuery({ queryKey: qk.hydroSystems(farmId), queryFn: () => hydroService.list(farmId) });
}
