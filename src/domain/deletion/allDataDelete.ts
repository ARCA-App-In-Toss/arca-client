import type { ArcaApi } from '../ports/api.ts';
import type { SessionController } from '../session/sessionController.ts';

export type AllDataDeleteView =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'deleted' }
  | { kind: 'failed' }
  | { kind: 'unconfirmed' };

export interface AllDataDeleteDeps {
  session: SessionController;
  api: ArcaApi;
}

const IDLE: AllDataDeleteView = Object.freeze({ kind: 'idle' });

export class AllDataDelete {
  private readonly deps: AllDataDeleteDeps;
  private view: AllDataDeleteView = IDLE;
  private readonly listeners = new Set<() => void>();
  private running: Promise<void> | null = null;

  constructor(deps: AllDataDeleteDeps) {
    this.deps = deps;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getView = (): AllDataDeleteView => this.view;

  start(): Promise<void> {
    return this.single(async () => {
      try {
        await this.deps.session.run('ACTIVE', (auth) => this.deps.api.deleteMember(auth));
      } catch {
        await this.confirm();
        return;
      }
      await this.finish();
    });
  }

  recheck(): Promise<void> {
    return this.single(() => this.confirm());
  }

  reset(): void {
    if (this.view.kind !== 'working') this.set(IDLE);
  }

  private single(run: () => Promise<void>): Promise<void> {
    if (this.running) return this.running;
    this.set({ kind: 'working' });
    this.running = run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async finish(): Promise<void> {
    this.set({ kind: 'deleted' });
    const summary = await this.deps.session.establish().catch(() => null);
    if (summary?.mode !== 'GUEST') this.deps.session.discard();
  }

  private async confirm(): Promise<void> {
    const current = this.deps.session.summary;
    const summary = current?.mode === 'GUEST' ? current : await this.deps.session.establish().catch(() => null);
    if (!summary) {
      this.set({ kind: 'unconfirmed' });
      return;
    }
    this.set(summary.mode === 'GUEST' ? { kind: 'deleted' } : { kind: 'failed' });
  }

  private set(view: AllDataDeleteView): void {
    this.view = view;
    for (const listener of this.listeners) listener();
  }
}
