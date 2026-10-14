import type { AnswerDetail, ConsentPolicy, MemberProfile, Question, TodaySema } from '../domain/models.ts';
export const MOCK_API_BASE = 'https://arca.mock.invalid';
export const SYNTHETIC_KEYS = {
  registered: 'synthetic-anon-key-registered',
  unregistered: 'synthetic-anon-key-unregistered',
} as const;
export const SYNTHETIC_POLICIES: readonly ConsentPolicy[] = [
  {
    policyId: 'terms-of-service',
    version: '1',
    title: '서비스 이용약관',
    url: 'https://arca.mock.invalid/policies/terms',
    required: true,
  },
  {
    policyId: 'privacy-policy',
    version: '1',
    title: '개인정보처리방침',
    url: 'https://arca.mock.invalid/policies/privacy',
    required: true,
  },
];
export type MockQuestion = Question;
export type MockSema = TodaySema;
export const SYNTHETIC_SEMA: MockSema = {
  dailySemaId: '2026-10-13',
  semaId: '10',
  semaCode: 'FAKE-13',
  dateKst: '2026-10-13',
  primaryQuestion: { questionId: '11', text: '오늘 가장 오래 머문 생각은 무엇이었나요?' },
  alternateQuestion: { questionId: '12', text: '오늘 가장 자주 떠오른 장면은 무엇이었나요?' },
};
export const SYNTHETIC_NEXT_DAY_SEMA: MockSema = {
  ...SYNTHETIC_SEMA,
  dailySemaId: '2026-10-14',
  dateKst: '2026-10-14',
};
export type MockOp =
  | 'OP-001'
  | 'OP-002'
  | 'OP-003'
  | 'OP-004'
  | 'OP-005'
  | 'OP-006'
  | 'OP-012'
  | 'UPDATE_ANSWER'
  | 'CONSENT_POLICIES';
export type MockFault =
  | { kind: 'network' }
  | { kind: 'error'; status: number; body: unknown }
  | { kind: 'malformed' }
  | { kind: 'delay'; ms: number }
  | { kind: 'hold'; release: Promise<void>; after?: MockFault }
  | { kind: 'lose-response' };
export type ServerBase = 'server.activeUnanswered' | 'server.activeAnswered' | 'server.guest';
export interface MockWorld {
  members: Map<string, MemberProfile>;
  answers: Map<string, AnswerDetail & { owner: string }>;
  sessions: Map<string, { anonymousKey: string; revoked: boolean; expiresAt: number }>;
  policies: ConsentPolicy[];
  sema: MockSema;
  requests: { op: MockOp; bearer: string | null; method: string; path: string }[];
  faults: Map<MockOp, MockFault[]>;
  advanceDayOnFirstCreate: boolean;
  issueToken(key: string): string;
  revokeSessions(key: string): void;
  answersOf(key: string): (AnswerDetail & { owner: string })[];
  seedAnswer(key: string, content: string, overrides?: Partial<AnswerDetail>): AnswerDetail & { owner: string };
  addFault(op: MockOp, fault: MockFault): void;
  replaceSema(): void;
}
export function createMockWorld(base: ServerBase = 'server.activeUnanswered'): MockWorld {
  let seq = 0;
  let tokenSeq = 0;
  const world: MockWorld = {
    members: new Map(),
    answers: new Map(),
    sessions: new Map(),
    policies: SYNTHETIC_POLICIES.map((p) => ({ ...p })),
    sema: structuredClone(SYNTHETIC_SEMA),
    requests: [],
    faults: new Map(),
    advanceDayOnFirstCreate: false,
    issueToken(key) {
      const token = `synthetic-token-${++tokenSeq}`;
      world.sessions.set(token, { anonymousKey: key, revoked: false, expiresAt: Date.now() + 86_400_000 });
      return token;
    },
    revokeSessions(key) {
      for (const session of world.sessions.values()) if (session.anonymousKey === key) session.revoked = true;
    },
    answersOf(key) {
      return [...world.answers.values()].filter((a) => a.owner === key);
    },
    seedAnswer(key, content, overrides = {}) {
      const at = new Date().toISOString();
      const answer = {
        owner: key,
        answerId: String(++seq),
        dailySemaId: world.sema.dailySemaId,
        semaId: world.sema.semaId,
        semaCode: world.sema.semaCode,
        createdAt: at,
        updatedAt: at,
        createdDateKst: world.sema.dateKst,
        isEdited: false,
        question: { ...world.sema.primaryQuestion },
        content,
        ...overrides,
      };
      world.answers.set(answer.answerId, answer);
      return answer;
    },
    addFault(op, fault) {
      const q = world.faults.get(op) ?? [];
      q.push(fault);
      world.faults.set(op, q);
    },
    replaceSema() {
      world.sema = {
        ...world.sema,
        semaId: '20',
        primaryQuestion: { questionId: '21', text: '지금 떠오르는 새로운 생각은 무엇인가요?' },
        alternateQuestion: { questionId: '22', text: '다시 돌아보고 싶은 순간은 언제인가요?' },
      };
    },
  };
  if (base !== 'server.guest')
    world.members.set(SYNTHETIC_KEYS.registered, { memberCode: 'ARCA-7K2QX', nickname: null });
  if (base === 'server.activeAnswered') world.seedAnswer(SYNTHETIC_KEYS.registered, '  오늘의 기록\n기억할 순간');
  return world;
}
