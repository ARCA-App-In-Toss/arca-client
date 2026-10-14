import { act, screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { bootApp, findTitle } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
test('unimplemented total deletion never sends mutation or clears server/local records', async () => {
  const b = bootApp(server, { base: 'server.activeAnswered', initialPath: paths.deleteAll });
  await act(() => b.started);
  await findTitle(copy['CPY-F31-001']);
  expect(screen.getByText('전체 데이터 삭제 기능을 준비하고 있어요.')).toBeInTheDocument();
  expect(b.world.answers.size).toBe(1);
  expect(b.world.requests.some((r) => r.method === 'DELETE')).toBe(false);
  expect(b.services.session.summary?.mode).toBe('ACTIVE');
});
