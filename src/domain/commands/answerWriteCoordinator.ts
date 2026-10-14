import type { DraftRepository } from '../drafts/draftRepository.ts';
import { DomainFailure } from '../failures.ts';
import type { AnswerDetail, AnswerWriteInput, SaveAnswerResult, Today } from '../models.ts';
import type { ArcaApi } from '../ports/api.ts';
import type { SessionController } from '../session/sessionController.ts';
import type { AnswerWriteStore, PendingAnswer } from './answerWriteStore.ts';
export interface Completion extends SaveAnswerResult {
  answerId: string;
}
export type WriteView =
  | { kind: 'idle' }
  | {
      kind: 'working';
      mode: 'CREATE' | 'UPDATE' | 'DELETE';
      stage: 'keeping' | 'sending' | 'confirming';
      trackerKept: boolean;
    }
  | { kind: 'unconfirmed'; mode: 'CREATE' | 'UPDATE' | 'DELETE'; trackerKept: boolean }
  | { kind: 'succeeded'; completion: Completion }
  | { kind: 'deleted' }
  | { kind: 'rejected'; mode: 'CREATE' | 'UPDATE' | 'DELETE'; code: string }
  | { kind: 'localFailure' };
export interface KeptDraft {
  text: string;
  lastModifiedAt: number;
}
export type Unfinished =
  | { kind: 'unresolved'; mode: 'CREATE'; questionId: string }
  | { kind: 'unresolved'; mode: 'UPDATE' | 'DELETE' }
  | null;
export type SyncEvent =
  | { kind: 'saved'; result: SaveAnswerResult }
  | { kind: 'deleted'; answerId: string; count: number }
  | { kind: 'today'; today: Today };
export interface OwnerFence {
  ownerScope: string;
  accountScope: string | null;
}
export interface AnswerWriteCoordinatorDeps {
  session: SessionController;
  api: ArcaApi;
  store: AnswerWriteStore;
  drafts: DraftRepository;
  now: () => number;
  fence: () => OwnerFence | null;
  syncCurrentResources: (event: SyncEvent) => Promise<void>;
}
const IDLE: WriteView = Object.freeze({ kind: 'idle' });
export class AnswerWriteCoordinator {
  private readonly deps: AnswerWriteCoordinatorDeps;
  private readonly views = new Map<string, WriteView>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private epoch = 0;
  constructor(deps: AnswerWriteCoordinatorDeps) {
    this.deps = deps;
  }
  getView(target: string) {
    return this.views.get(target) ?? IDLE;
  }
  subscribe(target: string, listener: () => void) {
    const set = this.listeners.get(target) ?? new Set();
    set.add(listener);
    this.listeners.set(target, set);
    return () => {
      set.delete(listener);
    };
  }
  private set(target: string, view: WriteView) {
    this.views.set(target, view);
    for (const l of this.listeners.get(target) ?? []) l();
  }
  reset() {
    this.epoch++;
    this.inFlight.clear();
    for (const target of this.views.keys()) this.set(target, IDLE);
  }
  acknowledgeView(target: string) {
    if (this.getView(target).kind !== 'working') this.set(target, IDLE);
  }
  async unfinished(target: string): Promise<Unfinished> {
    const p = await this.deps.store.get(target);
    if (!p) return null;
    return p.input.mode === 'CREATE'
      ? { kind: 'unresolved', mode: 'CREATE', questionId: p.input.questionId }
      : { kind: 'unresolved', mode: p.input.mode };
  }
  save(request: { input: AnswerWriteInput; flushDraft: () => Promise<KeptDraft | null> }): Promise<void> {
    const target = request.input.mode === 'CREATE' ? request.input.dailySemaId : request.input.answerId;
    return this.single(target, async (check) => {
      this.set(target, { kind: 'working', mode: request.input.mode, stage: 'keeping', trackerKept: false });
      const kept = await request.flushDraft();
      check();
      if (!kept) {
        this.set(target, { kind: 'localFailure' });
        return;
      }
      const pending = { input: request.input, content: kept.text, lastModifiedAt: kept.lastModifiedAt };
      try {
        await this.deps.store.put(target, pending);
      } catch {
        check();
        this.set(target, { kind: 'localFailure' });
        return;
      }
      check();
      await this.send(target, pending, check);
    });
  }
  delete(request: { input: { answerId: string } }) {
    const target = request.input.answerId;
    return this.single(target, async (check) => {
      const p: PendingAnswer = {
        input: { mode: 'DELETE', answerId: target },
        content: null,
        lastModifiedAt: this.deps.now(),
      };
      this.set(target, { kind: 'working', mode: 'DELETE', stage: 'keeping', trackerKept: false });
      try {
        await this.deps.store.put(target, p);
      } catch {
        check();
        this.set(target, { kind: 'localFailure' });
        return;
      }
      check();
      await this.send(target, p, check);
    });
  }
  retry(target: string) {
    return this.single(target, async (check) => {
      const p = await this.deps.store.get(target);
      check();
      if (p) await this.send(target, p, check);
    });
  }
  recheck(target: string) {
    return this.single(target, async (check) => {
      const p = await this.deps.store.get(target);
      check();
      if (!p) return;
      this.set(target, { kind: 'working', mode: p.input.mode, stage: 'confirming', trackerKept: true });
      await this.confirm(target, p, check);
    });
  }
  private single(target: string, run: (check: () => void) => Promise<void>): Promise<void> {
    const existing = this.inFlight.get(target);
    if (existing) return existing;
    const epoch = this.epoch;
    const owner = this.deps.fence();
    const check = () => {
      const n = this.deps.fence();
      if (epoch !== this.epoch || !owner || n?.ownerScope !== owner.ownerScope || n.accountScope !== owner.accountScope)
        throw new Error('answer:stale');
    };
    const promise = Promise.resolve()
      .then(() => run(check))
      .catch(() => {
        if (epoch === this.epoch && this.deps.fence()?.ownerScope === owner?.ownerScope) {
          const previous = this.getView(target);
          this.set(
            target,
            (previous.kind === 'working' || previous.kind === 'unconfirmed') && previous.trackerKept
              ? { kind: 'unconfirmed', mode: previous.mode, trackerKept: true }
              : { kind: 'localFailure' },
          );
        }
      })
      .finally(() => {
        if (this.inFlight.get(target) === promise) this.inFlight.delete(target);
      });
    this.inFlight.set(target, promise);
    return promise;
  }
  private async send(target: string, p: PendingAnswer, check: () => void) {
    this.set(target, { kind: 'working', mode: p.input.mode, stage: 'sending', trackerKept: true });
    try {
      if (p.input.mode === 'DELETE') {
        const result = await this.deps.session.run('ACTIVE', (auth) =>
          this.deps.api.deleteAnswer(auth, p.input.mode === 'DELETE' ? p.input.answerId : target),
        );
        check();
        await this.finishDelete(target, result.activeAnswerCount.count, check);
        return;
      }
      const input = p.input;
      const content = p.content ?? '';
      const result = await this.deps.session.run('ACTIVE', (auth) =>
        input.mode === 'CREATE'
          ? this.deps.api.createAnswer(auth, {
              dailySemaId: input.dailySemaId,
              semaId: input.semaId,
              questionId: input.questionId,
              content,
            })
          : this.deps.api.updateAnswer(auth, input.answerId, content),
      );
      check();
      await this.finishSave(target, p, result, check);
    } catch (e) {
      check();
      if (e instanceof DomainFailure && e.code === 'ANSWER_NOT_FOUND' && p.input.mode === 'DELETE') {
        await this.finishDelete(target, null, check);
        return;
      }
      if (e instanceof DomainFailure && e.code === 'ANSWER_ALREADY_EXISTS' && p.input.mode === 'CREATE') {
        await this.confirm(target, p, check, true);
        return;
      }
      if (e instanceof DomainFailure && ['VALIDATION', 'CONFLICT', 'RATE_LIMIT'].includes(e.category)) {
        await this.deps.store.remove(target).catch(() => undefined);
        check();
        this.set(target, { kind: 'rejected', mode: p.input.mode, code: e.code });
        return;
      }
      await this.confirm(target, p, check);
    }
  }
  private async confirm(target: string, p: PendingAnswer, check: () => void, exists = false) {
    if (p.input.mode !== 'CREATE') {
      await this.confirmExisting(target, p, p.input.answerId, check);
      return;
    }
    const today = await this.deps.session.run('ACTIVE', (auth) => this.deps.api.getToday(auth)).catch(() => null);
    check();
    if (today) {
      await this.deps.syncCurrentResources({ kind: 'today', today });
      check();
      const a = today.answer.state === 'ANSWERED' ? today.answer.value : null;
      if (
        p.input.mode === 'CREATE' &&
        a?.dailySemaId === p.input.dailySemaId &&
        a.semaId === p.input.semaId &&
        a.question.questionId === p.input.questionId &&
        a.content === p.content
      ) {
        await this.finishSave(target, p, { answer: a, activeAnswerCount: today.activeAnswerCount }, check);
        return;
      }
    }
    if (exists) {
      await this.deps.store.remove(target).catch(() => undefined);
      check();
      this.set(target, { kind: 'rejected', mode: p.input.mode, code: 'ANSWER_ALREADY_EXISTS' });
      return;
    }
    this.set(target, { kind: 'unconfirmed', mode: p.input.mode, trackerKept: true });
  }
  private async confirmExisting(target: string, p: PendingAnswer, answerId: string, check: () => void) {
    let current: AnswerDetail;
    try {
      current = await this.deps.session.run('ACTIVE', (auth) => this.deps.api.getAnswer(auth, answerId));
    } catch (e) {
      check();
      if (e instanceof DomainFailure && e.code === 'ANSWER_NOT_FOUND') {
        if (p.input.mode === 'DELETE') {
          await this.finishDelete(target, null, check);
          return;
        }
        await this.deps.store.remove(target).catch(() => undefined);
        check();
        this.set(target, { kind: 'rejected', mode: p.input.mode, code: e.code });
        return;
      }
      this.set(target, { kind: 'unconfirmed', mode: p.input.mode, trackerKept: true });
      return;
    }
    check();
    if (p.input.mode === 'UPDATE' && current.content === p.content) {
      const today = await this.deps.session.run('ACTIVE', (auth) => this.deps.api.getToday(auth)).catch(() => null);
      check();
      if (today) {
        await this.finishSave(target, p, { answer: current, activeAnswerCount: today.activeAnswerCount }, check);
        return;
      }
    }
    this.set(target, { kind: 'unconfirmed', mode: p.input.mode, trackerKept: true });
  }
  private async finishSave(target: string, p: PendingAnswer, result: SaveAnswerResult, check: () => void) {
    await this.deps.syncCurrentResources({ kind: 'saved', result }).catch(() => undefined);
    check();
    if (p.input.mode === 'CREATE')
      await this.deps.drafts.removeAllForDailySema(p.input.dailySemaId).catch(() => undefined);
    else if (p.input.mode === 'UPDATE')
      await this.deps.drafts.remove({ kind: 'update', answerId: p.input.answerId }).catch(() => undefined);
    check();
    await this.deps.store.remove(target).catch(() => undefined);
    check();
    this.set(target, { kind: 'succeeded', completion: { ...result, answerId: result.answer.answerId } });
  }
  private async finishDelete(target: string, count: number | null, check: () => void) {
    if (count === null) {
      const today = await this.deps.session.run('ACTIVE', (auth) => this.deps.api.getToday(auth)).catch(() => null);
      check();
      if (today) {
        await this.deps.syncCurrentResources({ kind: 'today', today });
        count = today.activeAnswerCount.count;
      }
    }
    await this.deps
      .syncCurrentResources({ kind: 'deleted', answerId: target, count: count ?? -1 })
      .catch(() => undefined);
    check();
    await this.deps.drafts.removeAllForAnswer(target).catch(() => undefined);
    check();
    await this.deps.store.remove(target).catch(() => undefined);
    check();
    this.set(target, { kind: 'deleted' });
  }
}
