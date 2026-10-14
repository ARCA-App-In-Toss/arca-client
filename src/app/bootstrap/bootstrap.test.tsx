import { act } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
test('ACTIVE starts on today, GUEST starts on intro without a member mutation', async () => {
  const b = bootApp(server);
  await act(() => b.started);
  await findTitle(copy['CPY-F10-001']);
  expect(b.router.state.location.pathname).toBe(paths.today);
  expect(opCount(b.world, 'OP-003')).toBe(0);
});
test('unknown platform identity does not call session API', async () => {
  const b = bootApp(server, { key: { kind: 'unavailable', reason: 'error' } });
  await act(() => b.started);
  await findTitle(copy['CPY-F90-001']);
  expect(b.world.requests).toHaveLength(0);
});
