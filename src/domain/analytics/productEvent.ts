export type AnswerMode = 'CREATE' | 'UPDATE';
export type QuestionSlot = 'PRIMARY' | 'ALTERNATE';
export type SaveFailureCertainty = 'REJECTED' | 'UNKNOWN';
export type SaveFailureReason =
  | 'VALIDATION_REJECTED'
  | 'DATE_CHANGED'
  | 'CONTENT_REPLACED'
  | 'CONFLICT'
  | 'NETWORK_UNCONFIRMED'
  | 'SERVER_UNAVAILABLE'
  | 'PROTOCOL_UNCONFIRMED';

type NoProperties = Record<string, never>;

export type ProductEvent =
  | { name: 'onboarding_started'; properties: NoProperties }
  | { name: 'onboarding_skipped'; properties: NoProperties }
  | { name: 'today_sema_viewed'; properties: { answerState: 'UNANSWERED' | 'ANSWERED' } }
  | { name: 'alternate_question_viewed'; properties: NoProperties }
  | { name: 'sema_question_changed'; properties: { from: QuestionSlot; to: QuestionSlot } }
  | { name: 'answer_started'; properties: { mode: AnswerMode } }
  | {
      name: 'answer_save_failed';
      properties: { mode: AnswerMode; certainty: SaveFailureCertainty; reasonCode: SaveFailureReason };
    }
  | { name: 'archive_viewed'; properties: { state: 'EMPTY' | 'NON_EMPTY' } };

export type RecordedProductEvent = ProductEvent & { readonly eventId: string; readonly occurredAt: string };

export type EventPlatform = 'IOS' | 'ANDROID';

export interface ProductEventBatch {
  events: readonly RecordedProductEvent[];
  appVersion?: string;
  platform?: EventPlatform;
}
