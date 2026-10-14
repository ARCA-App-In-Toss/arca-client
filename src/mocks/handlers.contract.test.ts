import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import * as wire from '../data/api/generated/zod.gen.ts';
import { createHandlers } from './handlers.ts';
import { createMockWorld, MOCK_API_BASE, SYNTHETIC_KEYS } from './world.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
async function call(
  world: ReturnType<typeof createMockWorld>,
  method: string,
  path: string,
  body?: unknown,
  guest = false,
) {
  const token = world.issueToken(guest ? SYNTHETIC_KEYS.unregistered : SYNTHETIC_KEYS.registered);
  const r = await fetch(`${MOCK_API_BASE}/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  expect(r.headers.get('Cache-Control')).toBe('no-store');
  return { status: r.status, body: await r.json() };
}
test('all nine implemented endpoints satisfy generated validators', async () => {
  const world = createMockWorld();
  server.use(...createHandlers(world));
  const s = await call(world, 'POST', '/sessions', { anonymousKey: SYNTHETIC_KEYS.registered });
  expect(s.status).toBe(201);
  wire.zSessionResponse.parse(s.body);
  wire.zConsentPoliciesResponse.parse((await call(world, 'GET', '/consent-policies')).body);
  wire.zActiveSessionResponse.parse(
    (
      await call(
        world,
        'POST',
        '/members',
        { consents: world.policies.map((p) => ({ policyId: p.policyId, version: p.version, agreed: true })) },
        true,
      )
    ).body,
  );
  wire.zMemberProfile.parse((await call(world, 'GET', '/members/me')).body);
  wire.zMemberProfile.parse((await call(world, 'PUT', '/members/me/nickname', { nickname: null })).body);
  wire.zTodaySemaResponse.parse((await call(world, 'GET', '/semas/today')).body);
  const saved = wire.zSaveAnswerResult.parse(
    (
      await call(world, 'POST', '/answers', {
        dailySemaId: world.sema.dailySemaId,
        semaId: world.sema.semaId,
        questionId: world.sema.primaryQuestion.questionId,
        content: '   ',
      })
    ).body,
  );
  wire.zSaveAnswerResult.parse(
    (await call(world, 'PUT', `/answers/${saved.answer.answerId}`, { content: '수정' })).body,
  );
  wire.zDeleteAnswerResult.parse((await call(world, 'DELETE', `/answers/${saved.answer.answerId}`)).body);
});
test.each(['/answers', '/answers/1', '/analytics/event-batches', '/commands/synthetic-ticket'])(
  'unsupported GET %s is a real endpoint error',
  async (path) => {
    const world = createMockWorld();
    server.use(...createHandlers(world));
    const r = await call(world, 'GET', path);
    expect(r.status).toBe(404);
    expect(wire.zApiErrorEnvelope.parse(r.body).error.code).toBe('ENDPOINT_NOT_FOUND');
  },
);
test('old extra fields are rejected by current request schemas', async () => {
  const world = createMockWorld();
  server.use(...createHandlers(world));
  const r = await call(world, 'PUT', '/members/me/nickname', { nickname: null, expectedRevision: 'old' });
  expect(r.status).toBe(400);
  expect(wire.zApiErrorEnvelope.parse(r.body).error.code).toBe('INVALID_REQUEST');
});
