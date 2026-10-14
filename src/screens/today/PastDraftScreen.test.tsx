import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
test('DATE_CHANGED preserves draft and moves to past-draft view without saving', async () => {
  const b = bootApp(server);
  await act(() => b.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(button(copy['CPY-F10-005']));
  const field = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
  await waitFor(() => expect(field).not.toHaveAttribute('readonly'));
  fireEvent.change(field, { target: { value: '날짜가 바뀌어도 보관할 글' } });
  b.world.advanceDayOnFirstCreate = true;
  await userEvent.click(button(copy['CPY-F11-018']));
  await findTitle(copy['CPY-F13-001']);
  expect(await screen.findByRole('textbox', { name: '작성한 내용' })).toHaveValue('날짜가 바뀌어도 보관할 글');
  expect(b.world.answers.size).toBe(0);
});
