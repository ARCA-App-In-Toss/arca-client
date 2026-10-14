import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { queryKeys } from '../../data/query/keys.ts';
import type { Today } from '../../domain/models.ts';
import { msUntilKstBoundary } from '../../domain/time/kst.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';

export function useToday() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const active = session?.mode === 'ACTIVE' && session.accountScope !== null;
  return useQuery<Today>({
    queryKey: queryKeys.today(session?.ownerScope ?? '', session?.accountScope ?? ''),
    enabled: active,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: ({ signal }) =>
      services.session.run('ACTIVE', async (auth) => {
        const today = await services.api.getToday(auth, signal);
        return today;
      }),
  });
}

export function useRefreshToday() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  return useCallback(() => {
    if (!session?.accountScope) return;
    void services.queryClient.invalidateQueries({
      queryKey: queryKeys.today(session.ownerScope, session.accountScope),
    });
  }, [services, session?.ownerScope, session?.accountScope]);
}

export function useTodayRefreshEvents(options: { onEntry: boolean }) {
  const services = useAppServices();
  const refresh = useRefreshToday();
  const { onEntry } = options;
  useEffect(() => {
    if (onEntry && !services.consumeTodaySeed()) refresh();
  }, [services, refresh, onEntry]);
  useEffect(() => {
    const handle = setTimeout(refresh, msUntilKstBoundary(services.platform.clock.now()));
    return () => clearTimeout(handle);
  }, [services, refresh]);
}
