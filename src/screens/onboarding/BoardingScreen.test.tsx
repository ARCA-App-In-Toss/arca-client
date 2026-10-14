import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createMockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const button = (name: string) => screen.getByRole('button', { name });
test('loads policies on entry, starts disabled, then signs up with one direct request', async () => {
  const b = bootApp(server, {
    base: 'server.guest',
    key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
    initialPath: paths.join,
  });
  await act(() => b.started);
  await findTitle(copy['CPY-F02-001']);
  expect(button(copy['CPY-F02-010'])).toBeDisabled();
  const boxes = await screen.findAllByRole('checkbox');
  expect(boxes).toHaveLength(2);
  expect(opCount(b.world, 'CONSENT_POLICIES')).toBe(1);
  for (const c of boxes) await userEvent.click(c);
  await userEvent.click(button(copy['CPY-F02-010']));
  await findTitle(copy['CPY-F03-001']);
  expect(opCount(b.world, 'OP-003')).toBe(1);
  expect(b.services.session.summary?.mode).toBe('ACTIVE');
});
test('policy-version rejection displays new versions and resets agreement', async () => {
  const b = bootApp(server, {
    base: 'server.guest',
    key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
    initialPath: paths.join,
  });
  await act(() => b.started);
  for (const c of await screen.findAllByRole('checkbox')) await userEvent.click(c);
  b.world.policies = b.world.policies.map((p) => ({ ...p, version: '2' }));
  await userEvent.click(button(copy['CPY-F02-010']));
  await waitFor(() => expect(button(copy['CPY-F02-010'])).toBeDisabled());
  expect(
    screen
      .getAllByRole('checkbox')
      .every((c) => c.getAttribute('aria-checked') === 'false' || !(c as HTMLInputElement).checked),
  ).toBe(true);
  expect(b.world.members.size).toBe(0);
});
test('policy loading failure offers retry and blocks registration', async () => {
  const world = createMockWorld('server.guest');
  world.addFault('CONSENT_POLICIES', {
    kind: 'error',
    status: 503,
    body: { error: { code: 'MAINTENANCE', category: 'MAINTENANCE', requestId: 'synthetic-r' } },
  });
  const b = bootApp(server, { world, key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered }, initialPath: paths.join });
  await act(() => b.started);
  await screen.findByText('약관을 불러오지 못했어요.');
  expect(button(copy['CPY-F02-010'])).toBeDisabled();
  await userEvent.click(button('다시 불러오기'));
  expect(await screen.findAllByRole('checkbox')).toHaveLength(2);
});
