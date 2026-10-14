import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const button = (name: string) => screen.getByRole('button', { name });
test('profile and nickname use member fields and direct response', async () => {
  const b = bootApp(server, { initialPath: paths.settings });
  await act(() => b.started);
  await findTitle(copy['CPY-F30-001']);
  await screen.findAllByText('ARCA-7K2QX');
  await userEvent.click(button(copy['CPY-F30-007']));
  const field = await screen.findByRole('textbox', { name: copy['CPY-F30-008'] });
  await userEvent.type(field, '달빛');
  await userEvent.click(button(copy['CPY-F30-015']));
  await waitFor(() => expect(b.world.members.get(SYNTHETIC_KEYS.registered)?.nickname).toBe('달빛'));
  expect(opCount(b.world, 'OP-004')).toBe(1);
});
test('settings obtains policy URLs from separate endpoint', async () => {
  const b = bootApp(server, { initialPath: paths.settings });
  await act(() => b.started);
  await findTitle(copy['CPY-F30-001']);
  await userEvent.click(button(copy['CPY-F30-026']));
  await waitFor(() => expect(opCount(b.world, 'CONSENT_POLICIES')).toBe(1));
});
