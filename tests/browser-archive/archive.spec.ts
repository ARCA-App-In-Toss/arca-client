import { expect, test } from '@playwright/test';

test('archive stays unavailable and today remains accessible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: '기록', exact: true }).click();
  await expect(page.getByText('항해 기록 목록을 준비하고 있어요.')).toBeVisible();
  await expect(page.locator('.arca-memory-row')).toHaveCount(0);
  await page.getByRole('button', { name: '오늘의 기록 보기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible();
});
