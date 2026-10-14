import { DomainFailure, ProtocolFailure, TransportFailure } from '../failures.ts';
import type { ConsentReceipt, EstablishedSession, MemberProfile, SessionMode } from '../models.ts';
import type { ArcaApi, Bearer } from '../ports/api.ts';
import type { ClockPort, IdentityPort } from '../ports/platform.ts';
import { digestOwner, type LocalOwnerVerifier, newSalt } from './ownerVerifier.ts';

export class IdentityUnavailableFailure extends Error {
  override readonly name = 'IdentityUnavailableFailure';
  readonly reason: string;
  constructor(reason: string) {
    super(`identity:${reason}`);
    this.reason = reason;
  }
}
export class SessionChangedFailure extends Error {
  constructor() {
    super('session:changed');
  }
}
export class SessionModeMismatchFailure extends Error {
  constructor() {
    super('session:mode');
  }
}
export class StaleResultFailure extends Error {
  declare readonly outcome: { kind: 'result'; value: unknown } | { kind: 'error'; error: unknown };
  constructor(outcome: StaleResultFailure['outcome']) {
    super('session:stale');
    Object.defineProperty(this, 'outcome', { value: outcome, enumerable: false });
  }
}
export interface RequestSnapshot {
  readonly ownerScope: string;
  readonly sessionEpoch: number;
  readonly accountScope: string | null;
  readonly mode: SessionMode;
}
export interface SessionSummary {
  readonly ownerScope: string;
  readonly mode: SessionMode;
  readonly epoch: number;
  readonly accountScope: string | null;
}
export type SessionEvent =
  | { kind: 'established'; summary: SessionSummary; ownerChanged: boolean; boarded?: MemberProfile }
  | { kind: 'discarded' };
interface Current {
  summary: SessionSummary;
  session: EstablishedSession;
  key: string;
  receivedAtMs: number;
}
export interface SessionControllerDeps {
  api: ArcaApi;
  identity: IdentityPort;
  clock: ClockPort;
}

export class SessionController {
  private readonly deps: SessionControllerDeps;
  private current: Current | null = null;
  private inFlight: Promise<SessionSummary> | null = null;
  private epoch = 0;
  private readonly listeners = new Set<(event: SessionEvent) => void>();
  constructor(deps: SessionControllerDeps) {
    this.deps = deps;
  }
  get summary() {
    return this.current?.summary ?? null;
  }
  subscribe(listener: (event: SessionEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  establish(): Promise<SessionSummary> {
    this.inFlight ??= this.runEstablish().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  snapshot(): RequestSnapshot | null {
    const s = this.summary;
    return s ? { ownerScope: s.ownerScope, sessionEpoch: s.epoch, accountScope: s.accountScope, mode: s.mode } : null;
  }
  isCurrent(s: RequestSnapshot): boolean {
    const n = this.snapshot();
    return (
      n !== null &&
      n.ownerScope === s.ownerScope &&
      n.sessionEpoch === s.sessionEpoch &&
      n.accountScope === s.accountScope &&
      n.mode === s.mode
    );
  }
  async localOwnerVerifier(): Promise<LocalOwnerVerifier | null> {
    const salt = newSalt();
    if (!salt) return null;
    const value = await digestOwner(salt, await this.requireKey());
    return value ? { salt, value } : null;
  }
  async matchesLocalOwner(v: LocalOwnerVerifier) {
    return (await digestOwner(v.salt, await this.requireKey())) === v.value;
  }
  async createMember(consents: readonly ConsentReceipt[]): Promise<MemberProfile> {
    const current = this.current;
    if (current?.summary.mode !== 'GUEST') throw new SessionModeMismatchFailure();
    try {
      const session = await this.deps.api.createMember({ bearer: current.session.accessToken }, consents);
      if (this.current !== current) throw new SessionChangedFailure();
      if (session.context.mode !== 'ACTIVE') throw new ProtocolFailure('schema');
      this.apply(session, current.key, session.context.member);
      return session.context.member;
    } catch (error) {
      const unknown =
        error instanceof TransportFailure ||
        error instanceof ProtocolFailure ||
        (error instanceof DomainFailure &&
          (error.category === 'AUTH' || error.category === 'MAINTENANCE' || error.code === 'MEMBER_ALREADY_EXISTS'));
      if (!unknown || this.current !== current) throw error;
      const key = await this.requireKey();
      if (key !== current.key) {
        await this.establish();
        throw new SessionChangedFailure();
      }
      const fresh = await this.deps.api.establishSession(key);
      if (this.current !== current) throw new SessionChangedFailure();
      if (fresh.context.mode === 'ACTIVE') {
        this.apply(fresh, key, fresh.context.member);
        return fresh.context.member;
      }
      this.apply(fresh, key);
      throw error;
    }
  }
  discard() {
    if (!this.current) return;
    this.current = null;
    this.emit({ kind: 'discarded' });
  }
  async run<T>(mode: SessionMode, call: (auth: Bearer, snapshot: RequestSnapshot) => Promise<T>): Promise<T> {
    const origin = this.requireSnapshot(mode);
    await this.refreshOnForeground();
    let snapshot = this.requireSameOwner(origin, mode);
    try {
      return this.fenced(snapshot, await call({ bearer: this.requireToken() }, snapshot));
    } catch (error) {
      if (error instanceof StaleResultFailure) throw error;
      if (!(error instanceof DomainFailure && error.code === 'SESSION_RECOVERY_REQUIRED' && error.recoveryAllowed))
        this.fenceError(snapshot, error);
      try {
        await this.establish();
      } catch (e) {
        this.discard();
        throw e;
      }
      snapshot = this.requireSameOwner(origin, mode);
      try {
        return this.fenced(snapshot, await call({ bearer: this.requireToken() }, snapshot));
      } catch (e) {
        this.fenceError(snapshot, e);
      }
    }
  }
  async refreshOnForeground(): Promise<void> {
    const c = this.current;
    if (!c) return;
    const expires = Date.parse(c.session.expiresAt);
    const ttl = expires - c.receivedAtMs;
    if (this.deps.clock.now() >= expires - Math.min(60_000, Math.max(0, ttl) * 0.1)) await this.establish();
  }
  private async runEstablish() {
    const key = await this.requireKey();
    return this.apply(await this.deps.api.establishSession(key), key);
  }
  private async requireKey() {
    const key = await this.deps.identity.getAnonymousKey();
    if (key.kind !== 'ok') throw new IdentityUnavailableFailure(key.reason);
    return key.key;
  }
  private apply(session: EstablishedSession, key: string, boarded?: MemberProfile): SessionSummary {
    const previous = this.current;
    const accountScope = session.context.mode === 'ACTIVE' ? session.context.member.memberCode : null;
    const ownerChanged = !previous || previous.key !== key || previous.summary.accountScope !== accountScope;
    const summary = {
      ownerScope: ownerChanged ? crypto.randomUUID() : previous.summary.ownerScope,
      mode: session.context.mode,
      epoch: ++this.epoch,
      accountScope,
    };
    this.current = { summary, session, key, receivedAtMs: this.deps.clock.now() };
    this.emit({ kind: 'established', summary, ownerChanged, ...(boarded ? { boarded } : {}) });
    return summary;
  }
  private emit(event: SessionEvent) {
    for (const listener of this.listeners) listener(event);
  }
  private requireToken() {
    if (!this.current) throw new SessionModeMismatchFailure();
    return this.current.session.accessToken;
  }
  private requireSnapshot(mode: SessionMode) {
    const s = this.snapshot();
    if (!s || s.mode !== mode) throw new SessionModeMismatchFailure();
    return s;
  }
  private requireSameOwner(origin: RequestSnapshot, mode: SessionMode) {
    const s = this.snapshot();
    if (!s || s.ownerScope !== origin.ownerScope || s.accountScope !== origin.accountScope)
      throw new SessionChangedFailure();
    return this.requireSnapshot(mode);
  }
  private fenced<T>(s: RequestSnapshot, value: T): T {
    if (!this.isCurrent(s)) throw new StaleResultFailure({ kind: 'result', value });
    return value;
  }
  private fenceError(s: RequestSnapshot, error: unknown): never {
    if (!this.isCurrent(s)) throw new StaleResultFailure({ kind: 'error', error });
    throw error;
  }
}
