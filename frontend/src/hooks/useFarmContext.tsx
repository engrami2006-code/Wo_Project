import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useFarms } from './queries';
import type { FarmSummary, UUID } from '../types/api';

const FARM_STORAGE_KEY = 'wo.farm';

function readStoredFarm(): UUID | null {
  try {
    return window.localStorage.getItem(FARM_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface FarmContextValue {
  farms: FarmSummary[];
  loading: boolean;
  farmId: UUID | null;
  farm: FarmSummary | null;
  setFarmId: (id: UUID | null) => void;
}

const FarmContext = createContext<FarmContextValue | null>(null);

/** The farm currently in focus (top bar selector). Pages use it as their default farm filter. */
export function FarmContextProvider({ children }: { children: ReactNode }) {
  const farmsQ = useFarms();
  const farms = useMemo(() => farmsQ.data?.items ?? [], [farmsQ.data]);
  const [farmId, setFarmIdState] = useState<UUID | null>(readStoredFarm);

  const setFarmId = useCallback((id: UUID | null) => {
    setFarmIdState(id);
    try {
      if (id) window.localStorage.setItem(FARM_STORAGE_KEY, id);
      else window.localStorage.removeItem(FARM_STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
  }, []);

  // Keep the selection valid: fall back to the first visible farm.
  useEffect(() => {
    if (!farmsQ.isSuccess) return;
    if (farms.length === 0) {
      if (farmId) setFarmId(null);
      return;
    }
    if (!farmId || !farms.some((f) => f.id === farmId)) setFarmId(farms[0].id);
  }, [farmsQ.isSuccess, farms, farmId, setFarmId]);

  const value = useMemo<FarmContextValue>(
    () => ({
      farms,
      loading: farmsQ.isPending,
      farmId,
      farm: farms.find((f) => f.id === farmId) ?? null,
      setFarmId,
    }),
    [farms, farmsQ.isPending, farmId, setFarmId],
  );
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

export function useFarmContext(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarmContext must be used inside <FarmContextProvider>');
  return ctx;
}
