import { expect, test } from 'vitest';
import { StorageJournal } from '../../data/storage/journal.ts';
import { createFakeStorage } from '../../mocks/platform.ts';
import { DRAFT_TTL_MS } from '../drafts/draftRepository.ts';
import { AnswerWriteStore } from './answerWriteStore.ts';

test('uncertain mutation payloads expire with local drafts and are never replayed by cleanup', async () => {
  let now = 1000;
  const journal = new StorageJournal(createFakeStorage(), { now: () => now });
  const area = { kind: 'generation', ref: 'synthetic-local-area' } as const;
  await journal.initArea(area);
  const store = new AnswerWriteStore({ journal, area: () => area, now: () => now });
  await store.put('1', { input: { mode: 'UPDATE', answerId: '1' }, content: 'synthetic draft', lastModifiedAt: now });
  now += DRAFT_TTL_MS;
  await store.purgeExpired();
  expect(await store.get('1')).toBeNull();
  expect((await journal.readManifest(area))?.entries).toEqual({});
});
