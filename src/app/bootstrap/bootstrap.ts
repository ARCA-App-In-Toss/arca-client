import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/query/keys.ts';
import { DomainFailure, LocalPersistenceFailure, TransportFailure } from '../../domain/failures.ts';
import type { ArcaApi } from '../../domain/ports/api.ts';
import type { NetworkPort } from '../../domain/ports/platform.ts';
import type { JournalPort, ManifestScope, RootData } from '../../domain/ports/storage.ts';
import type { SessionController, SessionSummary } from '../../domain/session/sessionController.ts';

export type StartErrorKind = 'general' | 'offline' | 'maintenance';

export interface StartError {
  kind: StartErrorKind;
  safeErrorId: string | null;
}

export type BootstrapState =
  | { phase: 'starting' }
  | { phase: 'ready'; target: 'intro' | 'today' | 'boarded'; routeEpoch: number }
  | { phase: 'failed'; error: StartError; retry: 'idle' | 'running' | 'failed' };

export interface BootstrapDeps {
  session: SessionController;
  journal: JournalPort;
  api: ArcaApi;
  queryClient: QueryClient;
  network: NetworkPort;
}

function newAreaRef(): string {
  return globalThis.crypto?.randomUUID?.() ?? `area-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function reconcileLocalArea(journal: JournalPort, summary: SessionSummary): Promise<RootData> {
  const target = summary.mode === 'ACTIVE' ? summary.accountScope : null;
  let root = await journal.readRoot();

  if (target && !root?.generations.some((g) => g.generation === target)) {
    const ref = newAreaRef();
    await journal.initArea({ kind: 'generation', ref });
    root = await journal.updateRoot((current) => ({
      currentGeneration: current?.currentGeneration ?? null,
      routeEpoch: current?.routeEpoch ?? 0,
      generations: [...(current?.generations ?? []), { generation: target, ref }],
    }));
  }
  if (!root || root.currentGeneration !== target) {
    root = await journal.updateRoot((current) => ({
      currentGeneration: target,
      routeEpoch: (current?.routeEpoch ?? 0) + (current ? 1 : 0),
      generations: current?.generations ?? [],
    }));
  }

  for (const stale of root.generations.filter((g) => g.generation !== target)) {
    await journal.clearArea({ kind: 'generation', ref: stale.ref });
    root = await journal.updateRoot((current) => ({
      currentGeneration: current?.currentGeneration ?? null,
      routeEpoch: current?.routeEpoch ?? 0,
      generations: (current?.generations ?? []).filter((g) => g.ref !== stale.ref),
    }));
  }

  if (target) {
    const area = root.generations.find((g) => g.generation === target);
    if (!area) throw new LocalPersistenceFailure('corrupt');
    const scope: ManifestScope = { kind: 'generation', ref: area.ref };
    if ((await journal.readManifest(scope)) === null) throw new LocalPersistenceFailure('corrupt');
    await journal.repair(scope);
    await journal.clearArea({ kind: 'pre' });
  }
  return root;
}

async function classify(error: unknown, network: NetworkPort): Promise<StartError> {
  if (error instanceof DomainFailure) {
    return { kind: error.code === 'MAINTENANCE' ? 'maintenance' : 'general', safeErrorId: error.requestId };
  }
  if (error instanceof TransportFailure && (error.reason === 'network' || error.reason === 'timeout')) {
    return { kind: (await network.isOffline()) ? 'offline' : 'general', safeErrorId: null };
  }
  return { kind: 'general', safeErrorId: null };
}

export interface BootstrapOutcome {
  state: BootstrapState;
  area: ManifestScope | null;
}

export async function runBootstrap(
  deps: BootstrapDeps,
  reuse?: SessionSummary,
  handoff: 'boarded' | null = null,
): Promise<BootstrapOutcome> {
  try {
    const summary = reuse ?? (await deps.session.establish());
    const root = await reconcileLocalArea(deps.journal, summary);

    if (summary.mode === 'GUEST') {
      return { state: { phase: 'ready', target: 'intro', routeEpoch: root.routeEpoch }, area: null };
    }
    const areaRef = root.generations.find((g) => g.generation === summary.accountScope)?.ref;
    if (!areaRef) throw new LocalPersistenceFailure('corrupt');

    const area: ManifestScope = { kind: 'generation', ref: areaRef };
    const today = await deps.session.run('ACTIVE', (auth) => deps.api.getToday(auth));
    const generation = summary.accountScope ?? '';
    deps.queryClient.setQueryData(queryKeys.today(summary.ownerScope, generation), today);
    return {
      state: { phase: 'ready', target: handoff ?? 'today', routeEpoch: root.routeEpoch },
      area,
    };
  } catch (error) {
    return { state: { phase: 'failed', error: await classify(error, deps.network), retry: 'idle' }, area: null };
  }
}
