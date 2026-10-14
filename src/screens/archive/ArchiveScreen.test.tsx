import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { bootApp, findTitle } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const button = (name: string) => screen.getByRole('button', { name });
test('unimplemented archive displays availability notice and makes no list call', async () => {
  const b = bootApp(server, { initialPath: paths.archive });
  await act(() => b.started);
  await findTitle(copy['CPY-F20-001']);
  expect(screen.getByText('항해 기록 목록을 준비하고 있어요.')).toBeInTheDocument();
  expect(b.world.requests.some((r) => r.method === 'GET' && r.path === '/v1/answers')).toBe(false);
  await userEvent.click(button('오늘의 기록 보기'));
  await findTitle(copy['CPY-F10-001']);
});
