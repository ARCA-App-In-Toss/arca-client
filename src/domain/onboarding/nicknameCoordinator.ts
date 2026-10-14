import { DomainFailure } from '../failures.ts';
import type { MemberProfile } from '../models.ts';
import type { ArcaApi } from '../ports/api.ts';
import type { NetworkPort } from '../ports/platform.ts';
import type { SessionController } from '../session/sessionController.ts';
export type NicknameSaveResult = 'saved' | 'rejected' | 'unsent' | 'unknown';
export class NicknameCoordinator {
  private inFlight: Promise<NicknameSaveResult> | null = null;
  constructor(privateDeps: {
    session: SessionController;
    api: ArcaApi;
    network: NetworkPort;
    syncProfile: (profile: MemberProfile) => void;
  }) {
    this.deps = privateDeps;
  }
  private readonly deps: {
    session: SessionController;
    api: ArcaApi;
    network: NetworkPort;
    syncProfile: (profile: MemberProfile) => void;
  };
  save(nickname: string | null) {
    this.inFlight ??= this.run(nickname).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  private async run(nickname: string | null): Promise<NicknameSaveResult> {
    if (await this.deps.network.isOffline()) return 'unsent';
    try {
      const profile = await this.deps.session.run('ACTIVE', (auth) => this.deps.api.setNickname(auth, nickname));
      this.deps.syncProfile(profile);
      return 'saved';
    } catch (e) {
      return e instanceof DomainFailure && ['VALIDATION', 'CONFLICT', 'RATE_LIMIT'].includes(e.category)
        ? 'rejected'
        : 'unknown';
    }
  }
}
