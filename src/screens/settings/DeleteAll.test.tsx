import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { mockErrors } from '../../mocks/handlers.ts';
import { createFakeStorage, type FakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy, rootTabLabels } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const hasText = (storage: FakeStorage, text: string) => [...storage.data.values()].some((v) => v.includes(text));
const databaseError = {
  kind: 'error',
  status: 500,
  body: { error: { code: 'DATABASE_ERROR', category: 'MAINTENANCE', requestId: 'synthetic-request' } },
} as const;

async function openDeleteAll() {
  const world = createMockWorld('server.activeUnanswered');
  const storage = createFakeStorage();
  world.seedAnswer(SYNTHETIC_KEYS.registered, '지워질 합성 답변', {
    dailySemaId: 'd-old',
    createdDateKst: '2026-09-01',
  });
  const booted = bootApp(server, { world, storage });
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
  const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
  fireEvent.change(textarea, { target: { value: '기기에 남은 합성 임시본' } });
  await waitFor(() => expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true), { timeout: 3_000 });
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: rootTabLabels.settings }));
  await findTitle(copy['CPY-F30-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-034'] }));
  await findTitle(copy['CPY-F31-001']);
  return { ...booted, storage, world };
}

async function confirmDelete() {
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-010'] }));
  const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F31-011'] });
  expect(within(dialog).getByRole('button', { name: copy['CPY-F31-013'] })).toHaveFocus();
  await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F31-014'] }));
  return dialog;
}

describe('F31 all-data delete through DELETE /v1/members/me', () => {
  test('lists the deleted scope and the confirmed 1-year consent evidence; cancel sends nothing', async () => {
    const { world } = await openDeleteAll();
    for (const id of ['CPY-F31-020', 'CPY-F31-021', 'CPY-F31-022'] as const)
      expect(screen.getByText(copy[id]).tagName).toBe('LI');
    expect(screen.getByText(copy['CPY-F31-023'])).toBeInTheDocument();
    expect(screen.queryByText(copy['CPY-F31-007'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-010'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F31-011'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F31-013'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-009'] }));
    await findTitle(copy['CPY-F30-001']);
    expect(opCount(world, 'OP-013')).toBe(0);
  });

  test('success: local data stays until 204, then the session is re-exchanged as GUEST and the old area is wiped', async () => {
    const { world, storage, services } = await openDeleteAll();
    let release!: () => void;
    world.addFault('OP-013', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    const dialog = await confirmDelete();
    await waitFor(() => expect(opCount(world, 'OP-013')).toBe(1));
    expect(within(dialog).getByRole('button', { name: copy['CPY-F31-013'] })).toBeDisabled();
    expect(await within(dialog).findByText(copy['CPY-F31-015'])).toBeInTheDocument();
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true);
    release();
    await findTitle(copy['CPY-F01-001']);
    expect(services.session.summary?.mode).toBe('GUEST');
    expect(world.answers.size).toBe(0);
    await waitFor(() => expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(false));
    expect(opCount(world, 'OP-013')).toBe(1);
  });

  test('a lost 204 is confirmed by re-exchanging the session, never by resending DELETE', async () => {
    const { world, services } = await openDeleteAll();
    world.addFault('OP-013', { kind: 'lose-response' });
    await confirmDelete();
    await findTitle(copy['CPY-F01-001']);
    expect(services.session.summary?.mode).toBe('GUEST');
    expect(opCount(world, 'OP-013')).toBe(1);
  });

  test('500 keeps every record; the session stays ACTIVE and the same button retries', async () => {
    const { world, storage } = await openDeleteAll();
    world.addFault('OP-013', databaseError);
    await confirmDelete();
    expect(await screen.findByText(copy['CPY-F31-016'])).toBeInTheDocument();
    expect(world.answers.size).toBe(1);
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-018'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F31-011'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F31-014'] }));
    await findTitle(copy['CPY-F01-001']);
    expect(opCount(world, 'OP-013')).toBe(2);
  });

  test('when neither DELETE nor the session check answers, the result stays unconfirmed until rechecked', async () => {
    const { world } = await openDeleteAll();
    world.addFault('OP-013', { kind: 'lose-response' });
    world.addFault('OP-001', mockErrors.maintenance);
    await confirmDelete();
    expect(await screen.findByText(copy['CPY-F31-027'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-029'] }));
    await findTitle(copy['CPY-F01-001']);
    expect(opCount(world, 'OP-013')).toBe(1);
  });
});
