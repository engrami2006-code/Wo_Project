import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState } from './ErrorState';

/** Renders loading / error(+retry) / content for a query. */
export function QueryBoundary<T>({
  query,
  loading,
  children,
  compactError,
}: {
  query: UseQueryResult<T>;
  loading: ReactNode;
  children: (data: T) => ReactNode;
  compactError?: boolean;
}) {
  if (query.isPending) return <>{loading}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} compact={compactError} />;
  return <>{children(query.data as T)}</>;
}
