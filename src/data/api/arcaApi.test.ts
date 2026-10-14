import { describe, expect, test, vi } from 'vitest';
import { ProtocolFailure } from '../../domain/failures.ts';
import { createArcaApi } from './arcaApi.ts';
import { createHttpTransport, type HttpRequest } from './transport.ts';

const member = { memberCode: 'ARCA-7K2QX', nickname: null };
const session = {
  accessToken: 'synthetic-token',
  expiresAt: '2026-10-14T05:00:00.123456Z',
  context: { mode: 'ACTIVE', member },
};
const answer = {
  answerId: '1',
  dailySemaId: '2026-10-13',
  semaId: '10',
  semaCode: 'FAKE-13',
  createdAt: '2026-10-13T05:00:00Z',
  updatedAt: '2026-10-13T05:00:00Z',
  createdDateKst: '2026-10-13',
  isEdited: false,
  question: { questionId: '11', text: '합성 질문' },
  content: '  합성 기록\n',
};
const auth = { bearer: 'synthetic-token' };
function setup(status: number, body: unknown) {
  const transport = vi.fn(async (_request: HttpRequest) => ({ status, body }));
  return { api: createArcaApi(transport), transport };
}
describe('backend 2.3 API boundary', () => {
  test('session accepts fractional UTC precision and GUEST has explicit null', async () => {
    const { api } = setup(201, session);
    expect(await api.establishSession('synthetic-key')).toEqual(session);
    const guest = setup(201, { ...session, context: { mode: 'GUEST', member: null } });
    expect((await guest.api.establishSession('synthetic-key')).context.mode).toBe('GUEST');
  });
  test('member create returns ACTIVE and sends only consents', async () => {
    const { api, transport } = setup(201, session);
    await api.createMember(auth, [{ policyId: 'terms', version: '1' }]);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/members',
        body: { consents: [{ policyId: 'terms', version: '1', agreed: true }] },
      }),
    );
    expect(transport.mock.calls[0]?.[0]).not.toHaveProperty('idempotencyKey');
  });
  test('policies are fetched separately', async () => {
    const { api, transport } = setup(200, { consentPolicies: [] });
    expect(await api.getConsentPolicies(auth)).toEqual([]);
    expect(transport.mock.calls[0]?.[0].path).toBe('/consent-policies');
  });
  test('nickname returns profile directly, permits null and omits revision', async () => {
    const { api, transport } = setup(200, member);
    expect(await api.setNickname(auth, null)).toEqual(member);
    expect(transport.mock.calls[0]?.[0].body).toEqual({ nickname: null });
  });
  test('create and update send strict new inputs', async () => {
    const result = { answer, activeAnswerCount: { count: 1 } };
    const { api, transport } = setup(201, result);
    expect(
      await api.createAnswer(auth, {
        dailySemaId: '2026-10-13',
        semaId: '10',
        questionId: '11',
        content: answer.content,
      }),
    ).toEqual(result);
    expect(transport.mock.calls[0]?.[0].body).toEqual({
      dailySemaId: '2026-10-13',
      semaId: '10',
      questionId: '11',
      content: answer.content,
    });
    const update = setup(200, result);
    await update.api.updateAnswer(auth, '1', 'changed');
    expect(update.transport.mock.calls[0]?.[0].body).toEqual({ content: 'changed' });
  });
  test('DELETE has no body, query or idempotency header', async () => {
    const transport = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ activeAnswerCount: { count: 0 } }), { status: 200 }),
    );
    const api = createArcaApi(createHttpTransport({ baseUrl: 'https://arca.test', fetch: transport }));
    await api.deleteAnswer(auth, '1');
    const [url, init] = transport.mock.calls[0] ?? [];
    expect(url?.toString()).toBe('https://arca.test/v1/answers/1');
    expect(init).toMatchObject({ method: 'DELETE', credentials: 'omit', cache: 'no-store' });
    expect(init?.body).toBeUndefined();
    expect(init?.headers).not.toHaveProperty('Idempotency-Key');
  });
  test.each([
    'DATABASE_ERROR',
    'SEMA_NOT_FOUND',
    'ENDPOINT_NOT_FOUND',
    'METHOD_NOT_SUPPORTED',
    'MEDIA_TYPE_NOT_ACCEPTABLE',
    'MEDIA_TYPE_NOT_SUPPORTED',
  ])('recognizes new server code %s', async (code) => {
    const category = ['DATABASE_ERROR', 'SEMA_NOT_FOUND'].includes(code) ? 'MAINTENANCE' : 'VALIDATION';
    const { api } = setup(500, { error: { code, category, requestId: 'synthetic-req' } });
    await expect(api.getMember(auth)).rejects.toMatchObject({ name: 'DomainFailure', code, category });
  });
  test('policy change preserves current policies for the consent screen', async () => {
    const policies = [
      { policyId: 'terms', version: '2', title: '약관', url: 'https://arca.invalid/terms', required: true },
    ];
    const { api } = setup(422, {
      error: {
        code: 'POLICY_VERSION_CHANGED',
        category: 'VALIDATION',
        requestId: 'synthetic-req',
        recovery: { kind: 'REFRESH_POLICIES', policies },
      },
    });
    await expect(api.createMember(auth, [])).rejects.toMatchObject({ policies });
  });
  test.each([{ ...member, nickname: undefined }, { nickname: null }, { ...member, memberCode: 5 }])(
    'rejects malformed member response',
    async (body) => {
      await expect(setup(200, body).api.getMember(auth)).rejects.toBeInstanceOf(ProtocolFailure);
    },
  );
  test('unknown errors and invalid recovery combinations are protocol failures', async () => {
    for (const body of [
      { error: { code: 'UNKNOWN', category: 'AUTH', requestId: 'r' } },
      { error: { code: 'SESSION_INVALID', category: 'AUTH', requestId: 'r', recovery: { kind: 'REFRESH_TODAY' } } },
    ])
      await expect(setup(401, body).api.getMember(auth)).rejects.toBeInstanceOf(ProtocolFailure);
  });
  test('mutation network errors are never retried by transport', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('network'));
    await expect(createArcaApi(transport).createMember(auth, [])).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
