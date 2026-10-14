import { useCallback } from 'react';
import type { ExternalOpenResult } from '../../domain/ports/platform.ts';
import { useAppServices } from '../services.tsx';
export type SettingsLink = 'terms' | 'privacy' | 'support';
const IDS = { terms: 'terms-of-service', privacy: 'privacy-policy' } as const;
export function useSettingsLinks() {
  const services = useAppServices();
  return useCallback(
    async (link: SettingsLink): Promise<ExternalOpenResult> => {
      try {
        if (link === 'support') return await services.platform.external.openSupport();
        const policies = await services.session.run('ACTIVE', (auth) => services.api.getConsentPolicies(auth));
        const policy = policies.find((p) => p.policyId === IDS[link]);
        return policy ? await services.platform.external.openPolicy(policy.url) : { kind: 'unavailable' };
      } catch {
        return { kind: 'unavailable' };
      }
    },
    [services],
  );
}
export const appVersion: string = __APP_VERSION__;
