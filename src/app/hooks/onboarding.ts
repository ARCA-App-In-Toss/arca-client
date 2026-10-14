import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '../../data/query/keys.ts';
import { DomainFailure } from '../../domain/failures.ts';
import type { ExternalOpenResult } from '../../domain/ports/platform.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';
export interface BoardingPolicy {
  policyId: string;
  version: string;
  title: string;
}
export type BoardingResult = { kind: 'boarded' } | { kind: 'failed'; reason: 'offline' | 'general' };
export function useBoarding() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const query = useQuery({
    queryKey: queryKeys.policies(session?.ownerScope ?? ''),
    enabled: session !== null,
    queryFn: ({ signal }) =>
      services.session.run(services.session.summary?.mode ?? 'GUEST', (auth) =>
        services.api.getConsentPolicies(auth, signal),
      ),
  });
  const policies = useMemo(() => query.data?.filter((p) => p.required) ?? [], [query.data]);
  return {
    policies,
    loading: query.isPending,
    failed: query.isError,
    retry: () => void query.refetch(),
    async submit(consents: readonly { policyId: string; version: string }[]): Promise<BoardingResult> {
      try {
        await services.boarding.submit(consents);
        return { kind: 'boarded' };
      } catch (e) {
        if (e instanceof DomainFailure && e.code === 'POLICY_VERSION_CHANGED' && e.policies) {
          services.queryClient.setQueryData(queryKeys.policies(services.session.summary?.ownerScope ?? ''), e.policies);
        }
        return { kind: 'failed', reason: (await services.platform.network.isOffline()) ? 'offline' : 'general' };
      }
    },
    openPolicy(policyId: string): Promise<ExternalOpenResult> {
      const policy = query.data?.find((p) => p.policyId === policyId);
      return policy ? services.platform.external.openPolicy(policy.url) : Promise.resolve({ kind: 'unavailable' });
    },
  };
}
export function useFinishBoarding() {
  const services = useAppServices();
  return () => services.finishBoarding();
}
export function useAllDeletedNotice(): string | null {
  return null;
}
