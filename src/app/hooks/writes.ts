import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { queryKeys } from '../../data/query/keys.ts';
import type { Completion, KeptDraft, WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import type { AnswerCreate, Today } from '../../domain/models.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';

const IDLE: WriteView = { kind: 'idle' };

export interface AnswerWriteHandle {
  view: WriteView;
  save(input: AnswerCreate, flushKept: () => Promise<KeptDraft | null>): void;
  recheck(): void;
  retry(): void;
  consume(): void;
}

export function useAnswerWrite(dailySemaId: string | null): AnswerWriteHandle {
  const { writes } = useAppServices();
  const subscribe = useCallback(
    (listener: () => void) => (dailySemaId ? writes.subscribe(dailySemaId, listener) : () => undefined),
    [writes, dailySemaId],
  );
  const getView = useCallback(() => (dailySemaId ? writes.getView(dailySemaId) : IDLE), [writes, dailySemaId]);
  const view = useSyncExternalStore(subscribe, getView, getView);

  const actions = useMemo(
    () => ({
      save: (input: AnswerCreate, flushKept: () => Promise<KeptDraft | null>) => {
        void writes.save({ input, flushDraft: flushKept });
      },
      recheck: () => {
        if (dailySemaId) void writes.recheck(dailySemaId);
      },
      retry: () => {
        if (dailySemaId) void writes.retry(dailySemaId);
      },
      consume: () => {
        if (dailySemaId) writes.acknowledgeView(dailySemaId);
      },
    }),
    [writes, dailySemaId],
  );
  return useMemo(() => ({ view, ...actions }), [view, actions]);
}

export function useCompletions() {
  const { completions, platform } = useAppServices();
  return useMemo(
    () => ({
      remember: (completion: Completion) => {
        completions.set(completion.answerId, completion);
        void platform.haptic.memorySaved();
      },
      get: (answerId: string | null) => (answerId ? (completions.get(answerId) ?? null) : null),
    }),
    [completions, platform],
  );
}

export function useCompletionRefresh() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  return useQuery<Today>({
    queryKey: queryKeys.today(session?.ownerScope ?? '', session?.accountScope ?? ''),
    enabled: false,
    queryFn: ({ signal }) => services.session.run('ACTIVE', (auth) => services.api.getToday(auth, signal)),
  });
}

export function usePendingWrite(dailySemaId: string | null) {
  const { writes } = useAppServices();
  const [pending, setPending] = useState<{ questionId: string } | null | 'checking'>('checking');
  useEffect(() => {
    if (!dailySemaId) return;
    let active = true;
    writes.unfinished(dailySemaId).then(
      (found) => {
        if (!active) return;
        setPending(found?.kind === 'unresolved' && found.mode === 'CREATE' ? { questionId: found.questionId } : null);
        if (found) void writes.recheck(dailySemaId);
      },
      () => {
        if (active) setPending(null);
      },
    );
    return () => {
      active = false;
    };
  }, [writes, dailySemaId]);
  return pending;
}
