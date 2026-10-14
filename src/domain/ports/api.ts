import type { ProductEventBatch } from '../analytics/productEvent.ts';
import type {
  AnswerDetail,
  AnswerPage,
  ConsentPolicy,
  ConsentReceipt,
  DeleteAnswerResult,
  EstablishedSession,
  MemberProfile,
  SaveAnswerResult,
  Today,
} from '../models.ts';
export interface Bearer {
  readonly bearer: string;
}
export interface ArcaApi {
  establishSession(anonymousKey: string): Promise<EstablishedSession>;
  getConsentPolicies(auth: Bearer, signal?: AbortSignal): Promise<readonly ConsentPolicy[]>;
  createMember(auth: Bearer, consents: readonly ConsentReceipt[]): Promise<EstablishedSession>;
  getMember(auth: Bearer, signal?: AbortSignal): Promise<MemberProfile>;
  setNickname(auth: Bearer, nickname: string | null): Promise<MemberProfile>;
  getToday(auth: Bearer, signal?: AbortSignal): Promise<Today>;
  createAnswer(
    auth: Bearer,
    input: { dailySemaId: string; semaId: string; questionId: string; content: string },
  ): Promise<SaveAnswerResult>;
  updateAnswer(auth: Bearer, answerId: string, content: string): Promise<SaveAnswerResult>;
  deleteAnswer(auth: Bearer, answerId: string): Promise<DeleteAnswerResult>;
  listAnswers(auth: Bearer, cursor: string | null, signal?: AbortSignal): Promise<AnswerPage>;
  getAnswer(auth: Bearer, answerId: string, signal?: AbortSignal): Promise<AnswerDetail>;
  deleteMember(auth: Bearer): Promise<void>;
  sendEventBatch(auth: Bearer, batch: ProductEventBatch): Promise<void>;
}
