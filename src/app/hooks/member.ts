import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../data/query/keys.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';
export function useMemberProfile() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  return useQuery({
    queryKey: queryKeys.member(session?.ownerScope ?? '', session?.accountScope ?? ''),
    enabled: session?.mode === 'ACTIVE',
    queryFn: () => services.session.run('ACTIVE', (auth) => services.api.getMember(auth)),
  });
}
export const useBoardedMember = useMemberProfile;
export type NicknameSaveOutcome = { kind: 'saved' | 'rejected' | 'unsent' | 'unknown' };
export function useNicknameSave() {
  const services = useAppServices();
  return async (nickname: string | null): Promise<NicknameSaveOutcome> => ({
    kind: await services.nickname.save(nickname),
  });
}
