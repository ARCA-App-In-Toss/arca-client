import type { ConsentReceipt, MemberProfile } from '../models.ts';
import type { SessionController } from '../session/sessionController.ts';
export class BoardingCoordinator {
  private readonly session: SessionController;
  private inFlight: Promise<MemberProfile> | null = null;
  constructor(deps: { session: SessionController }) {
    this.session = deps.session;
  }
  submit(consents: readonly ConsentReceipt[]) {
    this.inFlight ??= this.session.createMember(consents).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}
