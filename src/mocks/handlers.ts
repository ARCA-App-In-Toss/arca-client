import { delay, HttpResponse, http } from 'msw';
import {
  zCreateAnswerInput,
  zCreateMemberInput,
  zEstablishSessionInput,
  zUpdateAnswerInput,
  zUpdateNicknameInput,
} from '../data/api/generated/zod.gen.ts';
import { measureAnswer } from '../domain/text/graphemes.ts';
import { checkNickname } from '../domain/text/nickname.ts';
import { MOCK_API_BASE, type MockFault, type MockOp, type MockWorld } from './world.ts';

const noStore = { 'Cache-Control': 'no-store' };
function errorBody(code: string, category: string, extra: Record<string, unknown> = {}) {
  return { error: { code, category, requestId: 'synthetic-request-1', ...extra } };
}
const error = (status: number, code: string, category = 'VALIDATION', extra: Record<string, unknown> = {}) =>
  HttpResponse.json(errorBody(code, category, extra), { status, headers: noStore });
const json = (body: unknown, status = 200) =>
  new HttpResponse(JSON.stringify(body), { status, headers: { ...noStore, 'Content-Type': 'application/json' } });
async function faultResponse(fault: MockFault | undefined): Promise<Response | null> {
  if (!fault || fault.kind === 'lose-response') return null;
  if (fault.kind === 'network') return HttpResponse.error();
  if (fault.kind === 'malformed') return new HttpResponse('{bad', { status: 200, headers: noStore });
  if (fault.kind === 'error') return json(fault.body, fault.status);
  if (fault.kind === 'delay') {
    await delay(fault.ms);
    return null;
  }
  await fault.release;
  return faultResponse(fault.after);
}
export function createHandlers(world: MockWorld, baseUrl = MOCK_API_BASE) {
  const bearer = (request: Request) => request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  const begin = async (request: Request, op: MockOp) => {
    world.requests.push({ op, bearer: bearer(request), method: request.method, path: new URL(request.url).pathname });
    const f = world.faults.get(op)?.shift();
    return { fault: f, response: await faultResponse(f) };
  };
  const auth = (request: Request, active = true): string | Response => {
    const token = bearer(request);
    const s = token ? world.sessions.get(token) : null;
    if (!s) return error(401, 'SESSION_INVALID', 'AUTH');
    if (s.revoked || s.expiresAt <= Date.now())
      return error(401, 'SESSION_RECOVERY_REQUIRED', 'AUTH', {
        recovery: { kind: 'REESTABLISH_SESSION', recoveryAllowed: true },
      });
    if (active && !world.members.has(s.anonymousKey)) return error(403, 'SESSION_SCOPE_INSUFFICIENT', 'AUTH');
    return s.anonymousKey;
  };
  const session = (key: string) => {
    const member = world.members.get(key);
    return {
      accessToken: world.issueToken(key),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      context: member ? { mode: 'ACTIVE', member: { ...member } } : { mode: 'GUEST', member: null },
    };
  };
  const answer = (a: ReturnType<MockWorld['seedAnswer']>) => {
    const { owner: _owner, ...value } = a;
    return value;
  };
  const count = (owner: string) => ({ count: world.answersOf(owner).length });
  const finish = (fault: MockFault | undefined, body: unknown, status = 200) =>
    fault?.kind === 'lose-response' ? HttpResponse.error() : json(body, status);
  return [
    http.post(`${baseUrl}/v1/sessions`, async ({ request }) => {
      const b = await begin(request, 'OP-001');
      if (b.response) return b.response;
      const p = zEstablishSessionInput.safeParse(await request.json().catch(() => null));
      if (!p.success) return error(400, 'INVALID_REQUEST');
      return finish(b.fault, session(p.data.anonymousKey), 201);
    }),
    http.get(`${baseUrl}/v1/consent-policies`, async ({ request }) => {
      const b = await begin(request, 'CONSENT_POLICIES');
      if (b.response) return b.response;
      const owner = auth(request, false);
      if (owner instanceof Response) return owner;
      return json({ consentPolicies: world.policies });
    }),
    http.post(`${baseUrl}/v1/members`, async ({ request }) => {
      const b = await begin(request, 'OP-003');
      if (b.response) return b.response;
      const owner = auth(request, false);
      if (owner instanceof Response) return owner;
      const p = zCreateMemberInput.safeParse(await request.json().catch(() => null));
      if (!p.success) return error(400, 'INVALID_REQUEST');
      if (world.members.has(owner)) return error(409, 'MEMBER_ALREADY_EXISTS', 'CONFLICT');
      if (
        p.data.consents.some(
          (c) => !world.policies.some((policy) => policy.policyId === c.policyId && policy.version === c.version),
        )
      )
        return error(422, 'POLICY_VERSION_CHANGED', 'VALIDATION', {
          recovery: { kind: 'REFRESH_POLICIES', policies: world.policies },
        });
      if (
        world.policies.some(
          (policy) =>
            policy.required &&
            !p.data.consents.some((c) => c.policyId === policy.policyId && c.version === policy.version),
        )
      )
        return error(422, 'CONSENT_REQUIRED');
      world.members.set(owner, { memberCode: 'ARCA-NEW01', nickname: null });
      world.revokeSessions(owner);
      return finish(b.fault, session(owner), 201);
    }),
    http.get(`${baseUrl}/v1/members/me`, async ({ request }) => {
      const b = await begin(request, 'OP-002');
      if (b.response) return b.response;
      const owner = auth(request, false);
      if (owner instanceof Response) return owner;
      const member = world.members.get(owner);
      return member ? json(member) : error(404, 'MEMBER_NOT_FOUND');
    }),
    http.put(`${baseUrl}/v1/members/me/nickname`, async ({ request }) => {
      const b = await begin(request, 'OP-004');
      if (b.response) return b.response;
      const owner = auth(request);
      if (owner instanceof Response) return owner;
      const p = zUpdateNicknameInput.safeParse(await request.json().catch(() => null));
      if (!p.success) return error(400, 'INVALID_REQUEST');
      const checked = p.data.nickname === null ? null : checkNickname(p.data.nickname);
      if (checked && (checked.error || checked.empty)) return error(422, 'NICKNAME_INVALID');
      const profile = { memberCode: world.members.get(owner)?.memberCode ?? '', nickname: checked?.normalized ?? null };
      world.members.set(owner, profile);
      return finish(b.fault, profile);
    }),
    http.get(`${baseUrl}/v1/semas/today`, async ({ request }) => {
      const b = await begin(request, 'OP-005');
      if (b.response) return b.response;
      const owner = auth(request);
      if (owner instanceof Response) return owner;
      const a = world.answersOf(owner).find((a) => a.dailySemaId === world.sema.dailySemaId);
      return json({
        dateKst: world.sema.dateKst,
        sema: world.sema,
        answer: a ? { state: 'ANSWERED', value: answer(a) } : { state: 'UNANSWERED' },
        activeAnswerCount: count(owner),
      });
    }),
    http.post(`${baseUrl}/v1/answers`, async ({ request }) => {
      const b = await begin(request, 'OP-006');
      if (b.response) return b.response;
      const owner = auth(request);
      if (owner instanceof Response) return owner;
      const p = zCreateAnswerInput.safeParse(await request.json().catch(() => null));
      if (!p.success) return error(400, 'INVALID_REQUEST');
      if (world.advanceDayOnFirstCreate) {
        world.advanceDayOnFirstCreate = false;
        world.sema = { ...world.sema, dailySemaId: '2026-10-14', dateKst: '2026-10-14' };
      }
      if (p.data.dailySemaId !== world.sema.dailySemaId)
        return error(422, 'DATE_CHANGED', 'VALIDATION', { recovery: { kind: 'REFRESH_TODAY' } });
      const q = [world.sema.primaryQuestion, world.sema.alternateQuestion].find(
        (q) => q.questionId === p.data.questionId,
      );
      if (p.data.semaId !== world.sema.semaId || !q)
        return error(422, 'SEMA_REPLACED', 'VALIDATION', { recovery: { kind: 'REFRESH_TODAY' } });
      if (world.answersOf(owner).some((a) => a.dailySemaId === p.data.dailySemaId))
        return error(409, 'ANSWER_ALREADY_EXISTS', 'CONFLICT');
      if (!measureAnswer(p.data.content).savable) return error(422, 'ANSWER_CONTENT_INVALID');
      const a = world.seedAnswer(owner, p.data.content, { question: { ...q } });
      return finish(b.fault, { answer: answer(a), activeAnswerCount: count(owner) }, 201);
    }),
    http.put(`${baseUrl}/v1/answers/:answerId`, async ({ request, params }) => {
      const b = await begin(request, 'UPDATE_ANSWER');
      if (b.response) return b.response;
      const owner = auth(request);
      if (owner instanceof Response) return owner;
      const p = zUpdateAnswerInput.safeParse(await request.json().catch(() => null));
      if (!p.success || !/^\d+$/.test(String(params.answerId))) return error(400, 'INVALID_REQUEST');
      const a = world.answers.get(String(params.answerId));
      if (!a || a.owner !== owner) return error(404, 'ANSWER_NOT_FOUND');
      if (!measureAnswer(p.data.content).savable) return error(422, 'ANSWER_CONTENT_INVALID');
      const updated = { ...a, content: p.data.content, isEdited: true, updatedAt: new Date().toISOString() };
      world.answers.set(a.answerId, updated);
      return finish(b.fault, { answer: answer(updated), activeAnswerCount: count(owner) });
    }),
    http.delete(`${baseUrl}/v1/answers/:answerId`, async ({ request, params }) => {
      const b = await begin(request, 'OP-012');
      if (b.response) return b.response;
      const owner = auth(request);
      if (owner instanceof Response) return owner;
      if (!/^\d+$/.test(String(params.answerId))) return error(400, 'INVALID_REQUEST');
      const a = world.answers.get(String(params.answerId));
      if (!a || a.owner !== owner) return error(404, 'ANSWER_NOT_FOUND');
      world.answers.delete(a.answerId);
      return finish(b.fault, { activeAnswerCount: count(owner) });
    }),
    http.all(`${baseUrl}/v1/*`, () => error(404, 'ENDPOINT_NOT_FOUND')),
  ];
}
export const mockErrors = {
  maintenance: { kind: 'error', status: 503, body: errorBody('MAINTENANCE', 'MAINTENANCE') },
  anonymousKeyInvalid: { kind: 'error', status: 401, body: errorBody('ANONYMOUS_KEY_INVALID', 'AUTH') },
  sessionRecoveryRequired: {
    kind: 'error',
    status: 401,
    body: errorBody('SESSION_RECOVERY_REQUIRED', 'AUTH', {
      recovery: { kind: 'REESTABLISH_SESSION', recoveryAllowed: true },
    }),
  },
  internalWithExtra: {
    kind: 'error',
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', category: 'MAINTENANCE', requestId: 'synthetic-request', stack: 'leak' } },
  },
} as const;
