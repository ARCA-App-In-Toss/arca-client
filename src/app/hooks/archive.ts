import { useQuery } from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';
import { queryKeys } from '../../data/query/keys.ts';
import type { AnswerDetail } from '../../domain/models.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';

export function useAnswer(answerId: string | null) {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  return useQuery<AnswerDetail>({
    queryKey: queryKeys.answer(session?.ownerScope ?? '', session?.accountScope ?? '', answerId ?? ''),
    enabled: session?.mode === 'ACTIVE' && session.accountScope !== null && answerId !== null,
    staleTime: 0,
    queryFn: ({ signal }) =>
      services.session.run('ACTIVE', (auth) => services.api.getAnswer(auth, answerId ?? '', signal)),
  });
}

export function useArchive() {
  const { archive } = useAppServices();
  const view = useSyncExternalStore(archive.subscribe, archive.getView, archive.getView);
  const { bootstrap } = useAppSnapshot();
  const routeEpoch = bootstrap.phase === 'ready' ? bootstrap.routeEpoch : -1;
  const actions = useMemo(
    () => ({
      enter: (atTop: () => boolean) => archive.enter({ routeEpoch, atTop }),
      retryFirst: () => archive.retryFirst(),
      loadMore: () => void archive.loadMore(),
      reloadFirst: () => void archive.reloadFirst(),
      refresh: (atTop: () => boolean) => void archive.refresh(atTop),
      applyCandidate: (options: { focus: boolean }) => archive.applyCandidate(options),
      saveAnchor: (answerId: string, viewportOffset: number) =>
        archive.saveAnchor({ answerId, viewportOffset, routeEpoch }),
      noteDeleted: () => archive.noteDeleted(),
      markStale: () => archive.invalidate(),
      takeDeletedNotice: () => archive.takeDeletedNotice(),
    }),
    [archive, routeEpoch],
  );
  return { view, ...actions };
}
