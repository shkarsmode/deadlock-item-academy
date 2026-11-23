import { Page, expect } from '@playwright/test';

/** Every test starts with an empty browser profile: go through onboarding quickly (skip diagnostic). */
export async function onboardAndSkip(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Что полезнее сегодня')).toBeVisible();
}

/** Answers the current question with the first option (handles the confidence step and two-step questions). */
export async function answerFirst(page: Page): Promise<void> {
  const diag = page.getByText('Шаг 1 из 2');
  if (await diag.isVisible().catch(() => false)) {
    await page.keyboard.press('1');
    await page.getByRole('button', { name: /Шаг 2/ }).click();
  }
  const recall = page.locator('input.recall-input');
  if (await recall.isVisible().catch(() => false)) {
    await recall.fill('Metal Skin');
    await recall.press('Enter');
  } else if (await page.locator('.surgery').isVisible().catch(() => false)) {
    await page.locator('.chip.add').first().click();
    await page.getByRole('button', { name: 'Готово' }).click();
  } else {
    await page.keyboard.press('1');
  }
  // The confidence step renders after the answer: wait for it or for the feedback, whichever comes.
  const conf = page.locator('.confidence');
  const feedback = page.locator('.feedback');
  await expect(conf.or(feedback).first()).toBeVisible();
  if (await conf.isVisible()) await page.keyboard.press('e');
  await expect(feedback).toBeVisible();
}
