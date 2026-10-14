import { act } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { bootApp } from '../test/boot.tsx';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
test('normal app use does not call unavailable analytics endpoint', async () => {
  const b = bootApp(server);
  await act(() => b.started);
  b.services.analytics.record({ name: 'today_sema_viewed', properties: { answerState: 'UNANSWERED' } });
  await b.services.analytics.flush();
  expect(b.services.analytics.pending).toBe(0);
  expect(b.world.requests.some((r) => r.path.includes('analytics'))).toBe(false);
});
