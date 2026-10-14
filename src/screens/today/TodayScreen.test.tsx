import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { bootApp, findTitle } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const button = (name: string) => screen.getByRole('button', { name });
test('displays both question choices using key role and no server role/version', async () => {
  const b = bootApp(server);
  await act(() => b.started);
  await findTitle(copy['CPY-F10-001']);
  expect(screen.getByText(b.world.sema.primaryQuestion.text)).toBeInTheDocument();
  await userEvent.click(button(copy['CPY-F10-006']));
  expect(screen.getByText(b.world.sema.alternateQuestion.text)).toBeInTheDocument();
  await userEvent.click(button(copy['CPY-F10-005']));
  await findTitle(copy['CPY-F11-001']);
  expect(screen.getByText(b.world.sema.alternateQuestion.text)).toBeInTheDocument();
});
test('answered today opens full text without calling unimplemented detail endpoint', async () => {
  const b = bootApp(server, { base: 'server.activeAnswered' });
  await act(() => b.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(button(copy['CPY-F10-016']));
  await findTitle(copy['CPY-F21-001']);
  expect(screen.getByText('오늘의 기록 기억할 순간')).toBeInTheDocument();
  expect(b.world.requests.every((r) => !/^\/v1\/answers\/\d+$/.test(r.path) || r.method !== 'GET')).toBe(true);
});
