import { expect, test } from '@playwright/test';
import { answerFirst, onboardAndSkip } from './helpers';

const pages = ['/', '/practice', '/items', '/items/upgrade_counterspell', '/scenarios', '/simulator', '/builds', '/builds/preset:vindicta-current', '/builds/preset:graves-current', '/paths', '/paths/hero_hornet', '/analytics', '/mistakes', '/problems', '/reflect', '/settings', '/active', '/compare?a=upgrade_metal_skin&b=upgrade_tech_purge', '/glossary', '/upgrades', '/upgrades?slot=spirit', '/items/upgrade_magic_storm'];

test('no horizontal scroll on any screen at phone widths (390 and 360)', async ({ page }) => {
  await onboardAndSkip(page);
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 760 });
    for (const url of pages) {
      await page.goto(url);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${url} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test('mobile tab bar and one-thumb practice flow', async ({ page }) => {
  await onboardAndSkip(page);
  await expect(page.locator('.tabbar')).toBeVisible();
  await page.locator('.tabbar').getByText('Ещё').click();
  await expect(page.locator('.more-sheet')).toBeVisible();
  await page.locator('.more-sheet').getByText('Аналитика').click();
  await expect(page).toHaveURL(/\/analytics/);
  await page.goto('/practice');
  await page.getByRole('button', { name: /Начать ·/ }).click();
  await answerFirst(page);
  const next = page.getByRole('button', { name: /Дальше/ });
  await expect(next).toBeInViewport();
  const box = await next.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  await next.click();
  await expect(page.locator('.feedback')).toHaveCount(0);
});
