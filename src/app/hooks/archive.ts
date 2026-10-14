import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../data/query/keys.ts';
import type { AnswerDetail } from '../../domain/models.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';
export class AnswerReadUnavailable extends Error {
  constructor() {
    super('answer:read-unavailable');
  }
}
export function useAnswer(answerId: string | null) {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const key = queryKeys.answer(session?.ownerScope ?? '', session?.accountScope ?? '', answerId ?? '');
  return useQuery<AnswerDetail>({
    queryKey: key,
    enabled: session?.mode === 'ACTIVE' && answerId !== null,
    staleTime: 0,
    queryFn: async () => {
      const today = await services.session.run('ACTIVE', (auth) => services.api.getToday(auth));
      services.cacheToday(today);
      if (today.answer.state === 'ANSWERED' && today.answer.value.answerId === answerId) return today.answer.value;
      const cached = services.queryClient.getQueryData<AnswerDetail>(key);
      if (cached) return cached;
      throw new AnswerReadUnavailable();
    },
  });
}
