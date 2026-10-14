import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createAppServices } from '../../app/composition.ts';
import { queryKeys } from '../../data/query/keys.ts';
import { createHandlers } from '../../mocks/handlers.ts';
import { createFakePlatform } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, SYNTHETIC_KEYS } from '../../mocks/world.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
async function setup() {
  const world = createMockWorld();
  server.use(...createHandlers(world));
  const services = createAppServices({ platform: createFakePlatform(), apiBase: MOCK_API_BASE });
  await services.start();
  const input = {
    mode: 'CREATE' as const,
    dailySemaId: world.sema.dailySemaId,
    semaId: world.sema.semaId,
    questionId: world.sema.primaryQuestion.questionId,
  };
  const identity = {
    kind: 'create' as const,
    dailySemaId: input.dailySemaId,
    semaId: input.semaId,
    questionId: input.questionId,
  };
  await services.drafts.save(identity, '  draft\n', Date.now());
  const save = () =>
    services.writes.save({ input, flushDraft: async () => ({ text: '  draft\n', lastModifiedAt: Date.now() }) });
  return { world, services, input, identity, save };
}
describe('direct answer mutations and uncertain responses', () => {
  test('double save makes one POST and synchronizes count/detail', async () => {
    const { world, services, input, save } = await setup();
    await Promise.all([save(), save()]);
    expect(world.requests.filter((r) => r.op === 'OP-006')).toHaveLength(1);
    expect(world.answersOf(SYNTHETIC_KEYS.registered)).toHaveLength(1);
    expect(services.writes.getView(input.dailySemaId)).toMatchObject({
      kind: 'succeeded',
      completion: { answer: { content: '  draft\n' }, activeAnswerCount: { count: 1 } },
    });
    expect(world.requests.some((r) => r.path.includes('commands'))).toBe(false);
  });
  test('lost POST response confirms matching content via today without replaying POST', async () => {
    const { world, services, input, save, identity } = await setup();
    world.addFault('OP-006', { kind: 'lose-response' });
    await save();
    expect(services.writes.getView(input.dailySemaId).kind).toBe('succeeded');
    expect(world.requests.filter((r) => r.op === 'OP-006')).toHaveLength(1);
    expect(await services.drafts.load(identity)).toBeNull();
  });
  test('unreceived POST remains uncertain and preserves draft; explicit retry may save', async () => {
    const { world, services, input, save, identity } = await setup();
    world.addFault('OP-006', { kind: 'network' });
    await save();
    expect(services.writes.getView(input.dailySemaId).kind).toBe('unconfirmed');
    expect((await services.drafts.load(identity))?.text).toBe('  draft\n');
    await services.writes.retry(input.dailySemaId);
    expect(services.writes.getView(input.dailySemaId).kind).toBe('succeeded');
  });
  test('500 DATABASE_ERROR with an unrelated existing answer keeps the typed draft', async () => {
    const { world, services, input, save, identity } = await setup();
    world.seedAnswer(SYNTHETIC_KEYS.registered, 'another device');
    world.addFault('OP-006', {
      kind: 'error',
      status: 500,
      body: { error: { code: 'DATABASE_ERROR', category: 'MAINTENANCE', requestId: 'synthetic-r' } },
    });
    await save();
    expect(services.writes.getView(input.dailySemaId).kind).toBe('unconfirmed');
    expect(await services.drafts.load(identity)).not.toBeNull();
  });
  test('duplicate conflict does not replace an existing answer or erase different draft', async () => {
    const { world, services, input, save, identity } = await setup();
    world.seedAnswer(SYNTHETIC_KEYS.registered, 'other text');
    await save();
    expect(services.writes.getView(input.dailySemaId)).toMatchObject({
      kind: 'rejected',
      code: 'ANSWER_ALREADY_EXISTS',
    });
    expect(await services.drafts.load(identity)).not.toBeNull();
  });
  test('date change is an HTTP rejection with draft retained', async () => {
    const { world, services, input, save, identity } = await setup();
    world.advanceDayOnFirstCreate = true;
    await save();
    expect(services.writes.getView(input.dailySemaId)).toMatchObject({ kind: 'rejected', code: 'DATE_CHANGED' });
    expect(await services.drafts.load(identity)).not.toBeNull();
  });
  test('confirmed success remains success when cleanup of local draft fails', async () => {
    const { services, input, save } = await setup();
    services.drafts.removeAllForDailySema = async () => {
      throw new Error('local');
    };
    await save();
    expect(services.writes.getView(input.dailySemaId).kind).toBe('succeeded');
  });
  test('update is one PUT and returns current answer/count without revisions', async () => {
    const { world, services, save } = await setup();
    await save();
    const a = world.answersOf(SYNTHETIC_KEYS.registered)[0];
    if (!a) throw new Error('missing fixture');
    await services.answers.save({
      input: { mode: 'UPDATE', answerId: a.answerId },
      flushDraft: async () => ({ text: 'changed', lastModifiedAt: Date.now() }),
    });
    expect(world.answers.get(a.answerId)?.content).toBe('changed');
    expect(world.requests.filter((r) => r.op === 'UPDATE_ANSWER')).toHaveLength(1);
    const s = services.session.summary;
    if (!s?.accountScope) throw new Error('scope');
    expect(services.queryClient.getQueryData(queryKeys.answer(s.ownerScope, s.accountScope, a.answerId))).toMatchObject(
      { content: 'changed', isEdited: true },
    );
  });
  test('lost DELETE response is confirmed by detail 404 without resending', async () => {
    const { world, services, save } = await setup();
    await save();
    const a = world.answersOf(SYNTHETIC_KEYS.registered)[0];
    if (!a) throw new Error('fixture');
    world.addFault('OP-012', { kind: 'lose-response' });
    await services.answers.delete({ input: { answerId: a.answerId } });
    expect(services.answers.getView(a.answerId).kind).toBe('deleted');
    expect(world.requests.filter((r) => r.op === 'OP-012')).toHaveLength(1);
    expect(world.requests.some((r) => r.op === 'OP-011')).toBe(true);
  });
  test('unsent DELETE stays uncertain while the answer is present; explicit retry deletes', async () => {
    const { world, services, save } = await setup();
    await save();
    const a = world.answersOf(SYNTHETIC_KEYS.registered)[0];
    if (!a) throw new Error('fixture');
    world.addFault('OP-012', { kind: 'network' });
    await services.answers.delete({ input: { answerId: a.answerId } });
    expect(services.answers.getView(a.answerId).kind).toBe('unconfirmed');
    await services.answers.retry(a.answerId);
    expect(services.answers.getView(a.answerId).kind).toBe('deleted');
    expect(world.answers.size).toBe(0);
  });
  test('lost UPDATE response of a past answer is confirmed through detail content', async () => {
    const { world, services } = await setup();
    const past = world.seedAnswer(SYNTHETIC_KEYS.registered, '지난 기록', {
      dailySemaId: '2026-10-01',
      createdDateKst: '2026-10-01',
    });
    world.addFault('UPDATE_ANSWER', { kind: 'lose-response' });
    await services.answers.save({
      input: { mode: 'UPDATE', answerId: past.answerId },
      flushDraft: async () => ({ text: '고친 지난 기록', lastModifiedAt: Date.now() }),
    });
    expect(services.answers.getView(past.answerId)).toMatchObject({
      kind: 'succeeded',
      completion: { answer: { content: '고친 지난 기록', isEdited: true } },
    });
    expect(world.requests.filter((r) => r.op === 'UPDATE_ANSWER')).toHaveLength(1);
  });
});
