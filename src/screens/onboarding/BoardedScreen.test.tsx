import { act, screen } from '@testing-library/react';
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
async function joined() {
  const b = bootApp(server, {
    base: 'server.guest',
    key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
    initialPath: paths.join,
  });
  await act(() => b.started);
  for (const c of await screen.findAllByRole('checkbox')) await userEvent.click(c);
  await userEvent.click(button(copy['CPY-F02-010']));
  await findTitle(copy['CPY-F03-001']);
  return b;
}
test('shows member code and skips optional nickname without request', async () => {
  const b = await joined();
  expect(await screen.findByText('ARCA-NEW01')).toBeInTheDocument();
  await userEvent.click(button(copy['CPY-F03-013']));
  await findTitle(copy['CPY-F10-001']);
  expect(opCount(b.world, 'OP-004')).toBe(0);
});
test('sets nickname through profile response and enters today', async () => {
  const b = await joined();
  await userEvent.type(screen.getByRole('textbox', { name: copy['CPY-F03-018'] }), '달빛');
  await userEvent.click(button(copy['CPY-F03-013']));
  await findTitle(copy['CPY-F10-001']);
  expect(b.world.members.get(SYNTHETIC_KEYS.unregistered)?.nickname).toBe('달빛');
  expect(opCount(b.world, 'OP-004')).toBe(1);
});
