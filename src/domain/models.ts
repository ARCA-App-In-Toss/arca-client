export type SessionMode = 'GUEST' | 'ACTIVE';
export interface MemberProfile {
  memberCode: string;
  nickname: string | null;
}
export type SessionContext = { mode: 'GUEST'; member: null } | { mode: 'ACTIVE'; member: MemberProfile };
export interface EstablishedSession {
  accessToken: string;
  expiresAt: string;
  context: SessionContext;
}
export interface ConsentPolicy {
  policyId: string;
  version: string;
  title: string;
  url: string;
  required: boolean;
}
export interface ConsentReceipt {
  policyId: string;
  version: string;
}
export interface Question {
  questionId: string;
  text: string;
}
export interface TodaySema {
  dailySemaId: string;
  semaId: string;
  semaCode: string;
  dateKst: string;
  primaryQuestion: Question;
  alternateQuestion: Question;
}
export interface AnswerCount {
  count: number;
}
export interface AnswerDetail {
  answerId: string;
  dailySemaId: string;
  semaId: string;
  semaCode: string;
  createdAt: string;
  updatedAt: string;
  createdDateKst: string;
  isEdited: boolean;
  question: Question;
  content: string;
}
export interface Today {
  dateKst: string;
  sema: TodaySema;
  answer: { state: 'UNANSWERED' } | { state: 'ANSWERED'; value: AnswerDetail };
  activeAnswerCount: AnswerCount;
}
export interface AnswerCreate {
  mode: 'CREATE';
  dailySemaId: string;
  semaId: string;
  questionId: string;
}
export interface AnswerUpdate {
  mode: 'UPDATE';
  answerId: string;
}
export type AnswerWriteInput = AnswerCreate | AnswerUpdate;
export interface SaveAnswerResult {
  answer: AnswerDetail;
  activeAnswerCount: AnswerCount;
}
export interface DeleteAnswerResult {
  activeAnswerCount: AnswerCount;
}
