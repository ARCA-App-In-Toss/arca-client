import type {
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
}
