import { expect, test, vi } from 'vitest';
import type { ArcaApi } from '../ports/api.ts';
import type { SessionController } from '../session/sessionController.ts';
import { NicknameCoordinator } from './nicknameCoordinator.ts';

test('nickname requests are deduplicated and never use stored receipts', async () => {
  let release!: (v: { memberCode: string; nickname: string | null }) => void;
  const setNickname = vi.fn(
    () =>
      new Promise<{ memberCode: string; nickname: string | null }>((r) => {
        release = r;
      }),
  );
  const syncProfile = vi.fn();
  const session = {
    run: async (_mode: string, call: (auth: { bearer: string }) => Promise<unknown>) => call({ bearer: 'synthetic' }),
  } as SessionController;
  const c = new NicknameCoordinator({
    session,
    api: { setNickname } as unknown as ArcaApi,
    network: { isOffline: async () => false, onReconnect: () => () => {} },
    syncProfile,
  });
  const a = c.save('달빛');
  const b = c.save('다른 값');
  expect(a).toBe(b);
  await Promise.resolve();
  release({ memberCode: 'ARCA-7K2QX', nickname: '달빛' });
  expect(await a).toBe('saved');
  expect(setNickname).toHaveBeenCalledTimes(1);
  expect(setNickname).toHaveBeenCalledWith({ bearer: 'synthetic' }, '달빛');
  expect(syncProfile).toHaveBeenCalled();
});
