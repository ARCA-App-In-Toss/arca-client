import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createAppServices } from '../../app/composition.ts';
import { createHandlers } from '../../mocks/handlers.ts';
import { createFakePlatform } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, SYNTHETIC_KEYS } from '../../mocks/world.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function setup(guest = false) {
  const world = createMockWorld(guest ? 'server.guest' : 'server.activeUnanswered');
  server.use(...createHandlers(world));
  const platform = createFakePlatform({
    anonymousKey: { kind: 'ok', key: guest ? SYNTHETIC_KEYS.unregistered : SYNTHETIC_KEYS.registered },
  });
  const services = createAppServices({ platform, apiBase: MOCK_API_BASE });
  return { world, services, platform };
}
describe('backend 2.3 sessions', () => {
  test('lost registration response exchanges session once and never replays POST', async () => {
    const { world, services } = setup(true);
    await services.start();
    world.addFault('OP-003', { kind: 'lose-response' });
    const member = await services.boarding.submit(world.policies);
    expect(member.memberCode).toBeTruthy();
    expect(services.session.summary?.mode).toBe('ACTIVE');
    expect(world.requests.filter((r) => r.op === 'OP-003')).toHaveLength(1);
    expect(world.requests.filter((r) => r.op === 'OP-001')).toHaveLength(2);
  });
  test('duplicate registration shares one in-flight request', async () => {
    const { world, services } = setup(true);
    await services.start();
    const a = services.boarding.submit(world.policies);
    const b = services.boarding.submit(world.policies);
    expect(a).toBe(b);
    await a;
    expect(world.requests.filter((r) => r.op === 'OP-003')).toHaveLength(1);
  });
  test('expired/revoked token recovers exactly once for normal reads', async () => {
    const { world, services } = setup();
    await services.start();
    world.revokeSessions(SYNTHETIC_KEYS.registered);
    expect(await services.session.run('ACTIVE', (auth) => services.api.getMember(auth))).toMatchObject({
      memberCode: 'ARCA-7K2QX',
    });
    expect(world.requests.filter((r) => r.op === 'OP-002')).toHaveLength(2);
  });
  test('SESSION_INVALID does not exchange a new session', async () => {
    const { world, services } = setup();
    await services.start();
    world.sessions.clear();
    await expect(services.session.run('ACTIVE', (auth) => services.api.getMember(auth))).rejects.toMatchObject({
      code: 'SESSION_INVALID',
    });
    expect(world.requests.filter((r) => r.op === 'OP-001')).toHaveLength(1);
  });
  test('fresh tokens preserve owner/cache scope for same member', async () => {
    const { services } = setup();
    await services.start();
    const before = services.session.summary;
    const next = await services.session.establish();
    expect(next.ownerScope).toBe(before?.ownerScope);
    expect(next.accountScope).toBe(before?.accountScope);
    expect(next.epoch).toBeGreaterThan(before?.epoch ?? 0);
  });
  test('identity change during registration recovery cannot apply another member', async () => {
    const { world, services, platform } = setup(true);
    await services.start();
    world.addFault('OP-003', { kind: 'network' });
    platform.setAnonymousKey({ kind: 'ok', key: SYNTHETIC_KEYS.registered });
    await expect(services.boarding.submit(world.policies)).rejects.toThrow();
    expect(world.requests.filter((r) => r.op === 'OP-003')).toHaveLength(1);
  });
});
