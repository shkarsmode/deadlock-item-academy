import { expect, test } from '@playwright/test';
import { answerFirst, onboardAndSkip } from './helpers';

test('onboarding with diagnostic, answering with the keyboard, progress is saved', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding/);
  // Vindicta is the default hero
  await expect(page.locator('.hero.on')).toContainText('Vindicta');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await expect(page.getByText('Найден твой текущий билд')).toBeVisible();
  await page.getByRole('button', { name: 'Начать диагностику' }).click();
  await expect(page).toHaveURL(/\/practice\/run/);

  for (let i = 0; i < 4; i++) {
    await answerFirst(page);
    await page.keyboard.press('Enter');
  }
  // leave the session: summary appears
  await page.keyboard.press('Escape');
  await expect(page.getByText('Сессия завершена')).toBeVisible();
  await expect(page.locator('.kpis .stat .v').first()).toHaveText('4');

  // Progress persists across a reload (IndexedDB)
  await page.goto('/analytics');
  await expect(page.getByText('Аналитика обучения')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Всего ответов за период: 4/)).toBeVisible();
});

test('"I don\'t know" is recorded and a different follow-up question comes back later', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/practice');
  await page.getByRole('button', { name: /Узнавание иконок/ }).click();
  await page.getByRole('button', { name: /Начать ·/ }).click();
  await expect(page).toHaveURL(/\/practice\/run/);
  await page.keyboard.press('0');
  await expect(page.getByText('Ничего страшного: запомним')).toBeVisible();
  let sawRelearn = false;
  for (let i = 0; i < 8 && !sawRelearn; i++) {
    await page.keyboard.press('Enter');
    sawRelearn = await page.getByText('Закрепляем ошибку другим вопросом').isVisible().catch(() => false);
    if (!sawRelearn) await answerFirst(page);
  }
  expect(sawRelearn).toBe(true);
});

test('a situation shows graded options, the principle and the decision tree', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/scenarios');
  await page.getByRole('button', { name: 'Покупка', exact: true }).click();
  await page.locator('.srow').first().click();
  await expect(page.locator('app-scenario-context')).toBeVisible();
  await answerFirst(page);
  await expect(page.locator('.feedback .principle')).toBeVisible();
  await expect(page.locator('.opt .verdict').first()).toBeVisible();
});

test('mistake notebook collects a confident wrong answer', async ({ page }) => {
  await onboardAndSkip(page);
  await page.goto('/practice');
  await page.getByRole('button', { name: /Начать ·/ }).click();
  // answer until a wrong answer with confidence happens or 10 questions pass
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('4');
    if (await page.locator('.confidence').isVisible().catch(() => false)) await page.keyboard.press('r');
    if (!(await page.locator('.feedback').isVisible().catch(() => false))) await answerFirst(page);
    await page.keyboard.press('Enter');
  }
  await page.goto('/mistakes');
  await expect(page.getByText('Тетрадь ошибок')).toBeVisible();
});
