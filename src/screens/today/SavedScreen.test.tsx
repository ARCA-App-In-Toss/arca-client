import { act } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { bootApp, findTitle } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
test('saved route without a response receipt returns to today', async () => {
  const b = bootApp(server, { initialPath: paths.saved });
  await act(() => b.started);
  await findTitle(copy['CPY-F10-001']);
  expect(b.router.state.location.pathname).toBe(paths.today);
});
