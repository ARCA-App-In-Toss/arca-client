import { QueryClient } from '@tanstack/react-query';
import { createArcaApi } from '../data/api/arcaApi.ts';
import { createHttpTransport } from '../data/api/transport.ts';
import { queryKeys } from '../data/query/keys.ts';
import { StorageJournal } from '../data/storage/journal.ts';
import { AnalyticsQueue } from '../domain/analytics/analyticsQueue.ts';
import { ArchiveChains } from '../domain/archive/archiveChains.ts';
import { AnswerWriteCoordinator, type Completion, type SyncEvent } from '../domain/commands/answerWriteCoordinator.ts';
import { AnswerWriteStore } from '../domain/commands/answerWriteStore.ts';
import { AllDataDelete } from '../domain/deletion/allDataDelete.ts';
import { DraftRepository } from '../domain/drafts/draftRepository.ts';
import type { PastDraftEntry } from '../domain/drafts/pastDraftEntry.ts';
import type { AnswerDetail, Today } from '../domain/models.ts';
import { BoardingCoordinator } from '../domain/onboarding/boardingCoordinator.ts';
import { NicknameCoordinator } from '../domain/onboarding/nicknameCoordinator.ts';
import type { ArcaApi } from '../domain/ports/api.ts';
import type { PlatformPort } from '../domain/ports/platform.ts';
import type { JournalPort, ManifestScope } from '../domain/ports/storage.ts';
import { SessionController, type SessionSummary } from '../domain/session/sessionController.ts';
import { type BootstrapState, runBootstrap } from './bootstrap/bootstrap.ts';

export interface AppSnapshot {
  bootstrap: BootstrapState;
  session: SessionSummary | null;
}
export interface AppServices {
  platform: PlatformPort;
  api: ArcaApi;
  queryClient: QueryClient;
  session: SessionController;
  journal: JournalPort;
  drafts: DraftRepository;
  writes: AnswerWriteCoordinator;
  answers: AnswerWriteCoordinator;
  boarding: BoardingCoordinator;
  nickname: NicknameCoordinator;
  analytics: AnalyticsQueue;
  archive: ArchiveChains;
  deleteAll: AllDataDelete;
  completions: Map<string, Completion>;
  answerRefs: Map<string, string>;
  draftRefs: Map<string, PastDraftEntry>;
  cacheToday(today: Today): void;
  consumeTodaySeed(): boolean;
  getSnapshot(): AppSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<BootstrapState>;
  finishBoarding(): void;
}
export interface AppServicesConfig {
  platform: PlatformPort;
  apiBase: string | undefined;
  fetch?: typeof fetch;
}
export function createAppServices(config: AppServicesConfig): AppServices {
  const { platform } = config;
  const api = createArcaApi(
    createHttpTransport({ baseUrl: config.apiBase, ...(config.fetch ? { fetch: config.fetch } : {}) }),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 5 * 60_000 } },
  });
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  const journal = new StorageJournal(platform.storage, platform.clock);
  const analytics = new AnalyticsQueue({ session, api, clock: platform.clock, appVersion: __APP_VERSION__ });
  let snapshot: AppSnapshot = { bootstrap: { phase: 'starting' }, session: null };
  const listeners = new Set<() => void>();
  const publish = (next: AppSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  let currentArea: ManifestScope | null = null;
  let todaySeeded = false;
  let running: Promise<BootstrapState> | null = null;
  const completions = new Map<string, Completion>();
  const answerRefs = new Map<string, string>();
  const draftRefs = new Map<string, PastDraftEntry>();
  const boarding = new BoardingCoordinator({ session });
  const nickname = new NicknameCoordinator({
    session,
    api,
    network: platform.network,
    syncProfile: (profile) => {
      const s = session.summary;
      if (s?.accountScope) queryClient.setQueryData(queryKeys.member(s.ownerScope, s.accountScope), profile);
    },
  });
  const deleteAll = new AllDataDelete({ session, api });
  const archive = new ArchiveChains({
    session,
    api,
    scope: () => {
      const s = snapshot.session;
      return currentArea && s?.accountScope ? { ownerScope: s.ownerScope, accountScope: s.accountScope } : null;
    },
  });
  const drafts = new DraftRepository({ journal, clock: platform.clock, area: () => currentArea });
  const cacheToday = (today: Today) => {
    const s = session.summary;
    if (!s?.accountScope) return;
    queryClient.setQueryData(queryKeys.today(s.ownerScope, s.accountScope), today);
    if (today.answer.state === 'ANSWERED')
      queryClient.setQueryData(
        queryKeys.answer(s.ownerScope, s.accountScope, today.answer.value.answerId),
        today.answer.value,
      );
  };
  const sync = async (event: SyncEvent) => {
    const s = session.summary;
    if (!s?.accountScope) return;
    if (event.kind === 'today') {
      cacheToday(event.today);
      return;
    }
    const key = queryKeys.today(s.ownerScope, s.accountScope);
    const today = queryClient.getQueryData<Today>(key);
    if (event.kind === 'saved') {
      const a = event.result.answer;
      queryClient.setQueryData<AnswerDetail>(queryKeys.answer(s.ownerScope, s.accountScope, a.answerId), a);
      archive.patchRow(a);
      if (today)
        cacheToday({
          ...today,
          activeAnswerCount: event.result.activeAnswerCount,
          ...(a.dailySemaId === today.sema.dailySemaId ? { answer: { state: 'ANSWERED', value: a } } : {}),
        });
    } else {
      queryClient.removeQueries({ queryKey: queryKeys.answer(s.ownerScope, s.accountScope, event.answerId) });
      archive.removeRow(event.answerId);
      completions.delete(event.answerId);
      if (today)
        cacheToday({
          ...today,
          ...(event.count >= 0 ? { activeAnswerCount: { count: event.count } } : {}),
          ...(today.answer.state === 'ANSWERED' && today.answer.value.answerId === event.answerId
            ? { answer: { state: 'UNANSWERED' } }
            : {}),
        });
    }
  };
  const fence = () =>
    currentArea && snapshot.session
      ? { ownerScope: snapshot.session.ownerScope, accountScope: snapshot.session.accountScope }
      : null;
  const writeStore = new AnswerWriteStore({ journal, area: () => currentArea, now: () => drafts.now() });
  const answerStore = new AnswerWriteStore({
    journal,
    area: () => currentArea,
    namespace: 'answer',
    now: () => drafts.now(),
  });
  const writes = new AnswerWriteCoordinator({
    session,
    api,
    store: writeStore,
    drafts,
    now: () => drafts.now(),
    fence,
    syncCurrentResources: sync,
  });
  const answers = new AnswerWriteCoordinator({
    session,
    api,
    store: answerStore,
    drafts,
    now: () => drafts.now(),
    fence,
    syncCurrentResources: sync,
  });
  const reset = () => {
    completions.clear();
    answerRefs.clear();
    draftRefs.clear();
    writes.reset();
    answers.reset();
    archive.reset();
  };
  const runStart = (reuse?: SessionSummary, handoff: 'boarded' | null = null): Promise<BootstrapState> => {
    running ??= (async () => {
      const previous = snapshot.bootstrap;
      publish({
        ...snapshot,
        bootstrap: previous.phase === 'failed' ? { ...previous, retry: 'running' } : { phase: 'starting' },
      });
      currentArea = null;
      const outcome = await runBootstrap(
        { session, journal, api, queryClient, network: platform.network },
        reuse,
        handoff,
      );
      currentArea = outcome.area;
      const result = outcome.state;
      if (outcome.area && result.phase === 'ready') {
        todaySeeded = true;
        const s = session.summary;
        if (s?.accountScope) {
          const today = queryClient.getQueryData<Today>(queryKeys.today(s.ownerScope, s.accountScope));
          if (today) cacheToday(today);
        }
        void drafts.purgeExpired().catch(() => undefined);
        void writeStore.purgeExpired().catch(() => undefined);
        void answerStore.purgeExpired().catch(() => undefined);
      }
      const next: BootstrapState =
        result.phase === 'failed' && previous.phase === 'failed' ? { ...result, retry: 'failed' } : result;
      publish({ ...snapshot, bootstrap: next });
      return next;
    })().finally(() => {
      running = null;
    });
    return running;
  };
  session.subscribe((event) => {
    const wasReady = !running && snapshot.bootstrap.phase === 'ready';
    if (event.kind === 'discarded') {
      currentArea = null;
      reset();
      analytics.discardAll();
      queryClient.clear();
      publish({ bootstrap: wasReady ? { phase: 'starting' } : snapshot.bootstrap, session: null });
      if (wasReady) queueMicrotask(() => void runStart());
      return;
    }
    if (event.ownerChanged) {
      currentArea = null;
      reset();
      if (!event.boarded) analytics.discardAll();
      queryClient.clear();
    }
    const reconcile = wasReady && (event.ownerChanged || snapshot.session?.mode !== event.summary.mode);
    publish({ session: event.summary, bootstrap: reconcile ? { phase: 'starting' } : snapshot.bootstrap });
    if (event.boarded && event.summary.accountScope)
      queryClient.setQueryData(queryKeys.member(event.summary.ownerScope, event.summary.accountScope), event.boarded);
    if (reconcile) queueMicrotask(() => void runStart(event.summary, event.boarded ? 'boarded' : null));
  });
  platform.network.onReconnect(() => analytics.hint());
  platform.lifecycle.onVisibilityChange((visible) => {
    analytics.hint();
    if (!visible) return;
    void session
      .refreshOnForeground()
      .then(() => {
        const s = session.summary;
        if (s?.accountScope)
          void queryClient.invalidateQueries({ queryKey: queryKeys.today(s.ownerScope, s.accountScope) });
      })
      .catch(() => undefined);
  });
  return {
    platform,
    api,
    queryClient,
    session,
    journal,
    drafts,
    writes,
    answers,
    boarding,
    nickname,
    analytics,
    archive,
    deleteAll,
    completions,
    answerRefs,
    draftRefs,
    cacheToday,
    consumeTodaySeed() {
      const seeded = todaySeeded;
      todaySeeded = false;
      return seeded;
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => runStart(),
    finishBoarding() {
      const current = snapshot.bootstrap;
      if (current.phase === 'ready' && current.target === 'boarded')
        publish({ ...snapshot, bootstrap: { ...current, target: 'today' } });
    },
  };
}
