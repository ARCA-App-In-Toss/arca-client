import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
test('today detail supports direct edit and delete using cached full answer', async () => {
  const b = bootApp(server, { base: 'server.activeAnswered' });
  await act(() => b.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(button(copy['CPY-F10-016']));
  await findTitle(copy['CPY-F21-001']);
  await userEvent.click(button(copy['CPY-F21-008']));
  await findTitle(copy['CPY-F22-001']);
  const field = await screen.findByRole('textbox', { name: copy['CPY-F22-003'] });
  await waitFor(() => expect(field).toHaveValue('  오늘의 기록\n기억할 순간'));
  fireEvent.change(field, { target: { value: '고친 기록' } });
  await userEvent.click(button(copy['CPY-F22-014']));
  await findTitle(copy['CPY-F21-001']);
  expect(screen.getByText('고친 기록')).toBeInTheDocument();
  expect(opCount(b.world, 'UPDATE_ANSWER')).toBe(1);
  await userEvent.click(button(copy['CPY-F21-009']));
  await screen.findByRole('alertdialog');
  await userEvent.click(button(copy['CPY-F23-007']));
  await findTitle(copy['CPY-F20-001']);
  expect(b.world.answers.size).toBe(0);
  expect(opCount(b.world, 'OP-012')).toBe(1);
  expect(await screen.findByRole('heading', { level: 2, name: copy['CPY-F20-011'] })).toBeInTheDocument();
});
test('a past answer opened from the archive is read, edited and deleted through detail', async () => {
  const world = createMockWorld('server.activeUnanswered');
  const past = world.seedAnswer(SYNTHETIC_KEYS.registered, '지난 합성', {
    dailySemaId: '2026-10-01',
    createdDateKst: '2026-10-01',
  });
  const b = bootApp(server, { world, initialPath: paths.archive });
  await act(() => b.started);
  await findTitle(copy['CPY-F20-001']);
  const row = await waitFor(() => {
    const found = screen.getAllByRole('button').find((el) => el.classList.contains('arca-memory-row'));
    if (!found) throw new Error('row');
    return found;
  });
  await userEvent.click(row);
  await findTitle(copy['CPY-F21-001']);
  expect(await screen.findByText('지난 합성')).toBeInTheDocument();
  expect(opCount(world, 'OP-011')).toBeGreaterThan(0);
  world.answers.delete(past.answerId);
  await userEvent.click(button(copy['CPY-F21-008']));
  await findTitle(copy['CPY-F20-001']);
});
