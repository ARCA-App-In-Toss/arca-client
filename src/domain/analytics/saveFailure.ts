import type { UnconfirmedCause, WriteView } from '../commands/answerWriteCoordinator.ts';
import type { SaveFailureCertainty, SaveFailureReason } from './productEvent.ts';

const REASONS: Readonly<Record<string, SaveFailureReason>> = {
  ANSWER_CONTENT_INVALID: 'VALIDATION_REJECTED',
  INVALID_REQUEST: 'VALIDATION_REJECTED',
  DATE_CHANGED: 'DATE_CHANGED',
  SEMA_REPLACED: 'CONTENT_REPLACED',
  ANSWER_ALREADY_EXISTS: 'CONFLICT',
  ANSWER_NOT_FOUND: 'CONFLICT',
  RATE_LIMITED: 'SERVER_UNAVAILABLE',
};
const UNCONFIRMED: Readonly<Record<UnconfirmedCause, SaveFailureReason>> = {
  network: 'NETWORK_UNCONFIRMED',
  server: 'SERVER_UNAVAILABLE',
  protocol: 'PROTOCOL_UNCONFIRMED',
};
export function saveFailureOf(
  view: WriteView,
): { certainty: SaveFailureCertainty; reasonCode: SaveFailureReason } | null {
  if (view.kind === 'unconfirmed') return { certainty: 'UNKNOWN', reasonCode: UNCONFIRMED[view.cause] };
  if (view.kind === 'rejected')
    return { certainty: 'REJECTED', reasonCode: REASONS[view.code] ?? 'VALIDATION_REJECTED' };
  return null;
}
