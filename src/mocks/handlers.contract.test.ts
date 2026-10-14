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
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : undefined };
}
test('all thirteen implemented endpoints satisfy generated validators', async () => {
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
  const page = wire.zAnswerPage.parse((await call(world, 'GET', '/answers')).body);
  expect(page.items[0]).not.toHaveProperty('content');
  wire.zAnswerDetail.parse((await call(world, 'GET', `/answers/${saved.answer.answerId}`)).body);
  wire.zDeleteAnswerResult.parse((await call(world, 'DELETE', `/answers/${saved.answer.answerId}`)).body);
  const batch = await call(world, 'POST', '/analytics/event-batches', {
    events: [
      {
        eventId: '66d9e9af-2026-4000-8000-000000000001',
        schemaVersion: 1,
        name: 'onboarding_started',
        occurredAt: '2026-10-13T14:59:00Z',
        properties: {},
      },
    ],
  });
  expect(batch).toEqual({ status: 202, body: undefined });
  expect(await call(world, 'DELETE', '/members/me')).toEqual({ status: 204, body: undefined });
  const after = await call(world, 'POST', '/sessions', { anonymousKey: SYNTHETIC_KEYS.registered });
  expect(wire.zSessionResponse.parse(after.body).context.mode).toBe('GUEST');
});
test('list pages are newest first, opaque-cursored and reject malformed cursors', async () => {
  const world = createMockWorld();
  world.pageSize = 2;
  for (const content of ['a', 'b', 'c']) world.seedAnswer(SYNTHETIC_KEYS.registered, content);
  server.use(...createHandlers(world));
  const first = wire.zAnswerPage.parse((await call(world, 'GET', '/answers')).body);
  expect(first.items.map((i) => i.answerId)).toEqual(['3', '2']);
  const next = wire.zAnswerPage.parse((await call(world, 'GET', `/answers?cursor=${first.nextCursor}`)).body);
  expect(next).toMatchObject({ items: [{ answerId: '1' }], nextCursor: null });
  const bad = await call(world, 'GET', '/answers?cursor=abc');
  expect(wire.zApiErrorEnvelope.parse(bad.body).error.code).toBe('CURSOR_INVALID');
});
test.each(['/analytics/event-batches', '/commands/synthetic-ticket'])(
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
