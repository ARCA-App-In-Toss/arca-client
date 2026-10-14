import { expect, test } from 'vitest';
import { AnalyticsQueue } from './analyticsQueue.ts';

test('analytics stays disabled until the backend endpoint exists', async () => {
  const queue = new AnalyticsQueue();
  expect(queue.record({ name: 'onboarding_started', properties: {} })).toBe(false);
  queue.recordOnce('onboarding_started', { name: 'onboarding_started', properties: {} });
  queue.hint();
  await queue.flush();
  expect(queue.pending).toBe(0);
});
